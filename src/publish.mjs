/**
 * Publish command.
 *
 * Copies run artifacts (report.html, summary.json, manifest.json)
 * to a target directory for website consumption.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { escapeHtml, escapeAttr } from "./renderers/html-escape.mjs";

function publishError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Publish a run directory to a target output directory.
 *
 * @param {string} runDir - Source run directory (contains report.html, summary.json, etc.)
 * @param {string} outputDir - Target output directory
 * @returns {{ published: string[], indexGenerated: boolean }}
 */
export function publishRun(runDir, outputDir) {
  const absRunDir = resolve(runDir);
  const absOutputDir = resolve(outputDir);

  if (!existsSync(absRunDir)) {
    throw publishError("COE.PUBLISH.NOT_FOUND", `Run directory not found: ${absRunDir}`);
  }

  mkdirSync(absOutputDir, { recursive: true });

  const filesToCopy = ["report.html", "summary.json", "manifest.json"];
  const published = [];

  for (const file of filesToCopy) {
    const src = join(absRunDir, file);
    if (existsSync(src)) {
      const dest = join(absOutputDir, file);
      writeFileSync(dest, readFileSync(src));
      published.push(file);
    }
  }

  if (published.length === 0) {
    throw publishError("COE.PUBLISH.NO_FILES", `No publishable files found in ${absRunDir}`);
  }

  // Generate clearance-index.json from summary.json (if present)
  const summaryPath = join(absRunDir, "summary.json");
  if (existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
      const slug = basename(absOutputDir);
      const clearanceIndex = {
        schemaVersion: "1.0.0",
        slug,
        tier: summary.tier || "unknown",
        overallScore: summary.overallScore ?? null,
        candidates: summary.candidates || [],
        topFactors: summary.topFactors || [],
        riskNarrative: summary.riskNarrative || null,
        generatedAt: summary.generatedAt || new Date().toISOString(),
        reportUrl: `${slug}/report.html`,
      };
      writeFileSync(
        join(absOutputDir, "clearance-index.json"),
        JSON.stringify(clearanceIndex, null, 2) + "\n",
        "utf8"
      );
      published.push("clearance-index.json");
    } catch {
      // If summary can't be parsed, skip clearance-index generation
    }
  }

  // Check if sibling directories also have summary.json → generate index
  const parentDir = resolve(absOutputDir, "..");
  let indexGenerated = false;

  try {
    const siblings = readdirSync(parentDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const publishedRuns = [];
    for (const sibling of siblings) {
      const summaryPath = join(parentDir, sibling, "summary.json");
      if (existsSync(summaryPath)) {
        try {
          const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
          publishedRuns.push({ slug: sibling, summary });
        } catch {
          // Skip invalid summary files
        }
      }
    }

    if (publishedRuns.length >= 2) {
      const indexHtml = renderPublishIndex(publishedRuns);
      writeFileSync(join(parentDir, "index.html"), indexHtml, "utf8");
      indexGenerated = true;
    }
  } catch {
    // If we can't read the parent directory, skip index generation
  }

  return { published, indexGenerated };
}

/**
 * Render a simple index.html listing published runs.
 *
 * @param {Array<{ slug: string, summary: object }>} runs
 * @returns {string} HTML content
 */
function renderPublishIndex(runs) {
  const sorted = [...runs].sort((a, b) => a.slug.localeCompare(b.slug));

  const tierColor = (tier) => {
    if (tier === "green") return "#22c55e";
    if (tier === "yellow") return "#eab308";
    if (tier === "red") return "#ef4444";
    return "#6b7280";
  };

  const rows = sorted.map((r) => {
    const tier = r.summary?.tier ?? "unknown";
    const score = r.summary?.overallScore ?? "-";
    return `    <tr>
      <td><a href="${escapeAttr(r.slug)}/report.html">${escapeHtml(r.slug)}</a></td>
      <td style="color:${tierColor(tier)}">${escapeHtml(tier.toUpperCase())}</td>
      <td>${escapeHtml(String(score))}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Published Clearance Reports</title>
  <style>
    body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; padding: 2rem; }
    h1 { color: #f0f6fc; font-size: 1.5rem; margin: 0 0 1.5rem; }
    table { width: 100%; border-collapse: collapse; max-width: 600px; }
    th { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 2px solid #30363d; color: #8b949e; font-size: 0.85rem; }
    td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #21262d; }
    tr:hover { background: #161b22; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Published Clearance Reports</h1>
  <table>
    <thead>
      <tr><th>Run</th><th>Tier</th><th>Score</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>
`;
}
