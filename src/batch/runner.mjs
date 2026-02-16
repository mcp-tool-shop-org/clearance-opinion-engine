/**
 * Batch runner — check multiple names with shared cache + concurrency pool.
 *
 * runBatch(names, opts) → { results[], errors[], stats }
 *
 * Errors in individual names are captured, not thrown.
 * Results are sorted by candidate name for deterministic output.
 */

import { runCheck } from "../pipeline.mjs";
import { createPool } from "../lib/concurrency.mjs";
import { createCache } from "../lib/cache.mjs";

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
  } = opts;

  const startMs = Date.now();

  // Shared cache instance for all names
  const cache = cacheDir ? createCache(cacheDir, { maxAgeHours }) : null;

  // Concurrency pool
  const pool = createPool(concurrency);

  const results = [];
  const errors = [];

  // Enqueue each name
  const promises = names.map((entry) => {
    const candidateName = typeof entry === "string" ? entry : entry.name;
    const perNameConfig = typeof entry === "object" && entry.config ? entry.config : {};

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
          fetchFn,
          now,
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

  return {
    results,
    errors,
    stats: {
      total: names.length,
      succeeded: results.length,
      failed: errors.length,
      durationMs,
    },
  };
}
