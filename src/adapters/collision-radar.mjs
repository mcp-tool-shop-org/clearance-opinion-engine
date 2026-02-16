/**
 * Collision Radar adapter for clearance-opinion-engine.
 *
 * Searches GitHub repos and npm packages for market-usage signals.
 * All results are labeled authority: "indicative" — these are NOT
 * trademark searches, just ecosystem collision detection.
 *
 * Factory pattern with injectable fetch for testability.
 */

import { checkId, evidenceId } from "../lib/ids.mjs";
import { hashString } from "../lib/hash.mjs";
import { comparePair } from "../scoring/similarity.mjs";

const ADAPTER_VERSION = "0.3.0";

/**
 * Create a Collision Radar adapter.
 *
 * @param {typeof globalThis.fetch} [fetchFn]
 * @param {{ token?: string, similarityThreshold?: number }} [opts]
 * @returns {{ searchGitHub: Function, searchNpm: Function, scanAll: Function, ADAPTER_VERSION: string }}
 */
export function createCollisionRadarAdapter(fetchFn = globalThis.fetch, opts = {}) {
  const token = opts.token || "";
  const similarityThreshold = opts.similarityThreshold ?? 0.70;

  /**
   * Search GitHub repositories for name usage signals.
   *
   * @param {string} candidateMark
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ checks: object[], evidence: object[] }>}
   */
  async function searchGitHub(candidateMark, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(candidateMark)}&per_page=5`;

    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const checks = [];
    const evidence = [];

    try {
      const res = await fetchFn(url, { headers });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      // Create search-level evidence
      const searchCheckId = checkId("collision-radar", `github-search-${candidateMark}`);
      const searchEvId = evidenceId(searchCheckId, 0);

      evidence.push({
        id: searchEvId,
        type: "json",
        source: { system: "github_search", url, method: "GET" },
        observedAt: now,
        sha256,
        bytes: bodyText.length,
        repro: [`curl -s "${url}" -H "Accept: application/vnd.github+json"`],
      });

      if (res.status !== 200) {
        // Search failed — return single unknown check
        checks.push({
          id: searchCheckId,
          namespace: "custom",
          query: { candidateMark, value: candidateMark },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          evidenceRef: searchEvId,
          errors: [{ code: "COE.ADAPTER.RADAR_GITHUB_FAIL", message: `GitHub search returned ${res.status}` }],
        });
        return { checks, evidence };
      }

      const data = JSON.parse(bodyText);
      const items = data.items || [];

      for (const item of items) {
        const repoName = item.name || "";
        const comparison = comparePair(candidateMark, repoName);

        if (comparison.overall < similarityThreshold) continue;

        const itemCheckId = checkId("collision-radar", `github-${item.full_name}`);
        const itemEvId = evidenceId(itemCheckId, 0);

        checks.push({
          id: itemCheckId,
          namespace: "custom",
          query: { candidateMark, value: repoName },
          status: "taken",
          authority: "indicative",
          observedAt: now,
          evidenceRef: itemEvId,
          errors: [],
          details: {
            source: "github_search",
            repoFullName: item.full_name,
            stars: item.stargazers_count || 0,
            similarity: comparison,
          },
        });

        evidence.push({
          id: itemEvId,
          type: "json",
          source: {
            system: "github_search",
            url: `https://github.com/${item.full_name}`,
            method: "GET",
          },
          observedAt: now,
          sha256,
          repro: [`curl -s "https://api.github.com/repos/${item.full_name}"`],
        });
      }
    } catch (err) {
      const errCheckId = checkId("collision-radar", `github-search-${candidateMark}`);
      const errEvId = evidenceId(errCheckId, 0);

      checks.push({
        id: errCheckId,
        namespace: "custom",
        query: { candidateMark, value: candidateMark },
        status: "unknown",
        authority: "indicative",
        observedAt: now,
        evidenceRef: errEvId,
        errors: [{ code: "COE.ADAPTER.RADAR_GITHUB_FAIL", message: err.message }],
      });

      evidence.push({
        id: errEvId,
        type: "json",
        source: { system: "github_search", url, method: "GET" },
        observedAt: now,
        notes: `Network error: ${err.message}`,
      });
    }

    return { checks, evidence };
  }

  /**
   * Search npm registry for similar packages.
   *
   * @param {string} candidateMark
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ checks: object[], evidence: object[] }>}
   */
  async function searchNpm(candidateMark, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(candidateMark)}&size=5`;

    const checks = [];
    const evidence = [];

    try {
      const res = await fetchFn(url);
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const searchCheckId = checkId("collision-radar", `npm-search-${candidateMark}`);
      const searchEvId = evidenceId(searchCheckId, 0);

      evidence.push({
        id: searchEvId,
        type: "json",
        source: { system: "npm_search", url, method: "GET" },
        observedAt: now,
        sha256,
        bytes: bodyText.length,
        repro: [`curl -s "${url}"`],
      });

      if (res.status !== 200) {
        checks.push({
          id: searchCheckId,
          namespace: "custom",
          query: { candidateMark, value: candidateMark },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          evidenceRef: searchEvId,
          errors: [{ code: "COE.ADAPTER.RADAR_NPM_FAIL", message: `npm search returned ${res.status}` }],
        });
        return { checks, evidence };
      }

      const data = JSON.parse(bodyText);
      const objects = data.objects || [];

      for (const obj of objects) {
        const pkgName = obj.package?.name || "";
        const comparison = comparePair(candidateMark, pkgName);

        if (comparison.overall < similarityThreshold) continue;

        const itemCheckId = checkId("collision-radar", `npm-${pkgName}`);
        const itemEvId = evidenceId(itemCheckId, 0);

        checks.push({
          id: itemCheckId,
          namespace: "custom",
          query: { candidateMark, value: pkgName },
          status: "taken",
          authority: "indicative",
          observedAt: now,
          evidenceRef: itemEvId,
          errors: [],
          details: {
            source: "npm_search",
            packageName: pkgName,
            similarity: comparison,
          },
        });

        evidence.push({
          id: itemEvId,
          type: "json",
          source: {
            system: "npm_search",
            url: `https://www.npmjs.com/package/${encodeURIComponent(pkgName)}`,
            method: "GET",
          },
          observedAt: now,
          sha256,
          repro: [`curl -s "https://registry.npmjs.org/${encodeURIComponent(pkgName)}"`],
        });
      }
    } catch (err) {
      const errCheckId = checkId("collision-radar", `npm-search-${candidateMark}`);
      const errEvId = evidenceId(errCheckId, 0);

      checks.push({
        id: errCheckId,
        namespace: "custom",
        query: { candidateMark, value: candidateMark },
        status: "unknown",
        authority: "indicative",
        observedAt: now,
        evidenceRef: errEvId,
        errors: [{ code: "COE.ADAPTER.RADAR_NPM_FAIL", message: err.message }],
      });

      evidence.push({
        id: errEvId,
        type: "json",
        source: { system: "npm_search", url, method: "GET" },
        observedAt: now,
        notes: `Network error: ${err.message}`,
      });
    }

    return { checks, evidence };
  }

  /**
   * Search crates.io for similar crate names.
   *
   * @param {string} candidateMark
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ checks: object[], evidence: object[] }>}
   */
  async function searchCratesIo(candidateMark, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(candidateMark)}&per_page=5`;

    const checks = [];
    const evidence = [];

    try {
      const res = await fetchFn(url, {
        headers: { "User-Agent": "clearance-opinion-engine" },
      });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const searchChkId = checkId("collision-radar", `cratesio-search-${candidateMark}`);
      const searchEvId = evidenceId(searchChkId, 0);

      evidence.push({
        id: searchEvId,
        type: "json",
        source: { system: "cratesio_search", url, method: "GET" },
        observedAt: now,
        sha256,
        bytes: bodyText.length,
        repro: [`curl -s "${url}" -H "User-Agent: clearance-opinion-engine"`],
      });

      if (res.status !== 200) {
        checks.push({
          id: searchChkId,
          namespace: "custom",
          query: { candidateMark, value: candidateMark },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          evidenceRef: searchEvId,
          errors: [{ code: "COE.ADAPTER.RADAR_CRATESIO_FAIL", message: `crates.io search returned ${res.status}` }],
        });
        return { checks, evidence };
      }

      const data = JSON.parse(bodyText);
      const crates = data.crates || [];

      for (const crate of crates) {
        const crateName = crate.name || "";
        const comparison = comparePair(candidateMark, crateName);
        if (comparison.overall < similarityThreshold) continue;

        const itemChkId = checkId("collision-radar", `cratesio-${crateName}`);
        const itemEvId = evidenceId(itemChkId, 0);

        checks.push({
          id: itemChkId,
          namespace: "custom",
          query: { candidateMark, value: crateName },
          status: "taken",
          authority: "indicative",
          observedAt: now,
          evidenceRef: itemEvId,
          errors: [],
          details: {
            source: "cratesio_search",
            crateName,
            downloads: crate.downloads || 0,
            similarity: comparison,
          },
        });

        evidence.push({
          id: itemEvId,
          type: "json",
          source: { system: "cratesio_search", url: `https://crates.io/crates/${encodeURIComponent(crateName)}`, method: "GET" },
          observedAt: now,
          sha256,
          repro: [`curl -s "https://crates.io/api/v1/crates/${encodeURIComponent(crateName)}"`],
        });
      }
    } catch (err) {
      const errChkId = checkId("collision-radar", `cratesio-search-${candidateMark}`);
      const errEvId = evidenceId(errChkId, 0);
      checks.push({
        id: errChkId,
        namespace: "custom",
        query: { candidateMark, value: candidateMark },
        status: "unknown",
        authority: "indicative",
        observedAt: now,
        evidenceRef: errEvId,
        errors: [{ code: "COE.ADAPTER.RADAR_CRATESIO_FAIL", message: err.message }],
      });
      evidence.push({
        id: errEvId,
        type: "json",
        source: { system: "cratesio_search", url, method: "GET" },
        observedAt: now,
        notes: `Network error: ${err.message}`,
      });
    }

    return { checks, evidence };
  }

  /**
   * Search Docker Hub for similar repository names.
   *
   * @param {string} candidateMark
   * @param {{ now?: string }} [checkOpts]
   * @returns {Promise<{ checks: object[], evidence: object[] }>}
   */
  async function searchDockerHub(candidateMark, checkOpts = {}) {
    const now = checkOpts.now || new Date().toISOString();
    const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(candidateMark)}&page_size=5`;

    const checks = [];
    const evidence = [];

    try {
      const res = await fetchFn(url);
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const searchChkId = checkId("collision-radar", `dockerhub-search-${candidateMark}`);
      const searchEvId = evidenceId(searchChkId, 0);

      evidence.push({
        id: searchEvId,
        type: "json",
        source: { system: "dockerhub_search", url, method: "GET" },
        observedAt: now,
        sha256,
        bytes: bodyText.length,
        repro: [`curl -s "${url}"`],
      });

      if (res.status !== 200) {
        checks.push({
          id: searchChkId,
          namespace: "custom",
          query: { candidateMark, value: candidateMark },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          evidenceRef: searchEvId,
          errors: [{ code: "COE.ADAPTER.RADAR_DOCKERHUB_FAIL", message: `Docker Hub search returned ${res.status}` }],
        });
        return { checks, evidence };
      }

      const data = JSON.parse(bodyText);
      const repos = data.results || [];

      for (const repo of repos) {
        const repoName = repo.repo_name || repo.name || "";
        const comparison = comparePair(candidateMark, repoName);
        if (comparison.overall < similarityThreshold) continue;

        const itemChkId = checkId("collision-radar", `dockerhub-${repoName}`);
        const itemEvId = evidenceId(itemChkId, 0);

        checks.push({
          id: itemChkId,
          namespace: "custom",
          query: { candidateMark, value: repoName },
          status: "taken",
          authority: "indicative",
          observedAt: now,
          evidenceRef: itemEvId,
          errors: [],
          details: {
            source: "dockerhub_search",
            repoName,
            stars: repo.star_count || 0,
            similarity: comparison,
          },
        });

        evidence.push({
          id: itemEvId,
          type: "json",
          source: { system: "dockerhub_search", url: `https://hub.docker.com/r/${encodeURIComponent(repoName)}`, method: "GET" },
          observedAt: now,
          sha256,
          repro: [`curl -s "https://hub.docker.com/v2/repositories/${encodeURIComponent(repoName)}"`],
        });
      }
    } catch (err) {
      const errChkId = checkId("collision-radar", `dockerhub-search-${candidateMark}`);
      const errEvId = evidenceId(errChkId, 0);
      checks.push({
        id: errChkId,
        namespace: "custom",
        query: { candidateMark, value: candidateMark },
        status: "unknown",
        authority: "indicative",
        observedAt: now,
        evidenceRef: errEvId,
        errors: [{ code: "COE.ADAPTER.RADAR_DOCKERHUB_FAIL", message: err.message }],
      });
      evidence.push({
        id: errEvId,
        type: "json",
        source: { system: "dockerhub_search", url, method: "GET" },
        observedAt: now,
        notes: `Network error: ${err.message}`,
      });
    }

    return { checks, evidence };
  }

  /**
   * Scan all sources and return aggregated results.
   * Includes crates.io / Docker Hub when their channels are provided.
   *
   * @param {string} candidateMark
   * @param {{ now?: string, channels?: string[] }} [checkOpts]
   * @returns {Promise<{ checks: object[], evidence: object[] }>}
   */
  async function scanAll(candidateMark, checkOpts = {}) {
    const channels = checkOpts.channels || [];
    const promises = [
      searchGitHub(candidateMark, checkOpts),
      searchNpm(candidateMark, checkOpts),
    ];

    if (channels.includes("cratesio")) {
      promises.push(searchCratesIo(candidateMark, checkOpts));
    }
    if (channels.includes("dockerhub")) {
      promises.push(searchDockerHub(candidateMark, checkOpts));
    }

    const results = await Promise.allSettled(promises);

    const checks = [];
    const evidence = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        checks.push(...result.value.checks);
        evidence.push(...result.value.evidence);
      }
    }

    return { checks, evidence };
  }

  return { searchGitHub, searchNpm, searchCratesIo, searchDockerHub, scanAll, ADAPTER_VERSION };
}
