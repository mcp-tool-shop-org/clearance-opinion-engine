/**
 * Batch runner — check multiple names with shared cache + concurrency pool.
 *
 * runBatch(names, opts) → { results[], errors[], stats }
 *
 * Errors in individual names are captured, not thrown.
 * Results are sorted by candidate name for deterministic output.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { runCheck } from "../pipeline.mjs";
import { createPool } from "../lib/concurrency.mjs";
import { createCache } from "../lib/cache.mjs";
import { createAdaptiveBackoff } from "../lib/adaptive-backoff.mjs";

/**
 * Run the clearance pipeline for multiple candidate names.
 *
 * @param {Array<{ name: string, config?: object }>} names
 * @param {object} opts
 * @param {number} [opts.concurrency] - Max simultaneous checks (default: 4)
 * @param {string[]} [opts.channels] - Channels to check
 * @param {string} [opts.org] - GitHub org name
 * @param {string} [opts.dockerNamespace] - Docker Hub namespace
 * @param {string} [opts.hfOwner] - Hugging Face owner
 * @param {string} [opts.riskTolerance] - Risk level
 * @param {boolean} [opts.useRadar] - Enable collision radar
 * @param {string} [opts.corpusPath] - Path to corpus file
 * @param {string} [opts.fuzzyQueryMode] - Fuzzy query mode
 * @param {number} [opts.variantBudget] - Max fuzzy variants
 * @param {string} [opts.cacheDir] - Cache directory (shared across batch)
 * @param {number} [opts.maxAgeHours] - Cache TTL
 * @param {Function} [opts.fetchFn] - Injectable fetch function
 * @param {string} [opts.now] - Injectable ISO timestamp
 * @param {string} [opts.resumeDir] - Path to previous batch output for resume
 * @returns {Promise<{ results: object[], errors: object[], stats: object }>}
 */
export async function runBatch(names, opts = {}) {
  const {
    concurrency = 4,
    channels,
    org,
    dockerNamespace,
    hfOwner,
    riskTolerance,
    useRadar,
    corpusPath,
    fuzzyQueryMode,
    variantBudget,
    cacheDir,
    maxAgeHours,
    fetchFn,
    now,
    resumeDir,
  } = opts;

  const startMs = Date.now();

  // Shared cache instance for all names
  const cache = cacheDir ? createCache(cacheDir, { maxAgeHours }) : null;

  // Adaptive backoff: wrap fetch for sustained rate-limit handling
  const baseFetch = fetchFn || globalThis.fetch;
  const adaptiveFetch = createAdaptiveBackoff(baseFetch);

  // Cost stats tracker
  const costBreakdown = {};
  let totalApiCalls = 0;
  let cachedCalls = 0;
  function costTracker(adapterName, info) {
    if (!costBreakdown[adapterName]) {
      costBreakdown[adapterName] = { calls: 0, cached: 0 };
    }
    costBreakdown[adapterName].calls++;
    totalApiCalls++;
    if (info?.cached) {
      costBreakdown[adapterName].cached++;
      cachedCalls++;
    }
  }

  // Concurrency pool
  const pool = createPool(concurrency);

  const results = [];
  const errors = [];

  // Resume support: load previously completed results
  const completedNames = new Set();
  let resumed = false;
  if (resumeDir) {
    const resultsPath = join(resolve(resumeDir), "batch", "results.json");
    if (existsSync(resultsPath)) {
      try {
        const prev = JSON.parse(readFileSync(resultsPath, "utf8"));
        const prevResults = Array.isArray(prev) ? prev : (prev.results || []);
        for (const r of prevResults) {
          const name = r.intake?.candidates?.[0]?.mark || r.name;
          if (name) {
            completedNames.add(name);
            // Re-add previous results to the current run
            results.push({ name, run: r.run || r, error: null });
          }
        }
        resumed = true;
      } catch {
        // If we can't read it, proceed without resume
      }
    }
  }

  // Enqueue each name (skip already-completed for resume)
  let skippedCount = 0;
  const promises = names.map((entry) => {
    const candidateName = typeof entry === "string" ? entry : entry.name;
    const perNameConfig = typeof entry === "object" && entry.config ? entry.config : {};

    if (completedNames.has(candidateName)) {
      skippedCount++;
      return Promise.resolve();
    }

    return pool.run(async () => {
      try {
        const run = await runCheck(candidateName, {
          channels: perNameConfig.channels || channels,
          org: perNameConfig.org || org,
          dockerNamespace: perNameConfig.dockerNamespace || dockerNamespace,
          hfOwner: perNameConfig.hfOwner || hfOwner,
          riskTolerance: perNameConfig.riskTolerance || riskTolerance,
          useRadar: perNameConfig.useRadar ?? useRadar,
          corpusPath: perNameConfig.corpusPath || corpusPath,
          fuzzyQueryMode: perNameConfig.fuzzyQueryMode || fuzzyQueryMode,
          variantBudget: perNameConfig.variantBudget ?? variantBudget,
          cache,
          fetchFn: adaptiveFetch,
          now,
          costTracker,
        });

        results.push({ name: candidateName, run, error: null });
      } catch (err) {
        errors.push({
          name: candidateName,
          error: err.message || String(err),
          code: err.code || null,
        });
      }
    });
  });

  // Wait for all names to complete
  await Promise.allSettled(promises);

  // Sort results by name for deterministic output
  results.sort((a, b) => a.name.localeCompare(b.name));
  errors.sort((a, b) => a.name.localeCompare(b.name));

  const durationMs = Date.now() - startMs;

  const stats = {
    total: names.length,
    succeeded: results.length,
    failed: errors.length,
    durationMs,
  };

  if (resumed) {
    stats.resumed = true;
    stats.skipped = skippedCount;
  }

  // Collect cost stats
  const backoffStats = adaptiveFetch.getStats?.() || {};
  const backoffEvents = Object.values(backoffStats.hosts || {})
    .reduce((sum, h) => sum + h.consecutiveFailures, 0);

  const costStats = {
    totalApiCalls,
    cachedCalls,
    adapterBreakdown: costBreakdown,
    backoffEvents,
  };

  return { results, errors, stats, costStats };
}
