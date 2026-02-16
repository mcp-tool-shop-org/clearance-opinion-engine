/**
 * crates.io adapter for clearance-opinion-engine.
 *
 * Checks crate name availability via the crates.io API.
 * Uses adapter factory pattern for fixture injection.
 *
 * Note: crates.io requires a User-Agent header on all requests.
 */

import { checkId, evidenceId } from "../lib/ids.mjs";
import { hashString } from "../lib/hash.mjs";

const USER_AGENT = "clearance-opinion-engine (https://github.com/mcp-tool-shop-org/clearance-opinion-engine)";

/**
 * Create a crates.io adapter.
 *
 * @param {typeof globalThis.fetch} [fetchFn] - Fetch implementation (injectable for tests)
 * @param {{ version?: string }} [opts]
 * @returns {{ checkCrate: Function }}
 */
export function createCratesIoAdapter(fetchFn = globalThis.fetch, opts = {}) {
  /**
   * Check if a crate name is available.
   *
   * @param {string} name - Crate name to check
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ check: object, evidence: object }>}
   */
  async function checkCrate(name, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const id = checkId("cratesio", name);
    const evId = evidenceId(id, 0);
    const url = `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`;

    try {
      const res = await fetchFn(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const status = res.status === 404 ? "available" : res.status === 200 ? "taken" : "unknown";
      const authority = res.status === 404 || res.status === 200 ? "authoritative" : "indicative";

      // Extract metadata when taken
      const details = { source: "cratesio" };
      if (status === "taken") {
        try {
          const data = JSON.parse(bodyText);
          if (data.crate) {
            details.crateName = data.crate.name;
            details.crateCreatedAt = data.crate.created_at;
            details.crateDownloads = data.crate.downloads;
          }
        } catch {
          // Ignore parse errors for details — status is still valid
        }
      }

      return {
        check: {
          id,
          namespace: "cratesio",
          query: { candidateMark: name, value: name },
          status,
          authority,
          observedAt: now,
          evidenceRef: evId,
          details,
          errors: [],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "cratesio", url, method: "GET" },
          observedAt: now,
          sha256,
          bytes: bodyText.length,
          repro: [`curl -s -H "User-Agent: ${USER_AGENT}" -o /dev/null -w "%{http_code}" "${url}"`],
        },
      };
    } catch (err) {
      return {
        check: {
          id,
          namespace: "cratesio",
          query: { candidateMark: name, value: name },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          details: { source: "cratesio" },
          errors: [{ code: "COE.ADAPTER.CRATESIO_FAIL", message: err.message }],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "cratesio", url, method: "GET" },
          observedAt: now,
          notes: `Network error: ${err.message}`,
        },
      };
    }
  }

  return { checkCrate };
}
