/**
 * Domain namespace adapter for clearance-opinion-engine.
 *
 * Checks domain name availability via the RDAP protocol (RFC 9083).
 * Uses adapter factory pattern for fixture injection.
 *
 * RDAP endpoint: https://rdap.org/domain/{fqdn}
 * - 200 = domain registered (taken)
 * - 404 = domain not found (available)
 * - 429 = rate limited
 * - 302 = redirect to authoritative registry (followed automatically by fetch)
 */

import { checkId, evidenceId } from "../lib/ids.mjs";
import { hashString } from "../lib/hash.mjs";

/**
 * Create a domain adapter using RDAP.
 *
 * @param {typeof globalThis.fetch} [fetchFn] - Fetch implementation (injectable for tests)
 * @param {{ tlds?: string[] }} [opts] - Options
 * @returns {{ checkDomain: Function }}
 */
export function createDomainAdapter(fetchFn = globalThis.fetch, opts = {}) {
  const tlds = opts.tlds || [".com", ".dev"];

  /**
   * Check if a domain name is available via RDAP.
   *
   * @param {string} name - Base name (without TLD)
   * @param {string} tld - TLD including dot (e.g. ".com")
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ check: object, evidence: object }>}
   */
  async function checkDomain(name, tld, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const fqdn = `${name}${tld}`;
    const id = checkId("domain", fqdn);
    const evId = evidenceId(id, 0);
    const url = `https://rdap.org/domain/${encodeURIComponent(fqdn)}`;

    try {
      const res = await fetchFn(url, {
        headers: { Accept: "application/rdap+json" },
      });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      let status;
      let authority;
      let claimability;
      const errors = [];

      if (res.status === 200) {
        status = "taken";
        authority = "authoritative";
        claimability = "not_claimable";
      } else if (res.status === 404) {
        status = "available";
        authority = "authoritative";
        claimability = "claimable_now";
      } else if (res.status === 429) {
        status = "unknown";
        authority = "indicative";
        claimability = "unknown";
        errors.push({
          code: "COE.ADAPTER.DOMAIN_RATE_LIMITED",
          message: "RDAP rate limit exceeded",
        });
      } else {
        status = "unknown";
        authority = "indicative";
        claimability = "unknown";
      }

      return {
        check: {
          id,
          namespace: "domain",
          query: { candidateMark: name, value: fqdn },
          status,
          authority,
          claimability,
          observedAt: now,
          evidenceRef: evId,
          errors,
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "rdap", url, method: "GET" },
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
          namespace: "domain",
          query: { candidateMark: name, value: fqdn },
          status: "unknown",
          authority: "indicative",
          claimability: "unknown",
          observedAt: now,
          errors: [{ code: "COE.ADAPTER.DOMAIN_FAIL", message: err.message }],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "rdap", url, method: "GET" },
          observedAt: now,
          notes: `Network error: ${err.message}`,
        },
      };
    }
  }

  return { checkDomain, tlds };
}
