#!/usr/bin/env node

/**
 * clearance.opinion.engine — CLI entry point.
 *
 * Commands:
 *   coe check <name> [--channels github,npm,pypi,domain] [--org myorg] [--output dir]
 *   coe report <run-file.json>
 *   coe replay <run-directory>
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fail, warn } from "./lib/errors.mjs";
import { hashObject, hashFile } from "./lib/hash.mjs";
import { retryFetch } from "./lib/retry.mjs";
import { createGitHubAdapter } from "./adapters/github.mjs";
import { createNpmAdapter } from "./adapters/npm.mjs";
import { createPyPIAdapter } from "./adapters/pypi.mjs";
import { createDomainAdapter } from "./adapters/domain.mjs";
import { generateAllVariants } from "./variants/index.mjs";
import { scoreOpinion, classifyFindings } from "./scoring/opinion.mjs";
import { writeRun, renderRunMd } from "./renderers/report.mjs";

const VERSION = "0.2.0";
const VALID_CHANNELS = ["github", "npm", "pypi", "domain"];

// ── CLI parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`clearance.opinion.engine v${VERSION}

Usage:
  coe check <name> [options]    Check name availability and produce opinion
  coe report <file>             Re-render an existing run.json as Markdown
  coe replay <dir>              Verify manifest and regenerate outputs from run.json

Options:
  --channels <list>     Comma-separated channels (default: github,npm,pypi,domain)
  --org <name>          GitHub org to check (for github channel)
  --output <dir>        Output directory (default: reports/)
  --risk <level>        Risk tolerance: conservative|balanced|aggressive (default: conservative)
  --help, -h            Show this help
  --version, -v         Show version`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}

const command = args[0];

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

// ── Command: report ────────────────────────────────────────────

if (command === "report") {
  const filePath = args[1];
  if (!filePath) {
    fail("COE.INIT.NO_ARGS", "No run file specified", {
      fix: "Usage: coe report <run-file.json>",
    });
  }

  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    fail("COE.RENDER.WRITE_FAIL", `File not found: ${absPath}`, {
      fix: "Check the file path",
    });
  }

  try {
    const run = JSON.parse(readFileSync(absPath, "utf8"));
    const md = renderRunMd(run);
    console.log(md);
  } catch (err) {
    fail("COE.RENDER.WRITE_FAIL", `Failed to parse run file: ${err.message}`, {
      path: absPath,
    });
  }
  process.exit(0);
}

// ── Command: replay ────────────────────────────────────────────

if (command === "replay") {
  const runDir = args[1];
  if (!runDir) {
    fail("COE.INIT.NO_ARGS", "No run directory specified", {
      fix: "Usage: coe replay <run-directory>",
    });
  }

  const absDir = resolve(runDir);
  const runJsonPath = join(absDir, "run.json");
  if (!existsSync(runJsonPath)) {
    fail("COE.REPLAY.NO_RUN", `No run.json found in ${absDir}`, {
      fix: "Specify a directory containing a run.json file",
    });
  }

  async function replay() {
    const run = JSON.parse(readFileSync(runJsonPath, "utf8"));

    // 1. Verify manifest if present
    const manifestPath = join(absDir, "manifest.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      for (const entry of manifest.files || []) {
        const filePath = join(absDir, entry.path);
        if (!existsSync(filePath)) {
          warn("COE.REPLAY.HASH_MISMATCH", `File missing: ${entry.path}`);
          continue;
        }
        const actual = await hashFile(filePath);
        if (actual !== entry.sha256) {
          warn("COE.REPLAY.HASH_MISMATCH", `File ${entry.path} has changed since manifest was generated`);
        }
      }
    }

    // 2. Regenerate outputs from run.json
    const replayDir = join(absDir, "replay");
    const { jsonPath, mdPath, htmlPath, summaryPath } = writeRun(run, replayDir);

    // 3. Compare regenerated outputs with originals
    const origMdPath = join(absDir, "run.md");
    if (existsSync(origMdPath)) {
      const origMd = readFileSync(origMdPath, "utf8");
      const newMd = readFileSync(mdPath, "utf8");
      if (origMd !== newMd) {
        warn("COE.REPLAY.MD_DIFF", "Regenerated Markdown differs from original");
      }
    }

    console.log(`Replay complete. Output: ${replayDir}`);
    console.log(`  JSON:    ${jsonPath}`);
    console.log(`  MD:      ${mdPath}`);
    console.log(`  HTML:    ${htmlPath}`);
    console.log(`  Summary: ${summaryPath}`);
  }

  replay()
    .then(() => process.exit(0))
    .catch((err) => {
      fail("COE.REPLAY.FATAL", err.message, { nerd: err.stack });
    });

  // Prevent falling through to check command
} else if (command === "check") {
  // ── Command: check ─────────────────────────────────────────────

  const candidateName = args[1];
  if (!candidateName) {
    fail("COE.INIT.NO_ARGS", "No candidate name provided", {
      fix: "Usage: coe check <name>",
    });
  }

  const channelsStr = getFlag("--channels") || "github,npm,pypi,domain";
  const channels = channelsStr.split(",").map((c) => c.trim());
  for (const ch of channels) {
    if (!VALID_CHANNELS.includes(ch)) {
      fail("COE.INIT.BAD_CHANNEL", `Unknown channel: ${ch}`, {
        fix: `Valid channels: ${VALID_CHANNELS.join(", ")}`,
      });
    }
  }

  const org = getFlag("--org");
  const outputDir = getFlag("--output") || "reports";
  const riskTolerance = getFlag("--risk") || "conservative";

  // ── Main pipeline ──────────────────────────────────────────────

  async function main() {
    const now = new Date().toISOString();
    const dateStr = now.slice(0, 10);
    const runOutputDir = resolve(join(outputDir, dateStr));

    // Create retry-wrapped fetch
    const fetchWithRetry = retryFetch(globalThis.fetch, {
      maxRetries: 2,
      baseDelayMs: 500,
    });

    // 1. Build intake
    const intake = {
      candidates: [{ mark: candidateName, style: "word" }],
      goodsServices: "Software tool / package",
      geographies: [{ type: "region", code: "GLOBAL" }],
      channels: channels.map((c) => {
        if (c === "github") return "open-source";
        if (c === "npm") return "open-source";
        if (c === "pypi") return "open-source";
        if (c === "domain") return "other";
        return "other";
      }),
      riskTolerance,
    };

    // 2. Generate variants
    const variants = generateAllVariants([candidateName], { now });

    // 3. Create adapters + run checks
    const allChecks = [];
    const allEvidence = [];

    if (channels.includes("github")) {
      const gh = createGitHubAdapter(fetchWithRetry);

      if (org) {
        const { check, evidence } = await gh.checkOrg(org, { now });
        allChecks.push(check);
        allEvidence.push(evidence);
      }

      const repoOwner = org || candidateName;
      const { check, evidence } = await gh.checkRepo(
        repoOwner,
        candidateName,
        { now }
      );
      allChecks.push(check);
      allEvidence.push(evidence);
    }

    if (channels.includes("npm")) {
      const npm = createNpmAdapter(fetchWithRetry);
      const { check, evidence } = await npm.checkPackage(candidateName, { now });
      allChecks.push(check);
      allEvidence.push(evidence);
    }

    if (channels.includes("pypi")) {
      const pypi = createPyPIAdapter(fetchWithRetry);
      const { check, evidence } = await pypi.checkPackage(candidateName, { now });
      allChecks.push(check);
      allEvidence.push(evidence);
    }

    if (channels.includes("domain")) {
      const domain = createDomainAdapter(fetchWithRetry);
      for (const tld of domain.tlds) {
        const { check, evidence } = await domain.checkDomain(candidateName, tld, { now });
        allChecks.push(check);
        allEvidence.push(evidence);
      }
    }

    // 4. Classify findings
    const findings = classifyFindings(allChecks, variants);

    // 5. Score opinion
    const opinion = scoreOpinion(
      { checks: allChecks, findings, variants },
      { riskTolerance }
    );

    // 6. Build run object
    const inputsSha256 = hashObject(intake);
    const runId = `run.${dateStr}.${inputsSha256.slice(0, 8)}`;

    const run = {
      schemaVersion: "1.0.0",
      run: {
        runId,
        engineVersion: VERSION,
        createdAt: now,
        inputsSha256,
        adapterVersions: {
          github: VERSION,
          npm: VERSION,
          pypi: VERSION,
          domain: VERSION,
        },
      },
      intake,
      variants,
      checks: allChecks,
      findings,
      evidence: allEvidence,
      opinion,
    };

    // 7. Write output
    const { jsonPath, mdPath, htmlPath, summaryPath } = writeRun(run, runOutputDir);

    // 8. Print summary
    const tierEmoji =
      opinion.tier === "green" ? "\u{1F7E2}" : opinion.tier === "yellow" ? "\u{1F7E1}" : "\u{1F534}";
    console.log(`\n${tierEmoji} ${opinion.tier.toUpperCase()} — ${candidateName}\n`);
    console.log(opinion.summary);
    console.log(`\nScore: ${opinion.scoreBreakdown?.overallScore ?? "?"}/100`);
    console.log(`Checks: ${allChecks.length} | Findings: ${findings.length} | Evidence: ${allEvidence.length}`);
    console.log(`\nOutput: ${jsonPath}`);
    console.log(`Report: ${mdPath}`);
    console.log(`HTML:   ${htmlPath}`);
    console.log(`Summary: ${summaryPath}`);
  }

  main().catch((err) => {
    fail("COE.MAIN.FATAL", err.message, { nerd: err.stack });
  });
} else {
  fail("COE.INIT.NO_ARGS", `Unknown command: ${command}`, {
    fix: "Use 'check', 'report', or 'replay'. Run with --help for usage.",
  });
}
