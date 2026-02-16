/**
 * Configuration helpers for clearance-opinion-engine.
 */

/**
 * Resolve the cache directory from CLI flag or environment variable.
 *
 * @param {string|null} flagValue - Value from --cache-dir flag
 * @returns {string|null} Resolved cache directory or null
 */
export function resolveCacheDir(flagValue) {
  return flagValue || process.env.COE_CACHE_DIR || null;
}
