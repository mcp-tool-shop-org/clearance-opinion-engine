/**
 * clearance.opinion.engine — Check pipeline (pure function).
 *
 * Extracted from the CLI entry point so batch mode, refresh, and
 * other commands can invoke the pipeline programmatically.
 *
 * runCheck() returns a complete run object WITHOUT writing to disk.
 */

import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { hashObject } from "./lib/hash.mjs";
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
import { generateAlternatives, recheckAlternatives } from "./scoring/alternatives.mjs";
import { redactAllEvidence } from "./lib/redact.mjs";
import { fail } from "./lib/errors.mjs";

const VERSION = "0.9.0";

/**
 * Wrap an adapter call with cache.
 * Returns cached result or fetches fresh + stores in cache.
 * Sets `cacheHit` on each check in the result.
 */
export async function withCache(cache, adapter, version, query, fetchFn) {
  if (!cache) {
    const result = await fetchFn();
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

/**
 * Run the full check pipeline for a single candidate name.
 *
 * Returns the complete run object (does NOT write to disk).
 *
 * @param {string} candidateName - The name to check
 * @param {object} opts - Pipeline options
 * @param {string[]} opts.channels - Channels to check
 * @param {string} [opts.org] - GitHub org name
 * @param {string} [opts.dockerNamespace] - Docker Hub namespace
 * @param {string} [opts.hfOwner] - Hugging Face owner
 * @param {string} [opts.riskTolerance] - Risk level
 * @param {boolean} [opts.useRadar] - Enable collision radar
 * @param {boolean} [opts.suggest] - Generate safer alternatives (and optionally recheck)
 * @param {string} [opts.corpusPath] - Path to corpus file
 * @param {string} [opts.fuzzyQueryMode] - Fuzzy query mode
 * @param {number} [opts.variantBudget] - Max fuzzy variants to query
 * @param {Function} [opts.fetchFn] - Injectable fetch function
 * @param {string} [opts.now] - Injectable ISO timestamp
 * @param {object} [opts.cache] - Pre-created cache instance (or null)
 * @param {string} [opts.engineVersion] - Override engine version (for testing)
 * @returns {object} Complete run object
 */
export async function runCheck(candidateName, opts = {}) {
  const {
    channels = ["github", "npm", "pypi", "domain"],
    org = null,
    dockerNamespace = null,
    hfOwner = null,
    riskTolerance = "conservative",
    useRadar = false,
    suggest = false,
    corpusPath = null,
    fuzzyQueryMode = "registries",
    variantBudget = 12,
    fetchFn = globalThis.fetch,
    now = new Date().toISOString(),
    cache = null,
    engineVersion = VERSION,
    costTracker = null,
  } = opts;

  const dateStr = now.slice(0, 10);

  // Create retry-wrapped fetch
  const fetchWithRetry = retryFetch(fetchFn, {
    maxRetries: 2,
    baseDelayMs: 500,
  });

  // Cost tracking wrapper
  const trackedWithCache = async (cacheInst, adapter, version, query, fn) => {
    const result = await withCache(cacheInst, adapter, version, query, fn);
    if (costTracker) {
      const cached = result.check?.cacheHit || false;
      costTracker(adapter, { cached });
    }
    return result;
  };

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
      if (c === "dockerhub") return "saas";
      if (c === "huggingface") return "saas";
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
      const result = await trackedWithCache(cache, "github.org", engineVersion, { org }, async () => {
        return gh.checkOrg(org, { now });
      });
      allChecks.push(result.check);
      allEvidence.push(result.evidence);
    }

    const repoOwner = org || candidateName;
    const result = await trackedWithCache(cache, "github.repo", engineVersion, { owner: repoOwner, repo: candidateName }, async () => {
      return gh.checkRepo(repoOwner, candidateName, { now });
    });
    allChecks.push(result.check);
    allEvidence.push(result.evidence);
  }

  if (channels.includes("npm")) {
    const npm = createNpmAdapter(fetchWithRetry);
    const result = await trackedWithCache(cache, "npm", engineVersion, { name: candidateName }, async () => {
      return npm.checkPackage(candidateName, { now });
    });
    allChecks.push(result.check);
    allEvidence.push(result.evidence);
  }

  if (channels.includes("pypi")) {
    const pypi = createPyPIAdapter(fetchWithRetry);
    const result = await trackedWithCache(cache, "pypi", engineVersion, { name: candidateName }, async () => {
      return pypi.checkPackage(candidateName, { now });
    });
    allChecks.push(result.check);
    allEvidence.push(result.evidence);
  }

  if (channels.includes("domain")) {
    const domain = createDomainAdapter(fetchWithRetry);
    for (const tld of domain.tlds) {
      const result = await trackedWithCache(cache, "domain", engineVersion, { name: candidateName, tld }, async () => {
        return domain.checkDomain(candidateName, tld, { now });
      });
      allChecks.push(result.check);
      allEvidence.push(result.evidence);
    }
  }

  // 3a. New ecosystem adapters
  if (channels.includes("cratesio")) {
    const crates = createCratesIoAdapter(fetchWithRetry);
    const result = await trackedWithCache(cache, "cratesio", engineVersion, { name: candidateName }, async () => {
      return crates.checkCrate(candidateName, { now });
    });
    allChecks.push(result.check);
    allEvidence.push(result.evidence);
  }

  if (channels.includes("dockerhub")) {
    const docker = createDockerHubAdapter(fetchWithRetry);
    const result = await trackedWithCache(cache, "dockerhub", engineVersion, { namespace: dockerNamespace, name: candidateName }, async () => {
      return docker.checkRepo(dockerNamespace, candidateName, { now });
    });
    allChecks.push(result.check);
    allEvidence.push(result.evidence);
  }

  if (channels.includes("huggingface")) {
    const hf = createHuggingFaceAdapter(fetchWithRetry);
    const modelResult = await trackedWithCache(cache, "huggingface.model", engineVersion, { owner: hfOwner, name: candidateName }, async () => {
      return hf.checkModel(hfOwner, candidateName, { now });
    });
    allChecks.push(modelResult.check);
    allEvidence.push(modelResult.evidence);

    const spaceResult = await trackedWithCache(cache, "huggingface.space", engineVersion, { owner: hfOwner, name: candidateName }, async () => {
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
    const radarResult = await trackedWithCache(cache, "collision-radar", engineVersion, { name: candidateName }, async () => {
      return radar.scanAll(candidateName, { now, channels });
    });
    allChecks.push(...(radarResult.checks || []));
    allEvidence.push(...(radarResult.evidence || []));
  }

  // 3c. Fuzzy variant registry queries
  if (fuzzyQueryMode !== "off") {
    const fuzzyList = variants.items?.[0]?.fuzzyVariants || [];
    const variantCandidates = selectTopN(fuzzyList, variantBudget);

    const registryAdapters = [];
    if (channels.includes("npm")) {
      const npm = createNpmAdapter(fetchWithRetry);
      registryAdapters.push(["npm", (name, o) => npm.checkPackage(name, o)]);
    }
    if (channels.includes("pypi")) {
      const pypi = createPyPIAdapter(fetchWithRetry);
      registryAdapters.push(["pypi", (name, o) => pypi.checkPackage(name, o)]);
    }
    if (channels.includes("cratesio")) {
      const crates = createCratesIoAdapter(fetchWithRetry);
      registryAdapters.push(["cratesio", (name, o) => crates.checkCrate(name, o)]);
    }

    for (const variant of variantCandidates) {
      for (const [adapterName, checkFn] of registryAdapters) {
        const result = await trackedWithCache(cache, `fuzzy.${adapterName}`, engineVersion, { name: variant }, async () => {
          return checkFn(variant, { now });
        });
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

  // 5b. Safer alternatives (--suggest)
  if (suggest) {
    const alternatives = generateAlternatives(candidateName);
    opinion.saferAlternatives = alternatives;
  }

  // 5c. Redact evidence (strip tokens, auth headers, truncate oversized notes)
  redactAllEvidence(allEvidence);

  // 6. Build run object
  const inputsSha256 = hashObject(intake);
  const runId = `run.${dateStr}.${inputsSha256.slice(0, 8)}`;

  const adapterVersions = {};
  for (const ch of channels) {
    adapterVersions[ch] = engineVersion;
  }
  if (useRadar) {
    adapterVersions.collision_radar = engineVersion;
  }

  return {
    schemaVersion: "1.0.0",
    run: {
      runId,
      engineVersion,
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
}
