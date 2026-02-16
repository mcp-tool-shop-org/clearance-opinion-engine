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
import { createCollisionRadarAdapter } from "./adapters/collision-radar.mjs";
import { createCratesIoAdapter } from "./adapters/cratesio.mjs";
import { createDockerHubAdapter } from "./adapters/dockerhub.mjs";
import { createHuggingFaceAdapter } from "./adapters/huggingface.mjs";
import { loadCorpus, compareAgainstCorpus } from "./adapters/corpus.mjs";
import { createCache } from "./lib/cache.mjs";
import { generateAllVariants, selectTopN } from "./variants/index.mjs";
import { scoreOpinion, classifyFindings } from "./scoring/opinion.mjs";
import { writeRun, renderRunMd } from "./renderers/report.mjs";

const VERSION = "0.4.0";

// ── Channel system ──────────────────────────────────────────────
const CORE_CHANNELS = ["github", "npm", "pypi", "domain"];
const DEV_CHANNELS = ["cratesio", "dockerhub"];
const AI_CHANNELS = ["huggingface"];
const ALL_CHANNELS = [...CORE_CHANNELS, ...DEV_CHANNELS, ...AI_CHANNELS];
const CHANNEL_GROUPS = {
  core: CORE_CHANNELS,
  dev: DEV_CHANNELS,
  ai: AI_CHANNELS,
  all: ALL_CHANNELS,
};

/**
 * Parse --channels flag with support for:
 *   explicit list:  --channels github,npm
 *   group alias:    --channels all | core | dev | ai
 *   additive:       --channels +cratesio,+dockerhub  (adds to CORE default)
 */
function parseChannels(raw) {
  if (!raw) return [...CORE_CHANNELS];

  // Group alias (single keyword)
  if (CHANNEL_GROUPS[raw]) return [...CHANNEL_GROUPS[raw]];

  const parts = raw.split(",").map((c) => c.trim()).filter(Boolean);

  // Additive mode: all parts start with '+'
  const allAdditive = parts.every((p) => p.startsWith("+"));
  if (allAdditive) {
    const additions = parts.map((p) => p.slice(1));
    for (const ch of additions) {
      if (!ALL_CHANNELS.includes(ch)) {
        fail("COE.INIT.BAD_CHANNEL", `Unknown channel: ${ch}`, {
          fix: `Valid channels: ${ALL_CHANNELS.join(", ")}`,
        });
      }
    }
    const result = [...CORE_CHANNELS];
    for (const ch of additions) {
      if (!result.includes(ch)) result.push(ch);
    }
    return result;
  }

  // Explicit list
  for (const ch of parts) {
    if (!ALL_CHANNELS.includes(ch)) {
      fail("COE.INIT.BAD_CHANNEL", `Unknown channel: ${ch}`, {
        fix: `Valid channels: ${ALL_CHANNELS.join(", ")}. Groups: core, dev, ai, all. Additive: +cratesio,+dockerhub`,
      });
    }
  }
  return parts;
}

// ── CLI parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`clearance.opinion.engine v${VERSION}

Usage:
  coe check <name> [options]    Check name availability and produce opinion
  coe report <file>             Re-render an existing run.json as Markdown
  coe replay <dir>              Verify manifest and regenerate outputs from run.json

Options:
  --channels <list>     Channels to check (default: github,npm,pypi,domain)
                        Groups: core, dev, ai, all
                        Additive: +cratesio,+dockerhub (adds to core default)
  --org <name>          GitHub org to check (for github channel)
  --dockerNamespace <ns>  Docker Hub namespace (required for dockerhub channel)
  --hfOwner <owner>     Hugging Face owner (required for huggingface channel)
  --output <dir>        Output directory (default: reports/)
  --risk <level>        Risk tolerance: conservative|balanced|aggressive (default: conservative)
  --radar               Enable collision radar (GitHub + npm search for similar names)
  --corpus <path>       Path to a JSON corpus of known marks to compare against
  --cache-dir <path>    Directory for caching adapter responses (opt-in)
  --max-age-hours <n>   Cache TTL in hours (default: 24, requires --cache-dir)
  --fuzzyQueryMode <m>  Fuzzy variant query mode: off|registries|all (default: registries)
  --variantBudget <n>   Max fuzzy variants to query per channel (default: 12, max: 30)
  --help, -h            Show this help
  --version, -v         Show version

Channels:
  core:    github, npm, pypi, domain (default)
  dev:     cratesio, dockerhub
  ai:      huggingface
  all:     all of the above`);
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

  const channels = parseChannels(getFlag("--channels"));

  const org = getFlag("--org");
  const dockerNamespace = getFlag("--dockerNamespace");
  const hfOwner = getFlag("--hfOwner");
  const outputDir = getFlag("--output") || "reports";
  const riskTolerance = getFlag("--risk") || "conservative";
  const useRadar = args.includes("--radar");
  const corpusPath = getFlag("--corpus");
  const cacheDir = getFlag("--cache-dir");
  const maxAgeHours = parseInt(getFlag("--max-age-hours") || "24", 10);
  const fuzzyQueryMode = getFlag("--fuzzyQueryMode") || "registries";
  const variantBudget = Math.min(parseInt(getFlag("--variantBudget") || "12", 10), 30);

  /**
   * Wrap an adapter call with cache.
   * Returns cached result or fetches fresh + stores in cache.
   * Sets `cacheHit` on each check in the result.
   */
  async function withCache(cache, adapter, version, query, fetchFn) {
    if (!cache) {
      const result = await fetchFn();
      // Mark as not from cache
      if (result.check) result.check.cacheHit = false;
      if (result.checks) result.checks.forEach((c) => { c.cacheHit = false; });
      return result;
    }

    const cached = cache.get(adapter, query, version);
    if (cached) {
      const result = cached.data;
      if (result.check) result.check.cacheHit = true;
      if (result.checks) result.checks.forEach((c) => { c.cacheHit = true; });
      return result;
    }

    const result = await fetchFn();
    if (result.check) result.check.cacheHit = false;
    if (result.checks) result.checks.forEach((c) => { c.cacheHit = false; });
    cache.set(adapter, query, version, result);
    return result;
  }

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

    // Create cache if requested
    const cache = cacheDir ? createCache(resolve(cacheDir), { maxAgeHours }) : null;

    // 1. Build intake
    const intake = {
      candidates: [{ mark: candidateName, style: "word" }],
      goodsServices: "Software tool / package",
      geographies: [{ type: "region", code: "GLOBAL" }],
      channels: channels.map((c) => {
        if (c === "github") return "open-source";
        if (c === "npm") return "open-source";
        if (c === "pypi") return "open-source";
        if (c === "cratesio") return "open-source";
        if (c === "dockerhub") return "SaaS";
        if (c === "huggingface") return "SaaS";
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
        const result = await withCache(cache, "github.org", VERSION, { org }, async () => {
          return gh.checkOrg(org, { now });
        });
        allChecks.push(result.check);
        allEvidence.push(result.evidence);
      }

      const repoOwner = org || candidateName;
      const result = await withCache(cache, "github.repo", VERSION, { owner: repoOwner, repo: candidateName }, async () => {
        return gh.checkRepo(repoOwner, candidateName, { now });
      });
      allChecks.push(result.check);
      allEvidence.push(result.evidence);
    }

    if (channels.includes("npm")) {
      const npm = createNpmAdapter(fetchWithRetry);
      const result = await withCache(cache, "npm", VERSION, { name: candidateName }, async () => {
        return npm.checkPackage(candidateName, { now });
      });
      allChecks.push(result.check);
      allEvidence.push(result.evidence);
    }

    if (channels.includes("pypi")) {
      const pypi = createPyPIAdapter(fetchWithRetry);
      const result = await withCache(cache, "pypi", VERSION, { name: candidateName }, async () => {
        return pypi.checkPackage(candidateName, { now });
      });
      allChecks.push(result.check);
      allEvidence.push(result.evidence);
    }

    if (channels.includes("domain")) {
      const domain = createDomainAdapter(fetchWithRetry);
      for (const tld of domain.tlds) {
        const result = await withCache(cache, "domain", VERSION, { name: candidateName, tld }, async () => {
          return domain.checkDomain(candidateName, tld, { now });
        });
        allChecks.push(result.check);
        allEvidence.push(result.evidence);
      }
    }

    // 3a. New ecosystem adapters

    if (channels.includes("cratesio")) {
      const crates = createCratesIoAdapter(fetchWithRetry);
      const result = await withCache(cache, "cratesio", VERSION, { name: candidateName }, async () => {
        return crates.checkCrate(candidateName, { now });
      });
      allChecks.push(result.check);
      allEvidence.push(result.evidence);
    }

    if (channels.includes("dockerhub")) {
      const docker = createDockerHubAdapter(fetchWithRetry);
      const result = await withCache(cache, "dockerhub", VERSION, { namespace: dockerNamespace, name: candidateName }, async () => {
        return docker.checkRepo(dockerNamespace, candidateName, { now });
      });
      allChecks.push(result.check);
      allEvidence.push(result.evidence);
    }

    if (channels.includes("huggingface")) {
      const hf = createHuggingFaceAdapter(fetchWithRetry);
      const modelResult = await withCache(cache, "huggingface.model", VERSION, { owner: hfOwner, name: candidateName }, async () => {
        return hf.checkModel(hfOwner, candidateName, { now });
      });
      allChecks.push(modelResult.check);
      allEvidence.push(modelResult.evidence);

      const spaceResult = await withCache(cache, "huggingface.space", VERSION, { owner: hfOwner, name: candidateName }, async () => {
        return hf.checkSpace(hfOwner, candidateName, { now });
      });
      allChecks.push(spaceResult.check);
      allEvidence.push(spaceResult.evidence);
    }

    // 3b. Collision radar (indicative market-usage signals)
    if (useRadar) {
      const radar = createCollisionRadarAdapter(fetchWithRetry, {
        similarityThreshold: 0.70,
      });
      const radarResult = await withCache(cache, "collision-radar", VERSION, { name: candidateName }, async () => {
        return radar.scanAll(candidateName, { now });
      });
      allChecks.push(...(radarResult.checks || []));
      allEvidence.push(...(radarResult.evidence || []));
    }

    // 3c. Fuzzy variant registry queries
    if (fuzzyQueryMode !== "off") {
      const fuzzyList = variants.items?.[0]?.fuzzyVariants || [];
      const variantCandidates = selectTopN(fuzzyList, variantBudget);

      // Build list of registry adapters to query (npm, pypi, cratesio only)
      const registryAdapters = [];
      if (channels.includes("npm")) {
        const npm = createNpmAdapter(fetchWithRetry);
        registryAdapters.push(["npm", (name, opts) => npm.checkPackage(name, opts)]);
      }
      if (channels.includes("pypi")) {
        const pypi = createPyPIAdapter(fetchWithRetry);
        registryAdapters.push(["pypi", (name, opts) => pypi.checkPackage(name, opts)]);
      }
      if (channels.includes("cratesio")) {
        const crates = createCratesIoAdapter(fetchWithRetry);
        registryAdapters.push(["cratesio", (name, opts) => crates.checkCrate(name, opts)]);
      }

      for (const variant of variantCandidates) {
        for (const [adapterName, checkFn] of registryAdapters) {
          const result = await withCache(cache, `fuzzy.${adapterName}`, VERSION, { name: variant }, async () => {
            return checkFn(variant, { now });
          });
          // Mark as variant check for scoring
          result.check.query.isVariant = true;
          result.check.query.originalCandidate = candidateName;
          allChecks.push(result.check);
          allEvidence.push(result.evidence);
        }
      }
    }

    // 4. Classify findings
    const findings = classifyFindings(allChecks, variants);

    // 4b. Corpus comparison (user-provided known marks)
    if (corpusPath) {
      const absCorpusPath = resolve(corpusPath);
      if (!existsSync(absCorpusPath)) {
        fail("COE.CORPUS.NOT_FOUND", `Corpus file not found: ${absCorpusPath}`, {
          fix: "Check the --corpus file path",
        });
      }
      const corpus = loadCorpus(absCorpusPath);
      const corpusResult = compareAgainstCorpus(candidateName, corpus, {
        threshold: 0.70,
      });
      findings.push(...corpusResult.findings);
      allEvidence.push(...corpusResult.evidence);
    }

    // 5. Score opinion
    const opinion = scoreOpinion(
      { checks: allChecks, findings, variants, evidence: allEvidence },
      { riskTolerance }
    );

    // 6. Build run object
    const inputsSha256 = hashObject(intake);
    const runId = `run.${dateStr}.${inputsSha256.slice(0, 8)}`;

    const adapterVersions = {};
    for (const ch of channels) {
      adapterVersions[ch] = VERSION;
    }
    if (useRadar) {
      adapterVersions.collision_radar = VERSION;
    }

    const run = {
      schemaVersion: "1.0.0",
      run: {
        runId,
        engineVersion: VERSION,
        createdAt: now,
        inputsSha256,
        adapterVersions,
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

    if (cache) {
      const cacheStats = cache.stats();
      console.log(`\nCache: ${cacheStats.entries} entries, ${cacheStats.totalBytes} bytes (${cacheDir})`);
    }
  }

  main().catch((err) => {
    fail("COE.MAIN.FATAL", err.message, { nerd: err.stack });
  });
} else {
  fail("COE.INIT.NO_ARGS", `Unknown command: ${command}`, {
    fix: "Use 'check', 'report', or 'replay'. Run with --help for usage.",
  });
}
