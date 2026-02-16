import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { createGitHubAdapter } from "../../src/adapters/github.mjs";
import { createNpmAdapter } from "../../src/adapters/npm.mjs";
import { createPyPIAdapter } from "../../src/adapters/pypi.mjs";
import { generateAllVariants } from "../../src/variants/index.mjs";
import { scoreOpinion, classifyFindings } from "../../src/scoring/opinion.mjs";
import { writeRun, renderRunMd } from "../../src/renderers/report.mjs";
import { hashObject } from "../../src/lib/hash.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");
const tmpDir = join(__dirname, "..", ".tmp-e2e");
const goldenDir = join(fixturesDir, "golden");

// Fixed timestamp for determinism
const NOW = "2026-02-15T12:00:00.000Z";
const VERSION = "0.1.0";

// ── Mock fetch factories ───────────────────────────────────────

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, "adapters", name), "utf8"));
}

function mockFetch(fixture) {
  return async () => ({
    status: fixture.status,
    text: async () => fixture.body,
  });
}

function allAvailableFetch() {
  const available = loadFixture("github-available.json");
  return mockFetch(available);
}

function npmTakenFetch() {
  return async (url) => {
    if (url.includes("registry.npmjs.org")) {
      const taken = loadFixture("npm-taken.json");
      return { status: taken.status, text: async () => taken.body };
    }
    const available = loadFixture("github-available.json");
    return { status: available.status, text: async () => available.body };
  };
}

function networkErrorFetch() {
  return async () => {
    throw new Error("ECONNREFUSED");
  };
}

// ── Full pipeline helper ───────────────────────────────────────

async function runPipeline(candidateName, fetchFn, opts = {}) {
  const org = opts.org || null;
  const riskTolerance = opts.riskTolerance || "conservative";

  const intake = {
    candidates: [{ mark: candidateName, style: "word" }],
    goodsServices: "Software tool",
    geographies: [{ type: "region", code: "GLOBAL" }],
    channels: ["open-source"],
    riskTolerance,
  };

  const variants = generateAllVariants([candidateName], { now: NOW });

  const allChecks = [];
  const allEvidence = [];

  // GitHub
  const gh = createGitHubAdapter(fetchFn, { token: "" });
  if (org) {
    const { check, evidence } = await gh.checkOrg(org, { now: NOW });
    allChecks.push(check);
    allEvidence.push(evidence);
  }
  const ghRepo = await gh.checkRepo(org || candidateName, candidateName, { now: NOW });
  allChecks.push(ghRepo.check);
  allEvidence.push(ghRepo.evidence);

  // npm
  const npm = createNpmAdapter(fetchFn);
  const npmResult = await npm.checkPackage(candidateName, { now: NOW });
  allChecks.push(npmResult.check);
  allEvidence.push(npmResult.evidence);

  // PyPI
  const pypi = createPyPIAdapter(fetchFn);
  const pypiResult = await pypi.checkPackage(candidateName, { now: NOW });
  allChecks.push(pypiResult.check);
  allEvidence.push(pypiResult.evidence);

  // Classify + score
  const findings = classifyFindings(allChecks, variants);
  const opinion = scoreOpinion(
    { checks: allChecks, findings, variants },
    { riskTolerance }
  );

  const inputsSha256 = hashObject(intake);
  const runId = `run.2026-02-15.${inputsSha256.slice(0, 8)}`;

  return {
    schemaVersion: "1.0.0",
    run: {
      runId,
      engineVersion: VERSION,
      createdAt: NOW,
      inputsSha256,
      adapterVersions: { github: VERSION, npm: VERSION, pypi: VERSION },
    },
    intake,
    variants,
    checks: allChecks,
    findings,
    evidence: allEvidence,
    opinion,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("E2E: full pipeline", () => {
  before(() => {
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(goldenDir, { recursive: true });
  });

  after(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("all-available produces GREEN opinion", async () => {
    const run = await runPipeline("my-cool-tool", allAvailableFetch());

    assert.equal(run.opinion.tier, "green");
    assert.ok(run.checks.every((c) => c.status === "available"));
    assert.equal(run.findings.filter((f) => f.kind === "exact_conflict").length, 0);
    assert.ok(run.opinion.recommendedActions.length > 0);
  });

  it("npm-taken produces RED opinion with exact_conflict", async () => {
    const run = await runPipeline("taken-tool", npmTakenFetch());

    assert.equal(run.opinion.tier, "red");
    assert.ok(run.findings.some((f) => f.kind === "exact_conflict"));
    assert.ok(run.opinion.closestConflicts.length > 0);
  });

  it("network errors produce YELLOW opinion", async () => {
    const run = await runPipeline("error-tool", networkErrorFetch());

    assert.equal(run.opinion.tier, "yellow");
    assert.ok(run.checks.every((c) => c.status === "unknown"));
    assert.ok(run.opinion.reasons.some((r) => r.includes("unknown")));
  });

  it("variant generation produces expected forms", async () => {
    const run = await runPipeline("MyCoolTool", allAvailableFetch());

    assert.ok(run.variants.items.length > 0);
    const variantSet = run.variants.items[0];
    assert.equal(variantSet.candidateMark, "MyCoolTool");
    assert.equal(variantSet.canonical, "mycooltool");

    const types = variantSet.forms.map((f) => f.type);
    assert.ok(types.includes("original"));
    assert.ok(types.includes("phonetic"));
  });

  it("evidence chain is complete with SHA-256 hashes", async () => {
    const run = await runPipeline("evidence-test", allAvailableFetch());

    assert.ok(run.evidence.length > 0);
    for (const ev of run.evidence) {
      assert.ok(ev.id.startsWith("ev."));
      assert.equal(ev.type, "http_response");
      assert.ok(ev.source.system);
      assert.ok(ev.sha256 || ev.notes); // sha256 for success, notes for errors
    }
  });

  it("determinism: same inputs produce identical output", async () => {
    const run1 = await runPipeline("determinism-test", allAvailableFetch());
    const run2 = await runPipeline("determinism-test", allAvailableFetch());

    // Deep equality of entire run objects
    assert.deepEqual(run1, run2);

    // Hash equality
    assert.equal(hashObject(run1), hashObject(run2));
  });

  it("writeRun produces JSON + Markdown files", async () => {
    const run = await runPipeline("write-test", allAvailableFetch());
    const outDir = join(tmpDir, "write-test");

    const { jsonPath, mdPath } = writeRun(run, outDir);

    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(mdPath));

    // JSON round-trips correctly
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(parsed.schemaVersion, "1.0.0");
    assert.equal(parsed.opinion.tier, "green");

    // Markdown contains expected sections
    const md = readFileSync(mdPath, "utf8");
    assert.ok(md.includes("# Clearance Report"));
    assert.ok(md.includes("## Opinion"));
    assert.ok(md.includes("## Namespace Checks"));
  });

  it("run.json matches schema structure", async () => {
    const run = await runPipeline("schema-test", allAvailableFetch());

    // Top-level required fields
    assert.equal(run.schemaVersion, "1.0.0");
    assert.ok(run.run);
    assert.ok(run.intake);
    assert.ok(run.variants);
    assert.ok(Array.isArray(run.checks));
    assert.ok(Array.isArray(run.findings));
    assert.ok(Array.isArray(run.evidence));
    assert.ok(run.opinion);

    // Run metadata
    assert.match(run.run.runId, /^run\./);
    assert.equal(run.run.engineVersion, VERSION);
    assert.match(run.run.inputsSha256, /^[a-f0-9]{64}$/);

    // Opinion structure
    assert.ok(["green", "yellow", "red"].includes(run.opinion.tier));
    assert.ok(run.opinion.reasons.length > 0);
    assert.ok(run.opinion.recommendedActions.length > 0);
  });

  it("renderRunMd is deterministic", async () => {
    const run = await runPipeline("md-determinism", allAvailableFetch());
    const md1 = renderRunMd(run);
    const md2 = renderRunMd(run);
    assert.equal(md1, md2);
  });

  it("golden snapshot: all-available run matches expected output", async () => {
    const run = await runPipeline("golden-test", allAvailableFetch());
    const goldenPath = join(goldenDir, "simple-run.json");

    if (!existsSync(goldenPath)) {
      // First run: bootstrap golden file
      writeFileSync(goldenPath, JSON.stringify(run, null, 2) + "\n", "utf8");
      console.log("  [bootstrap] Golden snapshot written");
    }

    const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
    assert.deepEqual(run, golden);
  });

  it("golden snapshot: markdown matches expected output", async () => {
    const run = await runPipeline("golden-test", allAvailableFetch());
    const md = renderRunMd(run);
    const goldenPath = join(goldenDir, "simple-run.md");

    if (!existsSync(goldenPath)) {
      writeFileSync(goldenPath, md, "utf8");
      console.log("  [bootstrap] Golden markdown written");
    }

    const golden = readFileSync(goldenPath, "utf8");
    assert.equal(md, golden);
  });

  it("checks use correct namespace identifiers", async () => {
    const run = await runPipeline("ns-test", allAvailableFetch());

    const namespaces = run.checks.map((c) => c.namespace);
    assert.ok(namespaces.includes("github_repo"));
    assert.ok(namespaces.includes("npm"));
    assert.ok(namespaces.includes("pypi"));
  });
});
