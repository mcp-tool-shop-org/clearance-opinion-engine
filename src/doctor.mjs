/**
 * Environment sanity checker for clearance-opinion-engine.
 *
 * `coe doctor` runs diagnostic checks and reports pass/warn/fail
 * for each environment requirement.
 */

/**
 * Run environment sanity checks.
 *
 * @param {{ fetchFn?: Function, engineVersion?: string }} [opts]
 * @returns {Promise<Array<{ check: string, status: "pass"|"warn"|"fail", detail: string }>>}
 */
export async function runDoctor(opts = {}) {
  const { fetchFn = globalThis.fetch, engineVersion = "unknown" } = opts;
  const results = [];

  // 1. Node version >= 20
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.replace("v", "").split(".")[0], 10);
  results.push({
    check: "Node.js version",
    status: major >= 20 ? "pass" : "fail",
    detail: major >= 20
      ? `${nodeVersion} (>= 20 required)`
      : `${nodeVersion} — Node.js >= 20 is required`,
  });

  // 2. GITHUB_TOKEN
  const hasToken = !!process.env.GITHUB_TOKEN;
  results.push({
    check: "GITHUB_TOKEN",
    status: hasToken ? "pass" : "warn",
    detail: hasToken
      ? "Set (5,000 req/hr rate limit)"
      : "Not set (60 req/hr rate limit — set GITHUB_TOKEN for higher limits)",
  });

  // 3. Network reachability
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetchFn("https://registry.npmjs.org/", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    results.push({
      check: "Network reachability",
      status: "pass",
      detail: `npm registry reachable (HTTP ${res.status})`,
    });
  } catch (err) {
    results.push({
      check: "Network reachability",
      status: "warn",
      detail: `npm registry unreachable: ${err.message}`,
    });
  }

  // 4. Engine version (informational)
  results.push({
    check: "Engine version",
    status: "pass",
    detail: engineVersion,
  });

  return results;
}
