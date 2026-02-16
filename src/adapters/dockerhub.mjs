/**
 * Docker Hub adapter for clearance-opinion-engine.
 *
 * Checks Docker repository name availability via the Docker Hub API.
 * Uses adapter factory pattern for fixture injection.
 *
 * Docker Hub is NOT a flat namespace — repos live under a namespace (org/user).
 * The --dockerNamespace flag is required; without it, the check is skipped with
 * COE.DOCKER.NAMESPACE_REQUIRED.
 */

import { checkId, evidenceId } from "../lib/ids.mjs";
import { hashString } from "../lib/hash.mjs";

/**
 * Create a Docker Hub adapter.
 *
 * @param {typeof globalThis.fetch} [fetchFn] - Fetch implementation (injectable for tests)
 * @param {{ version?: string }} [opts]
 * @returns {{ checkRepo: Function }}
 */
export function createDockerHubAdapter(fetchFn = globalThis.fetch, opts = {}) {
  /**
   * Check if a Docker Hub repository name is available.
   *
   * @param {string|null} namespace - Docker Hub namespace (org or user). null → skipped.
   * @param {string} name - Repository name to check
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ check: object, evidence: object }>}
   */
  async function checkRepo(namespace, name, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const id = checkId("dockerhub", namespace ? `${namespace}-${name}` : name);
    const evId = evidenceId(id, 0);

    // Skip if no namespace provided
    if (!namespace) {
      return {
        check: {
          id,
          namespace: "dockerhub",
          query: { candidateMark: name, value: name },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          details: { source: "dockerhub" },
          errors: [
            {
              code: "COE.DOCKER.NAMESPACE_REQUIRED",
              message:
                "Docker Hub requires a namespace (org or user). Use --dockerNamespace <ns> to specify one.",
            },
          ],
        },
        evidence: {
          id: evId,
          type: "skipped",
          source: { system: "dockerhub" },
          observedAt: now,
          notes: "Skipped: no Docker Hub namespace provided",
        },
      };
    }

    const url = `https://hub.docker.com/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;

    try {
      const res = await fetchFn(url, {
        headers: { Accept: "application/json" },
      });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const status = res.status === 404 ? "available" : res.status === 200 ? "taken" : "unknown";
      const authority = res.status === 404 || res.status === 200 ? "authoritative" : "indicative";

      // Extract metadata when taken
      const details = { source: "dockerhub" };
      if (status === "taken") {
        try {
          const data = JSON.parse(bodyText);
          if (data.name) details.repoName = data.name;
          if (data.star_count !== undefined) details.starCount = data.star_count;
          if (data.pull_count !== undefined) details.pullCount = data.pull_count;
        } catch {
          // Ignore parse errors for details
        }
      }

      return {
        check: {
          id,
          namespace: "dockerhub",
          query: { candidateMark: name, value: `${namespace}/${name}` },
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
          source: { system: "dockerhub", url, method: "GET" },
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
          namespace: "dockerhub",
          query: { candidateMark: name, value: `${namespace}/${name}` },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          details: { source: "dockerhub" },
          errors: [{ code: "COE.ADAPTER.DOCKERHUB_FAIL", message: err.message }],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "dockerhub", url, method: "GET" },
          observedAt: now,
          notes: `Network error: ${err.message}`,
        },
      };
    }
  }

  return { checkRepo };
}
