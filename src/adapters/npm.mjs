/**
 * npm registry adapter for clearance-opinion-engine.
 *
 * Checks package name availability via the npm registry API.
 * Uses adapter factory pattern for fixture injection.
 */

import { checkId, evidenceId } from "../lib/ids.mjs";
import { hashString } from "../lib/hash.mjs";

/**
 * Create an npm adapter.
 *
 * @param {typeof globalThis.fetch} [fetchFn] - Fetch implementation (injectable for tests)
 * @returns {{ checkPackage: Function }}
 */
export function createNpmAdapter(fetchFn = globalThis.fetch) {
  /**
   * Check if an npm package name is available.
   *
   * @param {string} name - Package name to check
   * @param {{ now?: string }} [opts]
   * @returns {Promise<{ check: object, evidence: object }>}
   */
  async function checkPackage(name, opts = {}) {
    const now = opts.now || new Date().toISOString();
    const id = checkId("npm", name);
    const evId = evidenceId(id, 0);
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;

    try {
      const res = await fetchFn(url, {
        headers: { Accept: "application/json" },
      });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const status = res.status === 404 ? "available" : res.status === 200 ? "taken" : "unknown";
      const authority = res.status === 404 || res.status === 200 ? "authoritative" : "indicative";

      return {
        check: {
          id,
          namespace: "npm",
          query: { candidateMark: name, value: name },
          status,
          authority,
          observedAt: now,
          evidenceRef: evId,
          errors: [],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "npm", url, method: "GET" },
          observedAt: now,
          sha256,
          bytes: bodyText.length,
          repro: [`curl -s -o /dev/null -w "%{http_code}" "${url}"`],
        },
      };
    } catch (err) {
      return {
        check: {
          id,
          namespace: "npm",
          query: { candidateMark: name, value: name },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          errors: [{ code: "COE.ADAPTER.NPM_FAIL", message: err.message }],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "npm", url, method: "GET" },
          observedAt: now,
          notes: `Network error: ${err.message}`,
        },
      };
    }
  }

  return { checkPackage };
}
