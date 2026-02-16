#!/usr/bin/env node

/**
 * clearance.opinion.engine — CLI entry point.
 *
 * Commands:
 *   coe check <name> [--channels github,npm,pypi] [--org myorg] [--output dir]
 *   coe report <run-file.json>
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fail, warn } from "./lib/errors.mjs";
import { hashObject } from "./lib/hash.mjs";
import { createGitHubAdapter } from "./adapters/github.mjs";
import { createNpmAdapter } from "./adapters/npm.mjs";
import { createPyPIAdapter } from "./adapters/pypi.mjs";
import { generateAllVariants } from "./variants/index.mjs";
import { scoreOpinion, classifyFindings } from "./scoring/opinion.mjs";
import { writeRun, renderRunMd } from "./renderers/report.mjs";

const VERSION = "0.1.0";
const VALID_CHANNELS = ["github", "npm", "pypi"];

// ── CLI parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`clearance.opinion.engine v${VERSION}

Usage:
  coe check <name> [options]    Check name availability and produce opinion
  coe report <file>             Re-render an existing run.json as Markdown

Options:
  --channels <list>     Comma-separated channels (default: github,npm,pypi)
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

// ── Command: check ─────────────────────────────────────────────

if (command !== "check") {
  fail("COE.INIT.NO_ARGS", `Unknown command: ${command}`, {
    fix: "Use 'check' or 'report'. Run with --help for usage.",
  });
}

const candidateName = args[1];
if (!candidateName) {
  fail("COE.INIT.NO_ARGS", "No candidate name provided", {
    fix: "Usage: coe check <name>",
  });
}

const channelsStr = getFlag("--channels") || "github,npm,pypi";
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

  // 1. Build intake
  const intake = {
    candidates: [{ mark: candidateName, style: "word" }],
    goodsServices: "Software tool / package",
    geographies: [{ type: "region", code: "GLOBAL" }],
    channels: channels.map((c) => {
      if (c === "github") return "open-source";
      if (c === "npm") return "open-source";
      if (c === "pypi") return "open-source";
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
    const gh = createGitHubAdapter();

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
    const npm = createNpmAdapter();
    const { check, evidence } = await npm.checkPackage(candidateName, { now });
    allChecks.push(check);
    allEvidence.push(evidence);
  }

  if (channels.includes("pypi")) {
    const pypi = createPyPIAdapter();
    const { check, evidence } = await pypi.checkPackage(candidateName, { now });
    allChecks.push(check);
    allEvidence.push(evidence);
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
        github: "0.1.0",
        npm: "0.1.0",
        pypi: "0.1.0",
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
  const { jsonPath, mdPath } = writeRun(run, runOutputDir);

  // 8. Print summary
  const tierEmoji =
    opinion.tier === "green" ? "\u{1F7E2}" : opinion.tier === "yellow" ? "\u{1F7E1}" : "\u{1F534}";
  console.log(`\n${tierEmoji} ${opinion.tier.toUpperCase()} — ${candidateName}\n`);
  console.log(opinion.summary);
  console.log(`\nChecks: ${allChecks.length} | Findings: ${findings.length} | Evidence: ${allEvidence.length}`);
  console.log(`\nOutput: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
}

main().catch((err) => {
  fail("COE.MAIN.FATAL", err.message, { nerd: err.stack });
});
