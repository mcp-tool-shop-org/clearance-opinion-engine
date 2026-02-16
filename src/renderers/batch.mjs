/**
 * Batch renderers.
 *
 * renderBatchResultsJson — full results array
 * renderBatchSummaryCsv  — CSV summary table
 * renderBatchDashboardHtml — self-contained dark-theme HTML dashboard
 */

import { escapeHtml, escapeAttr } from "./html-escape.mjs";
import { checkFreshness } from "../lib/freshness.mjs";

/**
 * Render the full batch results as a JSON-serializable object.
 *
 * @param {object[]} results - Array of { name, run?, error? } objects
 * @returns {object} Serializable results array
 */
export function renderBatchResultsJson(results) {
  return results.map((r) => ({
    name: r.name,
    tier: r.run?.opinion?.tier ?? "error",
    score: r.run?.opinion?.scoreBreakdown?.overallScore ?? null,
    runId: r.run?.run?.runId ?? null,
    error: r.error ?? null,
    run: r.run ?? null,
  }));
}

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if it contains commas, quotes, or newlines.
 */
function csvEscape(val) {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Render a CSV summary of batch results.
 *
 * Columns: name, tier, score, topConflict, checksCount, findingsCount
 *
 * @param {object[]} results - Array of { name, run?, error? } objects
 * @returns {string} CSV content
 */
export function renderBatchSummaryCsv(results) {
  const header = "name,tier,score,topConflict,checksCount,findingsCount";
  const sorted = [...results].sort((a, b) => a.name.localeCompare(b.name));

  const rows = sorted.map((r) => {
    const name = csvEscape(r.name);
    const tier = r.run?.opinion?.tier ?? "error";
    const score = r.run?.opinion?.scoreBreakdown?.overallScore ?? "";
    const topConflict = r.run?.findings?.[0]?.summary ?? "";
    const checksCount = r.run?.checks?.length ?? 0;
    const findingsCount = r.run?.findings?.length ?? 0;
    return `${name},${tier},${score},${csvEscape(topConflict)},${checksCount},${findingsCount}`;
  });

  return [header, ...rows].join("\n") + "\n";
}

/**
 * Render a self-contained HTML dashboard for batch results.
 *
 * @param {object[]} results - Array of { name, run?, error? } objects
 * @param {object} stats - { total, succeeded, failed, durationMs }
 * @returns {string} Complete HTML page
 */
export function renderBatchDashboardHtml(results, stats = {}) {
  const sorted = [...results].sort((a, b) => a.name.localeCompare(b.name));
  const { total = 0, succeeded = 0, failed = 0, durationMs = 0, costStats } = stats;

  const tierColor = (tier) => {
    if (tier === "green") return "#22c55e";
    if (tier === "yellow") return "#eab308";
    if (tier === "red") return "#ef4444";
    return "#6b7280";
  };

  const tierEmoji = (tier) => {
    if (tier === "green") return "\u{1F7E2}";
    if (tier === "yellow") return "\u{1F7E1}";
    if (tier === "red") return "\u{1F534}";
    return "\u26AA";
  };

  const rows = sorted.map((r) => {
    const tier = r.run?.opinion?.tier ?? "error";
    const score = r.run?.opinion?.scoreBreakdown?.overallScore ?? "-";
    const topConflict = r.run?.findings?.[0]?.summary ?? "-";
    const checksCount = r.run?.checks?.length ?? 0;
    const findingsCount = r.run?.findings?.length ?? 0;
    const slug = r.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const link = `${escapeAttr(slug)}/report.html`;
    const freshness = r.run ? checkFreshness(r.run, { maxAgeHours: 24 }) : { isStale: false };
    const freshLabel = freshness.isStale ? "\u26A0\uFE0F Stale" : "\u2705";

    return `    <tr>
      <td><a href="${link}">${escapeHtml(r.name)}</a></td>
      <td style="color:${tierColor(tier)}">${tierEmoji(tier)} ${escapeHtml(tier.toUpperCase())}</td>
      <td>${escapeHtml(String(score))}</td>
      <td>${escapeHtml(String(topConflict))}</td>
      <td>${checksCount}</td>
      <td>${findingsCount}</td>
      <td>${freshLabel}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Batch Clearance Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; padding: 2rem; }
    h1 { color: #f0f6fc; font-size: 1.5rem; margin: 0 0 0.5rem; }
    .stats { color: #8b949e; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .stats span { margin-right: 1.5rem; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 2px solid #30363d; color: #8b949e; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #21262d; }
    tr:hover { background: #161b22; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer { margin-top: 2rem; color: #484f58; font-size: 0.8rem; text-align: center; }
  </style>
</head>
<body>
  <h1>Batch Clearance Report</h1>
  <div class="stats">
    <span>Total: ${total}</span>
    <span>Succeeded: ${succeeded}</span>
    <span>Failed: ${failed}</span>
    <span>Duration: ${(durationMs / 1000).toFixed(1)}s</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Tier</th>
        <th>Score</th>
        <th>Top Conflict</th>
        <th>Checks</th>
        <th>Findings</th>
        <th>Fresh</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  ${costStats ? `<h2 style="color:#f0f6fc;font-size:1.2rem;margin:1.5rem 0 0.5rem;">Cost Statistics</h2>
  <table>
    <thead>
      <tr><th>Adapter</th><th>API Calls</th><th>Cached</th><th>Cache Rate</th></tr>
    </thead>
    <tbody>
      ${Object.entries(costStats.adapterBreakdown || {}).sort(([a],[b]) => a.localeCompare(b)).map(([name, data]) => {
        const rate = data.calls > 0 ? ((data.cached / data.calls) * 100).toFixed(0) + "%" : "-";
        return `<tr><td>${escapeHtml(name)}</td><td>${data.calls}</td><td>${data.cached}</td><td>${rate}</td></tr>`;
      }).join("\n      ")}
      <tr style="border-top:2px solid #30363d;font-weight:bold"><td>Total</td><td>${costStats.totalApiCalls}</td><td>${costStats.cachedCalls}</td><td>${costStats.totalApiCalls > 0 ? ((costStats.cachedCalls / costStats.totalApiCalls) * 100).toFixed(0) + "%" : "-"}</td></tr>
    </tbody>
  </table>` : ""}
  <div class="footer">Generated by clearance.opinion.engine</div>
</body>
</html>
`;
}
