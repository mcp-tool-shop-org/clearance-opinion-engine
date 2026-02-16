/**
 * Freshness detection for clearance runs.
 *
 * Checks whether any evidence in a run is older than a threshold,
 * and identifies which adapter checks need refreshing.
 */

/**
 * Check freshness of a run.
 *
 * @param {object} run - A complete run object
 * @param {object} opts
 * @param {number} opts.maxAgeHours - Maximum acceptable age in hours
 * @param {string} [opts.now] - Injectable ISO timestamp (default: current time)
 * @returns {{ isStale: boolean, staleChecks: string[], oldestObservedAt: string|null, banner: string|null }}
 */
export function checkFreshness(run, opts = {}) {
  const { maxAgeHours = 24, now = new Date().toISOString() } = opts;

  const checks = run.checks || [];
  if (checks.length === 0) {
    return { isStale: false, staleChecks: [], oldestObservedAt: null, banner: null };
  }

  const nowMs = new Date(now).getTime();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const cutoff = nowMs - maxAgeMs;

  const staleChecks = [];
  let oldestMs = Infinity;
  let oldestAt = null;

  for (const check of checks) {
    if (!check.observedAt) continue;
    const observedMs = new Date(check.observedAt).getTime();

    if (observedMs < oldestMs) {
      oldestMs = observedMs;
      oldestAt = check.observedAt;
    }

    if (observedMs < cutoff) {
      staleChecks.push(check.id);
    }
  }

  const isStale = staleChecks.length > 0;
  const banner = isStale
    ? `Some evidence older than ${maxAgeHours} hours (oldest: ${oldestAt})`
    : null;

  return {
    isStale,
    staleChecks,
    oldestObservedAt: oldestAt,
    banner,
  };
}

/**
 * Find which adapters need refreshing.
 *
 * @param {object} run - A complete run object
 * @param {object} opts
 * @param {number} opts.maxAgeHours - Maximum acceptable age in hours
 * @param {string} [opts.now] - Injectable ISO timestamp
 * @returns {Array<{ adapter: string, query: object, checkId: string }>}
 */
export function findStaleAdapters(run, opts = {}) {
  const { maxAgeHours = 24, now = new Date().toISOString() } = opts;

  const checks = run.checks || [];
  const nowMs = new Date(now).getTime();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const cutoff = nowMs - maxAgeMs;

  const stale = [];

  for (const check of checks) {
    if (!check.observedAt) continue;
    const observedMs = new Date(check.observedAt).getTime();

    if (observedMs < cutoff) {
      stale.push({
        adapter: check.namespace,
        query: check.query,
        checkId: check.id,
      });
    }
  }

  return stale;
}
