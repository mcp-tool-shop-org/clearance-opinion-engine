/**
 * GitHub namespace adapter for clearance-opinion-engine.
 *
 * Checks org and repo name availability via the GitHub API.
 * Uses adapter factory pattern for fixture injection.
 */

import { checkId, evidenceId } from "../lib/ids.mjs";
import { hashString } from "../lib/hash.mjs";

/**
 * Create a GitHub adapter.
 *
 * @param {typeof globalThis.fetch} [fetchFn] - Fetch implementation (injectable for tests)
 * @param {{ token?: string }} [opts] - Options
 * @returns {{ checkOrg: Function, checkRepo: Function }}
 */
export function createGitHubAdapter(fetchFn = globalThis.fetch, opts = {}) {
  const token = opts.token || process.env.GITHUB_TOKEN || "";

  function headers() {
    const h = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) h["Authorization"] = `token ${token}`;
    return h;
  }

  /**
   * Check if a GitHub org name is available.
   *
   * @param {string} name - Org name to check
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ check: object, evidence: object }>}
   */
  async function checkOrg(name, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const id = checkId("github-org", name);
    const evId = evidenceId(id, 0);
    const url = `https://api.github.com/orgs/${encodeURIComponent(name)}`;

    try {
      const res = await fetchFn(url, { headers: headers() });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const status = res.status === 404 ? "available" : res.status === 200 ? "taken" : "unknown";
      const authority = res.status === 404 || res.status === 200 ? "authoritative" : "indicative";

      return {
        check: {
          id,
          namespace: "github_org",
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
          source: { system: "github", url, method: "GET" },
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
          namespace: "github_org",
          query: { candidateMark: name, value: name },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          errors: [{ code: "COE.ADAPTER.GITHUB_FAIL", message: err.message }],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "github", url, method: "GET" },
          observedAt: now,
          notes: `Network error: ${err.message}`,
        },
      };
    }
  }

  /**
   * Check if a GitHub repo name is available under a given owner.
   *
   * @param {string} owner - Org or user
   * @param {string} name - Repo name to check
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ check: object, evidence: object }>}
   */
  async function checkRepo(owner, name, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const id = checkId("github-repo", `${owner}/${name}`);
    const evId = evidenceId(id, 0);
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

    try {
      const res = await fetchFn(url, { headers: headers() });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const status = res.status === 404 ? "available" : res.status === 200 ? "taken" : "unknown";
      const authority = res.status === 404 || res.status === 200 ? "authoritative" : "indicative";

      return {
        check: {
          id,
          namespace: "github_repo",
          query: { candidateMark: name, value: name, owner },
          status,
          authority,
          observedAt: now,
          evidenceRef: evId,
          errors: [],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "github", url, method: "GET" },
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
          namespace: "github_repo",
          query: { candidateMark: name, value: name, owner },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          errors: [{ code: "COE.ADAPTER.GITHUB_FAIL", message: err.message }],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "github", url, method: "GET" },
          observedAt: now,
          notes: `Network error: ${err.message}`,
        },
      };
    }
  }

  return { checkOrg, checkRepo };
}
