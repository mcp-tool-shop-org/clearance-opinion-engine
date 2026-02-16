/**
 * Time-windowed, content-addressed disk cache for clearance-opinion-engine.
 *
 * - Keys: SHA-256 of { adapter, query, version }
 * - Values: JSON files on disk
 * - TTL: configurable maxAgeHours
 * - Atomic writes: write to .tmp, rename
 * - Clock injectable for deterministic testing
 * - Opt-in: no cacheDir = no caching
 *
 * The cache is a performance hint, not a logic dependency.
 * Run artifacts still record cacheHit: true/false per check.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  unlinkSync,
  existsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { hashObject } from "./hash.mjs";

/**
 * Create a cache instance.
 *
 * @param {string} cacheDir - Directory for cache files
 * @param {{ maxAgeHours?: number, now?: () => string }} [opts]
 * @returns {{ get: Function, set: Function, clear: Function, stats: Function, cacheKey: Function }}
 */
export function createCache(cacheDir, opts = {}) {
  const maxAgeHours = opts.maxAgeHours ?? 24;
  const nowFn = opts.now || (() => new Date().toISOString());

  // Ensure cache directory exists
  mkdirSync(cacheDir, { recursive: true });

  /**
   * Compute a deterministic cache key from adapter, query, and version.
   *
   * @param {string} adapter
   * @param {object} query
   * @param {string} version
   * @returns {string} SHA-256 hex key
   */
  function cacheKey(adapter, query, version) {
    return hashObject({ adapter, query, version });
  }

  /**
   * Get a cached entry if it exists and is not expired.
   *
   * @param {string} adapter
   * @param {object} query
   * @param {string} version
   * @returns {{ data: object } | null}
   */
  function get(adapter, query, version) {
    const key = cacheKey(adapter, query, version);
    const filePath = join(cacheDir, `${key}.json`);

    if (!existsSync(filePath)) return null;

    try {
      const raw = readFileSync(filePath, "utf8");
      const entry = JSON.parse(raw);

      // Check expiration
      const now = new Date(nowFn());
      const expiresAt = new Date(entry.expiresAt);
      if (now >= expiresAt) return null;

      return { data: entry.data };
    } catch {
      // Corrupted JSON — return null, do not throw
      return null;
    }
  }

  /**
   * Store a cache entry with atomic write.
   *
   * @param {string} adapter
   * @param {object} query
   * @param {string} version
   * @param {object} data
   */
  function set(adapter, query, version, data) {
    const key = cacheKey(adapter, query, version);
    const filePath = join(cacheDir, `${key}.json`);
    const tmpPath = join(cacheDir, `${key}.tmp.${randomBytes(4).toString("hex")}`);

    const now = nowFn();
    const expiresAt = new Date(new Date(now).getTime() + maxAgeHours * 60 * 60 * 1000).toISOString();

    const entry = {
      storedAt: now,
      expiresAt,
      adapter,
      version,
      data,
    };

    writeFileSync(tmpPath, JSON.stringify(entry, null, 2) + "\n", "utf8");
    renameSync(tmpPath, filePath);
  }

  /**
   * Clear cache entries.
   *
   * @param {{ expiredOnly?: boolean }} [clearOpts]
   * @returns {{ cleared: number }}
   */
  function clear(clearOpts = {}) {
    const expiredOnly = clearOpts.expiredOnly ?? false;
    let cleared = 0;

    if (!existsSync(cacheDir)) return { cleared };

    const files = readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    const now = new Date(nowFn());

    for (const file of files) {
      const filePath = join(cacheDir, file);

      if (expiredOnly) {
        try {
          const raw = readFileSync(filePath, "utf8");
          const entry = JSON.parse(raw);
          const expiresAt = new Date(entry.expiresAt);
          if (now < expiresAt) continue; // not expired, skip
        } catch {
          // Corrupted — treat as expired
        }
      }

      try {
        unlinkSync(filePath);
        cleared++;
      } catch {
        // ignore cleanup errors
      }
    }

    return { cleared };
  }

  /**
   * Get cache statistics.
   *
   * @returns {{ entries: number, totalBytes: number }}
   */
  function stats() {
    if (!existsSync(cacheDir)) return { entries: 0, totalBytes: 0 };

    const files = readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    let totalBytes = 0;

    for (const file of files) {
      try {
        const st = statSync(join(cacheDir, file));
        totalBytes += st.size;
      } catch {
        // ignore stat errors
      }
    }

    return { entries: files.length, totalBytes };
  }

  return { get, set, clear, stats, cacheKey };
}
