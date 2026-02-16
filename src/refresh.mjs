/**
 * Refresh command — re-run stale adapter checks on an existing run.
 *
 * refreshRun(runDir, opts) reads run.json, identifies stale checks,
 * re-runs only those adapters, merges results, re-scores opinion,
 * and writes to a new <runDir>-refresh/ directory.
 *
 * The original run directory is NEVER modified.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { findStaleAdapters } from "./lib/freshness.mjs";
import { retryFetch } from "./lib/retry.mjs";
import { withCache } from "./pipeline.mjs";
import { createGitHubAdapter } from "./adapters/github.mjs";
import { createNpmAdapter } from "./adapters/npm.mjs";
import { createPyPIAdapter } from "./adapters/pypi.mjs";
import { createDomainAdapter } from "./adapters/domain.mjs";
import { createCratesIoAdapter } from "./adapters/cratesio.mjs";
import { createDockerHubAdapter } from "./adapters/dockerhub.mjs";
import { createHuggingFaceAdapter } from "./adapters/huggingface.mjs";
import { classifyFindings } from "./scoring/opinion.mjs";
import { scoreOpinion } from "./scoring/opinion.mjs";
import { hashObject } from "./lib/hash.mjs";

function refreshError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Re-run stale adapter checks for an existing run.
 *
 * @param {string} runDir - Directory containing run.json
 * @param {object} opts
 * @param {number} [opts.maxAgeHours] - Max acceptable age in hours (default: 24)
 * @param {Function} [opts.fetchFn] - Injectable fetch function
 * @param {string} [opts.now] - Injectable ISO timestamp
 * @param {object} [opts.cache] - Cache instance (or null)
 * @returns {Promise<{ refreshed: boolean, reason?: string, run?: object, staleCount?: number }>}
 */
export async function refreshRun(runDir, opts = {}) {
  const {
    maxAgeHours = 24,
    fetchFn = globalThis.fetch,
    now = new Date().toISOString(),
    cache = null,
  } = opts;

  const absRunDir = resolve(runDir);
  const runJsonPath = join(absRunDir, "run.json");

  if (!existsSync(runJsonPath)) {
    throw refreshError("COE.REFRESH.NO_RUN", `No run.json found in: ${absRunDir}`);
  }

  let existingRun;
  try {
    existingRun = JSON.parse(readFileSync(runJsonPath, "utf8"));
  } catch {
    throw refreshError("COE.REFRESH.INVALID_RUN", `Invalid run.json in: ${absRunDir}`);
  }

  // Find stale checks
  const staleAdapters = findStaleAdapters(existingRun, { maxAgeHours, now });

  if (staleAdapters.length === 0) {
    return { refreshed: false, reason: "all checks fresh" };
  }

  // Create retry-wrapped fetch
  const fetchWithRetry = retryFetch(fetchFn, {
    maxRetries: 2,
    baseDelayMs: 500,
  });

  // Build adapter lookup
  const adapterMap = buildAdapterMap(fetchWithRetry);

  // Deep-clone existing checks and evidence for mutation
  const allChecks = existingRun.checks.map((c) => ({ ...c }));
  const allEvidence = existingRun.evidence.map((e) => ({ ...e }));

  // Re-run each stale check
  let refreshedCount = 0;
  for (const stale of staleAdapters) {
    const checkFn = resolveAdapterCall(adapterMap, stale);
    if (!checkFn) continue; // Unknown adapter, skip

    try {
      const result = await checkFn({ now });

      // Find and replace the stale check
      const idx = allChecks.findIndex((c) => c.id === stale.checkId);
      if (idx !== -1) {
        if (result.check) {
          allChecks[idx] = result.check;
        }
        if (result.checks) {
          // Replace the single check, append any extras
          allChecks[idx] = result.checks[0];
          for (let i = 1; i < result.checks.length; i++) {
            allChecks.push(result.checks[i]);
          }
        }
      }

      // Find and replace evidence by matching adapter namespace
      const evidx = allEvidence.findIndex(
        (e) => e.source && e.source.adapter === stale.adapter
          && e.source.query && JSON.stringify(e.source.query) === JSON.stringify(stale.query)
      );
      if (evidx !== -1 && result.evidence) {
        allEvidence[evidx] = result.evidence;
      } else if (result.evidence) {
        allEvidence.push(result.evidence);
      }

      refreshedCount++;
    } catch {
      // Adapter error — keep existing check as-is
    }
  }

  // Re-classify findings with merged checks
  const findings = classifyFindings(allChecks, existingRun.variants);

  // Re-score opinion
  const riskTolerance = existingRun.intake?.riskTolerance || "conservative";
  const opinion = scoreOpinion(
    { checks: allChecks, findings, variants: existingRun.variants, evidence: allEvidence },
    { riskTolerance }
  );

  // Build refreshed run object
  const originalRunId = existingRun.run?.runId || "unknown";
  const dateStr = now.slice(0, 10);
  const inputsSha256 = hashObject(existingRun.intake);
  const runId = `run.${dateStr}.${inputsSha256.slice(0, 8)}.refresh`;

  const refreshedRun = {
    ...existingRun,
    run: {
      ...existingRun.run,
      runId,
      createdAt: now,
      notes: `Refreshed from ${originalRunId}`,
    },
    checks: allChecks,
    findings,
    evidence: allEvidence,
    opinion,
  };

  return {
    refreshed: true,
    run: refreshedRun,
    staleCount: staleAdapters.length,
    refreshedCount,
  };
}

/**
 * Build adapter map keyed by namespace.
 */
function buildAdapterMap(fetchWithRetry) {
  return {
    github_org: createGitHubAdapter(fetchWithRetry),
    github_repo: createGitHubAdapter(fetchWithRetry),
    npm: createNpmAdapter(fetchWithRetry),
    pypi: createPyPIAdapter(fetchWithRetry),
    domain: createDomainAdapter(fetchWithRetry),
    cratesio: createCratesIoAdapter(fetchWithRetry),
    dockerhub: createDockerHubAdapter(fetchWithRetry),
    huggingface_model: createHuggingFaceAdapter(fetchWithRetry),
    huggingface_space: createHuggingFaceAdapter(fetchWithRetry),
  };
}

/**
 * Resolve a stale adapter entry to a callable function.
 */
function resolveAdapterCall(adapterMap, stale) {
  const { adapter, query } = stale;

  if (adapter === "github_org") {
    const gh = adapterMap.github_org;
    return (opts) => gh.checkOrg(query.org || query.name, opts);
  }
  if (adapter === "github_repo") {
    const gh = adapterMap.github_repo;
    return (opts) => gh.checkRepo(query.owner, query.repo || query.name, opts);
  }
  if (adapter === "npm") {
    const npm = adapterMap.npm;
    return (opts) => npm.checkPackage(query.name, opts);
  }
  if (adapter === "pypi") {
    const pypi = adapterMap.pypi;
    return (opts) => pypi.checkPackage(query.name, opts);
  }
  if (adapter === "domain") {
    const domain = adapterMap.domain;
    return (opts) => domain.checkDomain(query.name, query.tld, opts);
  }
  if (adapter === "cratesio") {
    const crates = adapterMap.cratesio;
    return (opts) => crates.checkCrate(query.name, opts);
  }
  if (adapter === "dockerhub") {
    const docker = adapterMap.dockerhub;
    return (opts) => docker.checkRepo(query.namespace, query.name, opts);
  }
  if (adapter === "huggingface_model") {
    const hf = adapterMap.huggingface_model;
    return (opts) => hf.checkModel(query.owner, query.name, opts);
  }
  if (adapter === "huggingface_space") {
    const hf = adapterMap.huggingface_space;
    return (opts) => hf.checkSpace(query.owner, query.name, opts);
  }

  return null;
}
