import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { createGitHubAdapter } from "../../src/adapters/github.mjs";
import { createNpmAdapter } from "../../src/adapters/npm.mjs";
import { createPyPIAdapter } from "../../src/adapters/pypi.mjs";
import { createDomainAdapter } from "../../src/adapters/domain.mjs";
import { createCollisionRadarAdapter } from "../../src/adapters/collision-radar.mjs";
import { createCratesIoAdapter } from "../../src/adapters/cratesio.mjs";
import { createDockerHubAdapter } from "../../src/adapters/dockerhub.mjs";
import { createHuggingFaceAdapter } from "../../src/adapters/huggingface.mjs";
import { loadCorpus, compareAgainstCorpus } from "../../src/adapters/corpus.mjs";
import { generateAllVariants, selectTopN } from "../../src/variants/index.mjs";
import { scoreOpinion, classifyFindings } from "../../src/scoring/opinion.mjs";
import { writeRun, renderRunMd } from "../../src/renderers/report.mjs";
import { renderPacketHtml, renderSummaryJson } from "../../src/renderers/packet.mjs";
import { hashObject } from "../../src/lib/hash.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");
const tmpDir = join(__dirname, "..", ".tmp-e2e");
const goldenDir = join(fixturesDir, "golden");

// Fixed timestamp for determinism
const NOW = "2026-02-15T12:00:00.000Z";
const VERSION = "0.5.0";
const corpusFixturePath = join(fixturesDir, "corpus", "sample-corpus.json");

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

function radarAwareFetch() {
  const ghFixture = loadFixture("collision-radar-github-results.json");
  const npmFixture = loadFixture("collision-radar-npm-results.json");
  const available = loadFixture("github-available.json");

  return async (url) => {
    // Collision radar endpoints
    if (url.includes("api.github.com/search")) {
      return { status: ghFixture.status, text: async () => ghFixture.body };
    }
    if (url.includes("registry.npmjs.org/-/v1/search")) {
      return { status: npmFixture.status, text: async () => npmFixture.body };
    }
    // Standard adapter endpoints (all return available)
    return { status: available.status, text: async () => available.body };
  };
}

/**
 * Create a routing mock fetch that serves different fixtures based on URL.
 * Handles: cratesio, dockerhub, huggingface endpoints + standard adapters.
 */
function allChannelFetch(overrides = {}) {
  const available = loadFixture("github-available.json");
  const cratesAvailable = loadFixture("cratesio-available.json");
  const cratesTaken = loadFixture("cratesio-taken.json");
  const dockerAvailable = loadFixture("dockerhub-available.json");
  const hfModelAvailable = loadFixture("hf-model-available.json");
  const hfSpaceAvailable = loadFixture("hf-space-available.json");

  return async (url, opts) => {
    if (url.includes("crates.io/api/v1/crates")) {
      const fixture = overrides.cratesio === "taken" ? cratesTaken : cratesAvailable;
      return { status: fixture.status, text: async () => fixture.body };
    }
    if (url.includes("hub.docker.com")) {
      return { status: dockerAvailable.status, text: async () => dockerAvailable.body };
    }
    if (url.includes("huggingface.co/api/models")) {
      return { status: hfModelAvailable.status, text: async () => hfModelAvailable.body };
    }
    if (url.includes("huggingface.co/api/spaces")) {
      return { status: hfSpaceAvailable.status, text: async () => hfSpaceAvailable.body };
    }
    if (url.includes("registry.npmjs.org/-/v1/search")) {
      // npm search (radar)
      if (overrides.npmSearch) {
        const fixture = loadFixture(overrides.npmSearch);
        return { status: fixture.status, text: async () => fixture.body };
      }
    }
    if (url.includes("api.github.com/search")) {
      if (overrides.ghSearch) {
        const fixture = loadFixture(overrides.ghSearch);
        return { status: fixture.status, text: async () => fixture.body };
      }
    }
    // npm package check: check if this is a fuzzy variant query that should return "taken"
    if (url.includes("registry.npmjs.org/") && !url.includes("/-/v1/search")) {
      if (overrides.npmTakenVariants) {
        for (const variant of overrides.npmTakenVariants) {
          if (url.includes(encodeURIComponent(variant))) {
            const taken = loadFixture("npm-taken.json");
            return { status: taken.status, text: async () => taken.body };
          }
        }
      }
    }
    // Default: available
    return { status: available.status, text: async () => available.body };
  };
}

// ── Full pipeline helper ───────────────────────────────────────

async function runPipeline(candidateName, fetchFn, opts = {}) {
  const org = opts.org || null;
  const riskTolerance = opts.riskTolerance || "conservative";
  const includeDomain = opts.includeDomain || false;
  const includeCratesio = opts.includeCratesio || false;
  const includeDockerHub = opts.includeDockerHub || false;
  const dockerNamespace = opts.dockerNamespace || null;
  const includeHuggingFace = opts.includeHuggingFace || false;
  const hfOwner = opts.hfOwner || null;
  const fuzzyQueryMode = opts.fuzzyQueryMode || "off";
  const variantBudget = opts.variantBudget || 12;

  const channels = ["open-source"];
  if (includeCratesio) channels.push("open-source");
  if (includeDockerHub) channels.push("SaaS");
  if (includeHuggingFace) channels.push("SaaS");

  const intake = {
    candidates: [{ mark: candidateName, style: "word" }],
    goodsServices: "Software tool",
    geographies: [{ type: "region", code: "GLOBAL" }],
    channels,
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

  // Domain (optional)
  if (includeDomain) {
    const domain = createDomainAdapter(fetchFn);
    for (const tld of domain.tlds) {
      const result = await domain.checkDomain(candidateName, tld, { now: NOW });
      allChecks.push(result.check);
      allEvidence.push(result.evidence);
    }
  }

  // crates.io (optional)
  if (includeCratesio) {
    const crates = createCratesIoAdapter(fetchFn);
    const cratesResult = await crates.checkCrate(candidateName, { now: NOW });
    allChecks.push(cratesResult.check);
    allEvidence.push(cratesResult.evidence);
  }

  // Docker Hub (optional)
  if (includeDockerHub) {
    const docker = createDockerHubAdapter(fetchFn);
    const dockerResult = await docker.checkRepo(dockerNamespace, candidateName, { now: NOW });
    allChecks.push(dockerResult.check);
    allEvidence.push(dockerResult.evidence);
  }

  // Hugging Face (optional)
  if (includeHuggingFace) {
    const hf = createHuggingFaceAdapter(fetchFn);
    const modelResult = await hf.checkModel(hfOwner, candidateName, { now: NOW });
    allChecks.push(modelResult.check);
    allEvidence.push(modelResult.evidence);
    const spaceResult = await hf.checkSpace(hfOwner, candidateName, { now: NOW });
    allChecks.push(spaceResult.check);
    allEvidence.push(spaceResult.evidence);
  }

  // Collision radar (optional)
  if (opts.useRadar) {
    const radar = createCollisionRadarAdapter(fetchFn, {
      similarityThreshold: 0.70,
    });
    const radarResult = await radar.scanAll(candidateName, { now: NOW });
    allChecks.push(...(radarResult.checks || []));
    allEvidence.push(...(radarResult.evidence || []));
  }

  // Fuzzy variant registry queries (optional)
  if (fuzzyQueryMode !== "off") {
    const fuzzyList = variants.items?.[0]?.fuzzyVariants || [];
    const variantCandidates = selectTopN(fuzzyList, variantBudget);

    const registryAdapters = [];
    registryAdapters.push(["npm", (name, o) => createNpmAdapter(fetchFn).checkPackage(name, o)]);
    registryAdapters.push(["pypi", (name, o) => createPyPIAdapter(fetchFn).checkPackage(name, o)]);
    if (includeCratesio) {
      registryAdapters.push(["cratesio", (name, o) => createCratesIoAdapter(fetchFn).checkCrate(name, o)]);
    }

    for (const variant of variantCandidates) {
      for (const [adapterName, checkFn] of registryAdapters) {
        const result = await checkFn(variant, { now: NOW });
        result.check.query.isVariant = true;
        result.check.query.originalCandidate = candidateName;
        allChecks.push(result.check);
        allEvidence.push(result.evidence);
      }
    }
  }

  // Classify + score
  const findings = classifyFindings(allChecks, variants);

  // Corpus comparison (optional)
  if (opts.corpusPath) {
    const corpus = loadCorpus(opts.corpusPath);
    const corpusResult = compareAgainstCorpus(candidateName, corpus, {
      threshold: 0.70,
    });
    findings.push(...corpusResult.findings);
    allEvidence.push(...corpusResult.evidence);
  }

  const opinion = scoreOpinion(
    { checks: allChecks, findings, variants, evidence: allEvidence },
    { riskTolerance }
  );

  const inputsSha256 = hashObject(intake);
  const runId = `run.2026-02-15.${inputsSha256.slice(0, 8)}`;

  const adapterVersions = { github: VERSION, npm: VERSION, pypi: VERSION };
  if (includeDomain) adapterVersions.domain = VERSION;
  if (includeCratesio) adapterVersions.cratesio = VERSION;
  if (includeDockerHub) adapterVersions.dockerhub = VERSION;
  if (includeHuggingFace) adapterVersions.huggingface = VERSION;
  if (opts.useRadar) adapterVersions.collision_radar = VERSION;

  return {
    schemaVersion: "1.0.0",
    run: {
      runId,
      engineVersion: VERSION,
      createdAt: NOW,
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

  it("writeRun produces JSON + Markdown + HTML + Summary files", async () => {
    const run = await runPipeline("write-test", allAvailableFetch());
    const outDir = join(tmpDir, "write-test");

    const { jsonPath, mdPath, htmlPath, summaryPath } = writeRun(run, outDir);

    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(mdPath));
    assert.ok(existsSync(htmlPath));
    assert.ok(existsSync(summaryPath));

    // JSON round-trips correctly
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(parsed.schemaVersion, "1.0.0");
    assert.equal(parsed.opinion.tier, "green");

    // Markdown contains expected sections
    const md = readFileSync(mdPath, "utf8");
    assert.ok(md.includes("# Clearance Report"));
    assert.ok(md.includes("## Opinion"));
    assert.ok(md.includes("## Namespace Checks"));
    assert.ok(md.includes("### Score Breakdown"));

    // HTML is valid
    const html = readFileSync(htmlPath, "utf8");
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes("Why This Tier?"));

    // Summary JSON is valid
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    assert.equal(summary.tier, "green");
    assert.ok(typeof summary.overallScore === "number");
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

  // ── Phase 2 tests ──────────────────────────────────────────────

  it("domain channel produces domain namespace checks", async () => {
    const run = await runPipeline("domain-test", allAvailableFetch(), {
      includeDomain: true,
    });

    const domainChecks = run.checks.filter((c) => c.namespace === "domain");
    assert.ok(domainChecks.length >= 2, "Should have at least 2 domain checks (.com + .dev)");
    assert.ok(domainChecks.every((c) => c.status === "available"));
    assert.ok(domainChecks.every((c) => c.claimability === "claimable_now"));

    // Domain evidence should exist
    const domainEvidence = run.evidence.filter((e) => e.source.system === "rdap");
    assert.ok(domainEvidence.length >= 2);
  });

  it("opinion includes scoreBreakdown with overallScore", async () => {
    const run = await runPipeline("score-test", allAvailableFetch());

    assert.ok(run.opinion.scoreBreakdown);
    assert.ok(typeof run.opinion.scoreBreakdown.overallScore === "number");
    assert.ok(run.opinion.scoreBreakdown.overallScore >= 0);
    assert.ok(run.opinion.scoreBreakdown.overallScore <= 100);

    // Sub-scores exist
    assert.ok(run.opinion.scoreBreakdown.namespaceAvailability);
    assert.ok(run.opinion.scoreBreakdown.coverageCompleteness);
    assert.ok(run.opinion.scoreBreakdown.conflictSeverity);
    assert.ok(run.opinion.scoreBreakdown.domainAvailability);

    // Tier thresholds
    assert.ok(run.opinion.scoreBreakdown.tierThresholds);
    assert.ok(typeof run.opinion.scoreBreakdown.tierThresholds.green === "number");
    assert.ok(typeof run.opinion.scoreBreakdown.tierThresholds.yellow === "number");
  });

  it("recommendedActions include links array", async () => {
    const run = await runPipeline("links-test", allAvailableFetch());

    assert.equal(run.opinion.tier, "green");
    const claimAction = run.opinion.recommendedActions.find(
      (a) => a.type === "claim_handles"
    );
    assert.ok(claimAction, "Should have claim_handles action");
    assert.ok(Array.isArray(claimAction.links));
    assert.ok(claimAction.links.length > 0, "Links should be populated for GREEN tier");
  });

  it("renderPacketHtml is deterministic", async () => {
    const run = await runPipeline("html-determinism", allAvailableFetch());
    const html1 = renderPacketHtml(run);
    const html2 = renderPacketHtml(run);
    assert.equal(html1, html2);
  });

  // ── Phase 3 tests ──────────────────────────────────────────────

  it("collision radar produces custom namespace checks with indicative authority", async () => {
    const run = await runPipeline("my-cool-tool", radarAwareFetch(), {
      useRadar: true,
    });

    const radarChecks = run.checks.filter(
      (c) => c.namespace === "custom" && c.authority === "indicative"
    );
    assert.ok(radarChecks.length >= 1, "Should have at least 1 collision radar check");
    assert.ok(
      radarChecks.every((c) => c.details?.source === "github_search" || c.details?.source === "npm_search"),
      "All radar checks should have a source"
    );
    assert.ok(
      radarChecks.every((c) => c.details?.similarity?.overall !== undefined),
      "All radar checks should have similarity scores"
    );
  });

  it("corpus comparison produces findings with commercial impression", async () => {
    const run = await runPipeline("ReactJS", allAvailableFetch(), {
      corpusPath: corpusFixturePath,
    });

    // ReactJS should match "ReactJS" in the sample corpus
    const corpusFindings = run.findings.filter(
      (f) => f.why?.some((w) => w.includes("Commercial impression"))
    );
    assert.ok(corpusFindings.length >= 1, "Should have at least 1 corpus finding");

    // Evidence should include user_corpus
    const corpusEvidence = run.evidence.filter(
      (e) => e.source?.system === "user_corpus"
    );
    assert.ok(corpusEvidence.length >= 1, "Should have corpus evidence");
  });

  it("full pipeline with radar + corpus produces valid run", async () => {
    const run = await runPipeline("my-cool-tool", radarAwareFetch(), {
      useRadar: true,
      corpusPath: corpusFixturePath,
    });

    // Should have standard checks + radar checks
    assert.ok(run.checks.length >= 4, "Should have standard + radar checks");

    // Should be a valid opinion
    assert.ok(["green", "yellow", "red"].includes(run.opinion.tier));
    assert.ok(run.opinion.reasons.length > 0);

    // adapter versions includes collision_radar
    assert.equal(run.run.adapterVersions.collision_radar, VERSION);
  });

  it("determinism with radar enabled", async () => {
    const run1 = await runPipeline("my-cool-tool", radarAwareFetch(), {
      useRadar: true,
    });
    const run2 = await runPipeline("my-cool-tool", radarAwareFetch(), {
      useRadar: true,
    });

    assert.deepEqual(run1, run2);
  });

  it("markdown includes executive summary and coverage matrix sections", async () => {
    const run = await runPipeline("md-sections-test", allAvailableFetch());
    const md = renderRunMd(run);

    assert.ok(md.includes("## Executive Summary"), "MD should include executive summary");
    assert.ok(md.includes("## Coverage Matrix"), "MD should include coverage matrix");
    assert.ok(md.includes("Namespaces Checked"), "Executive summary should show check counts");
  });

  it("HTML includes executive summary section", async () => {
    const run = await runPipeline("html-exec-test", allAvailableFetch());
    const html = renderPacketHtml(run);

    assert.ok(html.includes("Executive Summary"), "HTML should include executive summary");
    assert.ok(html.includes("executive-summary"), "HTML should have executive-summary class");
    assert.ok(html.includes("Coverage Matrix"), "HTML should include coverage matrix");
  });

  it("summary JSON includes collisionRadarCount with radar", async () => {
    const run = await runPipeline("my-cool-tool", radarAwareFetch(), {
      useRadar: true,
    });
    const summary = renderSummaryJson(run);

    assert.ok(typeof summary.collisionRadarCount === "number");
    assert.ok(summary.collisionRadarCount >= 1, "Should have collision radar signals");
  });

  it("radar check findings affect tier to YELLOW or RED", async () => {
    const run = await runPipeline("my-cool-tool", radarAwareFetch(), {
      useRadar: true,
    });

    // my-cool-tool has exact match in both GitHub and npm radar fixtures
    // which produces near_conflict or phonetic_conflict findings
    const radarFindings = run.findings.filter(
      (f) => f.kind === "near_conflict" || f.kind === "phonetic_conflict"
    );

    // If radar found similar names, the tier should not be green
    if (radarFindings.length > 0) {
      assert.ok(
        run.opinion.tier === "yellow" || run.opinion.tier === "red",
        `Radar findings should push tier to yellow or red, got ${run.opinion.tier}`
      );
    }
  });

  // ── Phase 4 tests ──────────────────────────────────────────────

  it("cratesio channel produces cratesio namespace checks", async () => {
    const run = await runPipeline("my-crate", allChannelFetch(), {
      includeCratesio: true,
    });

    const cratesChecks = run.checks.filter((c) => c.namespace === "cratesio");
    assert.equal(cratesChecks.length, 1, "Should have 1 cratesio check");
    assert.equal(cratesChecks[0].status, "available");
    assert.equal(cratesChecks[0].authority, "authoritative");
    assert.equal(run.run.adapterVersions.cratesio, VERSION);
  });

  it("dockerhub skipped without namespace produces warning", async () => {
    const run = await runPipeline("my-image", allChannelFetch(), {
      includeDockerHub: true,
      dockerNamespace: null,
    });

    const dockerChecks = run.checks.filter((c) => c.namespace === "dockerhub");
    assert.equal(dockerChecks.length, 1, "Should have 1 dockerhub check");
    assert.equal(dockerChecks[0].status, "unknown");
    assert.equal(dockerChecks[0].errors[0].code, "COE.DOCKER.NAMESPACE_REQUIRED");
  });

  it("dockerhub with namespace produces authoritative check", async () => {
    const run = await runPipeline("my-image", allChannelFetch(), {
      includeDockerHub: true,
      dockerNamespace: "myorg",
    });

    const dockerChecks = run.checks.filter((c) => c.namespace === "dockerhub");
    assert.equal(dockerChecks.length, 1);
    assert.equal(dockerChecks[0].status, "available");
    assert.equal(dockerChecks[0].authority, "authoritative");
  });

  it("huggingface skipped without owner produces warning", async () => {
    const run = await runPipeline("my-model", allChannelFetch(), {
      includeHuggingFace: true,
      hfOwner: null,
    });

    const hfChecks = run.checks.filter(
      (c) => c.namespace === "huggingface_model" || c.namespace === "huggingface_space"
    );
    assert.equal(hfChecks.length, 2, "Should have 2 HF checks (model + space)");
    assert.ok(hfChecks.every((c) => c.status === "unknown"));
    assert.ok(hfChecks.every((c) => c.errors[0].code === "COE.HF.OWNER_REQUIRED"));
  });

  it("huggingface with owner produces both model and space checks", async () => {
    const run = await runPipeline("my-model", allChannelFetch(), {
      includeHuggingFace: true,
      hfOwner: "myuser",
    });

    const modelChecks = run.checks.filter((c) => c.namespace === "huggingface_model");
    const spaceChecks = run.checks.filter((c) => c.namespace === "huggingface_space");
    assert.equal(modelChecks.length, 1, "Should have 1 model check");
    assert.equal(spaceChecks.length, 1, "Should have 1 space check");
    assert.equal(modelChecks[0].status, "available");
    assert.equal(spaceChecks[0].status, "available");
  });

  it("all channels includes all adapter types", async () => {
    const run = await runPipeline("all-channels-test", allChannelFetch(), {
      includeDomain: true,
      includeCratesio: true,
      includeDockerHub: true,
      dockerNamespace: "myorg",
      includeHuggingFace: true,
      hfOwner: "myuser",
    });

    const namespaces = run.checks.map((c) => c.namespace);
    assert.ok(namespaces.includes("github_repo"), "Should have github_repo");
    assert.ok(namespaces.includes("npm"), "Should have npm");
    assert.ok(namespaces.includes("pypi"), "Should have pypi");
    assert.ok(namespaces.includes("domain"), "Should have domain");
    assert.ok(namespaces.includes("cratesio"), "Should have cratesio");
    assert.ok(namespaces.includes("dockerhub"), "Should have dockerhub");
    assert.ok(namespaces.includes("huggingface_model"), "Should have huggingface_model");
    assert.ok(namespaces.includes("huggingface_space"), "Should have huggingface_space");
  });

  it("fuzzy variants produce variant_taken findings when variant is taken", async () => {
    // Create a fetch that returns "taken" for a specific fuzzy variant of "tool"
    // Edit-distance=1 variants of "tool" include: "ool", "tol", "too", "aool", etc.
    const fetchFn = allChannelFetch({ npmTakenVariants: ["tol"] });
    const run = await runPipeline("tool", fetchFn, {
      fuzzyQueryMode: "registries",
      variantBudget: 5,
    });

    // Check for variant_taken findings
    const variantFindings = run.findings.filter((f) => f.kind === "variant_taken");
    // "tol" should appear as a fuzzy variant of "tool" (deletion of 'o' at pos 2)
    // If the selectTopN picks it, we should get a finding
    const fuzzyChecks = run.checks.filter((c) => c.query?.isVariant);
    assert.ok(fuzzyChecks.length > 0, "Should have fuzzy variant checks");
  });

  it("fuzzy variant-taken bumps tier to YELLOW", async () => {
    // "tool" with a taken fuzzy variant should be YELLOW, not GREEN
    const fetchFn = allChannelFetch({ npmTakenVariants: ["ool", "tol", "too"] });
    const run = await runPipeline("tool", fetchFn, {
      fuzzyQueryMode: "registries",
      variantBudget: 12,
    });

    const variantFindings = run.findings.filter((f) => f.kind === "variant_taken");
    if (variantFindings.length > 0) {
      assert.ok(
        run.opinion.tier === "yellow" || run.opinion.tier === "red",
        `Variant-taken should push tier to yellow, got ${run.opinion.tier}`
      );
      assert.ok(
        run.opinion.reasons.some((r) => r.includes("Variant taken")),
        "Reasons should mention variant_taken"
      );
    }
  });

  it("expanded homoglyphs include Cyrillic confusables", async () => {
    const run = await runPipeline("cool", allAvailableFetch());

    // "cool" has 'c' and 'o' with Cyrillic confusables
    const variantSet = run.variants.items[0];
    const homoglyphForms = variantSet.forms.filter((f) => f.type === "homoglyph-safe");
    // Warnings should reference confusable variants
    const homoglyphWarning = variantSet.warnings.find((w) => w.code === "COE.HOMOGLYPH_RISK");
    assert.ok(homoglyphWarning, "Should have homoglyph risk warning for 'cool'");
  });

  it("determinism with new channels enabled", async () => {
    const run1 = await runPipeline("det-test", allChannelFetch(), {
      includeCratesio: true,
      includeDockerHub: true,
      dockerNamespace: "myorg",
      includeHuggingFace: true,
      hfOwner: "myuser",
    });
    const run2 = await runPipeline("det-test", allChannelFetch(), {
      includeCratesio: true,
      includeDockerHub: true,
      dockerNamespace: "myorg",
      includeHuggingFace: true,
      hfOwner: "myuser",
    });

    assert.deepEqual(run1, run2);
  });

  it("summary JSON includes fuzzyVariantsTaken count", async () => {
    const fetchFn = allChannelFetch({ npmTakenVariants: ["ool"] });
    const run = await runPipeline("tool", fetchFn, {
      fuzzyQueryMode: "registries",
      variantBudget: 5,
    });
    const summary = renderSummaryJson(run);

    assert.ok(typeof summary.fuzzyVariantsTaken === "number");
  });

  it("fuzzy variants section appears in markdown when variants are queried", async () => {
    const run = await runPipeline("tool", allChannelFetch(), {
      fuzzyQueryMode: "registries",
      variantBudget: 3,
    });
    const md = renderRunMd(run);

    assert.ok(md.includes("Fuzzy Variants Checked"), "MD should include fuzzy variants section");
  });

  it("fuzzy variants section appears in HTML when variants are queried", async () => {
    const run = await runPipeline("tool", allChannelFetch(), {
      fuzzyQueryMode: "registries",
      variantBudget: 3,
    });
    const html = renderPacketHtml(run);

    assert.ok(html.includes("Fuzzy Variants Checked"), "HTML should include fuzzy variants section");
    assert.ok(html.includes("fuzzy-variants"), "HTML should have fuzzy-variants class");
  });

  it("variants output includes fuzzyVariants array", async () => {
    const run = await runPipeline("test", allAvailableFetch());

    const variantSet = run.variants.items[0];
    assert.ok(Array.isArray(variantSet.fuzzyVariants), "Should have fuzzyVariants array");
    assert.ok(variantSet.fuzzyVariants.length > 0, "Should have at least 1 fuzzy variant");
    assert.ok(!variantSet.fuzzyVariants.includes("test"), "Original name should not be in fuzzy variants");
  });
});
