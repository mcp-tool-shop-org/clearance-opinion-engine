#!/usr/bin/env node

/**
 * clearance.opinion.engine — CLI entry point.
 *
 * Commands:
 *   coe check <name>        Check name availability and produce opinion
 *   coe batch <file>        Check multiple names from a file
 *   coe refresh <dir>       Re-run stale checks on an existing run
 *   coe corpus init         Create a new corpus.json template
 *   coe corpus add          Add a mark to an existing corpus file
 *   coe publish <dir>       Copy run artifacts for website consumption
 *   coe report <file>       Re-render an existing run.json as Markdown
 *   coe replay <dir>        Verify manifest and regenerate outputs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fail, warn } from "./lib/errors.mjs";
import { hashFile } from "./lib/hash.mjs";
import { createCache } from "./lib/cache.mjs";
import { writeRun, renderRunMd } from "./renderers/report.mjs";
import { runCheck } from "./pipeline.mjs";
import { runBatch } from "./batch/runner.mjs";
import { parseBatchInput } from "./batch/input.mjs";
import { writeBatchOutput } from "./batch/writer.mjs";
import { refreshRun } from "./refresh.mjs";
import { corpusInit, corpusAdd } from "./corpus/cli.mjs";
import { publishRun } from "./publish.mjs";
import { runDoctor } from "./doctor.mjs";

const VERSION = "0.7.0";

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
  coe check <name> [options]       Check name availability and produce opinion
  coe batch <file> [options]       Check multiple names from a .txt or .json file
  coe refresh <dir> [options]      Re-run stale checks on an existing run
  coe corpus init [--output path]  Create a new corpus.json template
  coe corpus add [options]         Add a mark to an existing corpus file
  coe publish <dir> --out <dir>    Copy run artifacts for website consumption
  coe report <file>                Re-render an existing run.json as Markdown
  coe replay <dir>                 Verify manifest and regenerate outputs from run.json
  coe doctor                       Run environment diagnostics

Check options:
  --channels <list>     Channels to check (default: github,npm,pypi,domain)
                        Groups: core, dev, ai, all
                        Additive: +cratesio,+dockerhub (adds to core default)
  --org <name>          GitHub org to check (for github channel)
  --dockerNamespace <ns>  Docker Hub namespace (required for dockerhub channel)
  --hfOwner <owner>     Hugging Face owner (required for huggingface channel)
  --output <dir>        Output directory (default: reports/)
  --risk <level>        Risk tolerance: conservative|balanced|aggressive (default: conservative)
  --radar               Enable collision radar (GitHub + npm + crates.io + Docker Hub search)
  --suggest             Generate safer alternative name suggestions
  --corpus <path>       Path to a JSON corpus of known marks to compare against
  --cache-dir <path>    Directory for caching adapter responses (opt-in)
  --max-age-hours <n>   Cache TTL in hours (default: 24, requires --cache-dir)
  --fuzzyQueryMode <m>  Fuzzy variant query mode: off|registries|all (default: registries)
  --variantBudget <n>   Max fuzzy variants to query per channel (default: 12, max: 30)

Batch options:
  --concurrency <n>     Max simultaneous checks (default: 4)
  --resume <dir>        Resume from a previous batch output directory

Refresh options:
  --max-age-hours <n>   Max acceptable evidence age in hours (default: 24)

Corpus add options:
  --name <mark>         Mark name (required)
  --class <n>           Nice classification number
  --registrant <name>   Owner/registrant name
  --corpus <path>       Path to corpus file (default: corpus.json)

Publish options:
  --out <dir>           Target output directory (required)

General:
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

  // Prevent falling through to next command

// ── Command: batch ──────────────────────────────────────────────
} else if (command === "batch") {
  const inputFile = args[1];
  if (!inputFile) {
    fail("COE.INIT.NO_ARGS", "No input file specified", {
      fix: "Usage: coe batch <file.txt|file.json> [options]",
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
  const concurrency = parseInt(getFlag("--concurrency") || "4", 10);
  const resumeDir = getFlag("--resume");

  async function batchMain() {
    // Parse input file
    let parsed;
    try {
      parsed = parseBatchInput(resolve(inputFile));
    } catch (err) {
      fail(err.code || "COE.BATCH.PARSE_FAIL", err.message, {
        fix: "Check the input file format (.txt or .json)",
      });
    }

    const now = new Date().toISOString();
    const dateStr = now.slice(0, 10);
    const batchOutputDir = resolve(join(outputDir, `batch-${dateStr}`));

    console.log(`Batch: ${parsed.names.length} names from ${inputFile} (${parsed.format})`);
    console.log(`Concurrency: ${concurrency} | Channels: ${channels.join(", ")}\n`);

    const batchResult = await runBatch(parsed.names, {
      concurrency,
      channels,
      org,
      dockerNamespace,
      hfOwner,
      riskTolerance,
      useRadar,
      corpusPath,
      fuzzyQueryMode,
      variantBudget,
      cacheDir: cacheDir ? resolve(cacheDir) : null,
      maxAgeHours,
      now,
      resumeDir: resumeDir ? resolve(resumeDir) : null,
    });

    // Write output
    const { files } = writeBatchOutput(batchResult, batchOutputDir, {
      resumedFrom: resumeDir ? resolve(resumeDir) : null,
    });

    // Print summary
    const { stats, results, errors } = batchResult;
    console.log(`\nBatch complete in ${stats.durationMs}ms`);
    console.log(`  Total:     ${stats.total}`);
    console.log(`  Succeeded: ${stats.succeeded}`);
    console.log(`  Failed:    ${stats.failed}`);
    if (stats.resumed) {
      console.log(`  Skipped:   ${stats.skipped} (resumed)`);
    }

    for (const r of results) {
      const tier = r.run?.opinion?.tier || "unknown";
      const emoji = tier === "green" ? "\u{1F7E2}" : tier === "yellow" ? "\u{1F7E1}" : "\u{1F534}";
      console.log(`  ${emoji} ${r.name}: ${tier.toUpperCase()}`);
    }

    for (const e of errors) {
      console.log(`  \u274C ${e.name}: ${e.error}`);
    }

    console.log(`\nOutput: ${batchOutputDir}`);
    console.log(`Files: ${files.length} written`);
  }

  batchMain().catch((err) => {
    fail("COE.BATCH.FATAL", err.message, { nerd: err.stack });
  });

// ── Command: refresh ────────────────────────────────────────────
} else if (command === "refresh") {
  const runDir = args[1];
  if (!runDir) {
    fail("COE.INIT.NO_ARGS", "No run directory specified", {
      fix: "Usage: coe refresh <run-directory> [--max-age-hours 24]",
    });
  }

  const maxAgeHours = parseInt(getFlag("--max-age-hours") || "24", 10);

  async function refreshMain() {
    const now = new Date().toISOString();

    let result;
    try {
      result = await refreshRun(resolve(runDir), {
        maxAgeHours,
        now,
      });
    } catch (err) {
      fail(err.code || "COE.REFRESH.FATAL", err.message, {
        fix: "Check the run directory path",
      });
    }

    if (!result.refreshed) {
      console.log(`\u2705 All checks fresh (within ${maxAgeHours}h). No refresh needed.`);
      return;
    }

    // Write refreshed run to a new directory
    const absRunDir = resolve(runDir);
    const refreshDir = absRunDir + "-refresh";
    const { jsonPath, mdPath, htmlPath, summaryPath } = writeRun(result.run, refreshDir);

    console.log(`\u{1F504} Refreshed ${result.staleCount} stale checks`);
    console.log(`  Output: ${refreshDir}`);
    console.log(`  JSON:    ${jsonPath}`);
    console.log(`  MD:      ${mdPath}`);
    console.log(`  HTML:    ${htmlPath}`);
    console.log(`  Summary: ${summaryPath}`);

    const tier = result.run.opinion?.tier || "unknown";
    const emoji = tier === "green" ? "\u{1F7E2}" : tier === "yellow" ? "\u{1F7E1}" : "\u{1F534}";
    console.log(`\n${emoji} ${tier.toUpperCase()} (refreshed opinion)`);
  }

  refreshMain().catch((err) => {
    fail("COE.REFRESH.FATAL", err.message, { nerd: err.stack });
  });

// ── Command: corpus ─────────────────────────────────────────────
} else if (command === "corpus") {
  const subcommand = args[1];

  if (subcommand === "init") {
    const outputPath = getFlag("--output") || "corpus.json";

    try {
      const result = corpusInit(resolve(outputPath));
      console.log(`\u2705 Created corpus template: ${result.path}`);
    } catch (err) {
      fail(err.code || "COE.CORPUS.INIT_FAIL", err.message);
    }

  } else if (subcommand === "add") {
    const name = getFlag("--name");
    if (!name) {
      fail("COE.INIT.NO_ARGS", "No mark name specified", {
        fix: "Usage: coe corpus add --name \"React\" [--class 9] [--registrant \"Meta\"] [--corpus path]",
      });
    }

    const niceClass = getFlag("--class");
    const registrant = getFlag("--registrant");
    const corpusPathArg = getFlag("--corpus") || "corpus.json";

    try {
      const result = corpusAdd(resolve(corpusPathArg), {
        name,
        class: niceClass ? parseInt(niceClass, 10) : undefined,
        registrant: registrant || undefined,
      });

      if (result.added) {
        console.log(`\u2705 Added mark: "${name}" (id: ${result.id})`);
      } else {
        console.log(`\u26A0\uFE0F Mark "${name}" already exists in corpus (${result.reason})`);
      }
    } catch (err) {
      fail(err.code || "COE.CORPUS.ADD_FAIL", err.message);
    }

  } else {
    fail("COE.INIT.NO_ARGS", `Unknown corpus subcommand: ${subcommand || "(none)"}`, {
      fix: "Usage: coe corpus init | coe corpus add --name <mark>",
    });
  }

// ── Command: publish ────────────────────────────────────────────
} else if (command === "publish") {
  const runDir = args[1];
  if (!runDir) {
    fail("COE.INIT.NO_ARGS", "No run directory specified", {
      fix: "Usage: coe publish <run-directory> --out <output-directory>",
    });
  }

  const outDir = getFlag("--out");
  if (!outDir) {
    fail("COE.INIT.NO_ARGS", "No output directory specified", {
      fix: "Usage: coe publish <run-directory> --out <output-directory>",
    });
  }

  try {
    const result = publishRun(resolve(runDir), resolve(outDir));
    console.log(`\u{1F4E6} Published ${result.published.length} files to ${resolve(outDir)}`);
    for (const f of result.published) {
      console.log(`  \u2713 ${f}`);
    }
    if (result.indexGenerated) {
      console.log(`  \u2713 index.html (multi-run listing)`);
    }
  } catch (err) {
    fail(err.code || "COE.PUBLISH.FATAL", err.message);
  }

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
  const useSuggest = args.includes("--suggest");
  const corpusPath = getFlag("--corpus");
  const cacheDir = getFlag("--cache-dir");
  const maxAgeHours = parseInt(getFlag("--max-age-hours") || "24", 10);
  const fuzzyQueryMode = getFlag("--fuzzyQueryMode") || "registries";
  const variantBudget = Math.min(parseInt(getFlag("--variantBudget") || "12", 10), 30);

  async function main() {
    const now = new Date().toISOString();
    const dateStr = now.slice(0, 10);
    const runOutputDir = resolve(join(outputDir, dateStr));

    // Create cache if requested
    const cache = cacheDir ? createCache(resolve(cacheDir), { maxAgeHours }) : null;

    const run = await runCheck(candidateName, {
      channels,
      org,
      dockerNamespace,
      hfOwner,
      riskTolerance,
      useRadar,
      suggest: useSuggest,
      corpusPath,
      fuzzyQueryMode,
      variantBudget,
      now,
      cache,
    });

    // Write output
    const { jsonPath, mdPath, htmlPath, summaryPath } = writeRun(run, runOutputDir);

    // Print summary
    const { opinion, checks, findings, evidence } = run;
    const tierEmoji =
      opinion.tier === "green" ? "\u{1F7E2}" : opinion.tier === "yellow" ? "\u{1F7E1}" : "\u{1F534}";
    console.log(`\n${tierEmoji} ${opinion.tier.toUpperCase()} — ${candidateName}\n`);
    console.log(opinion.summary);
    console.log(`\nScore: ${opinion.scoreBreakdown?.overallScore ?? "?"}/100`);
    console.log(`Checks: ${checks.length} | Findings: ${findings.length} | Evidence: ${evidence.length}`);
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
// ── Command: doctor ──────────────────────────────────────────────
} else if (command === "doctor") {
  async function doctorMain() {
    const results = await runDoctor({ engineVersion: VERSION });

    const icons = { pass: "\u2705", warn: "\u26A0\uFE0F", fail: "\u274C" };
    console.log(`clearance.opinion.engine doctor v${VERSION}\n`);
    for (const r of results) {
      console.log(`  ${icons[r.status] || "?"} ${r.check}: ${r.detail}`);
    }

    const hasFail = results.some((r) => r.status === "fail");
    if (hasFail) {
      console.log("\nSome checks failed. Fix the issues above before running coe.");
      process.exit(1);
    } else {
      console.log("\nAll checks passed.");
    }
  }

  doctorMain().catch((err) => {
    fail("COE.DOCTOR.FATAL", err.message, { nerd: err.stack });
  });
} else {
  fail("COE.INIT.NO_ARGS", `Unknown command: ${command}`, {
    fix: "Use 'check', 'batch', 'refresh', 'corpus', 'publish', 'report', 'replay', or 'doctor'. Run with --help for usage.",
  });
}
