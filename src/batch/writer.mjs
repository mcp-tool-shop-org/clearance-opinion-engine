/**
 * Batch disk writer.
 *
 * Writes batch results to disk:
 *   <outputDir>/
 *     batch/
 *       results.json
 *       summary.csv
 *       index.html
 *     <name-1>/
 *       run.json, run.md, report.html, summary.json
 *     <name-2>/
 *       ...
 */

import { mkdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeRun } from "../renderers/report.mjs";
import {
  renderBatchResultsJson,
  renderBatchSummaryCsv,
  renderBatchDashboardHtml,
} from "../renderers/batch.mjs";

/**
 * Sanitize a candidate name for use as a directory name.
 *
 * @param {string} name
 * @returns {string}
 */
function sanitizeDirName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "unnamed";
}

/**
 * Write all batch results to disk.
 *
 * @param {{ results: object[], errors: object[], stats: object }} batchResult
 * @param {string} outputDir
 * @returns {{ files: string[] }}
 */
export function writeBatchOutput(batchResult, outputDir) {
  const { results, errors, stats } = batchResult;

  mkdirSync(outputDir, { recursive: true });

  const files = [];

  // 1. Write batch-level outputs
  const batchDir = join(outputDir, "batch");
  mkdirSync(batchDir, { recursive: true });

  // results.json
  const resultsJsonPath = join(batchDir, "results.json");
  const resultsJson = renderBatchResultsJson(results);
  writeFileSync(resultsJsonPath, JSON.stringify(resultsJson, null, 2) + "\n", "utf8");
  files.push("batch/results.json");

  // summary.csv
  const summaryCsvPath = join(batchDir, "summary.csv");
  writeFileSync(summaryCsvPath, renderBatchSummaryCsv(results), "utf8");
  files.push("batch/summary.csv");

  // index.html (dashboard)
  const indexHtmlPath = join(batchDir, "index.html");
  writeFileSync(indexHtmlPath, renderBatchDashboardHtml(results, stats), "utf8");
  files.push("batch/index.html");

  // 2. Write per-name run outputs
  for (const result of results) {
    const dirName = sanitizeDirName(result.name);
    const nameDir = join(outputDir, dirName);

    const { jsonPath, mdPath, htmlPath, summaryPath } = writeRun(result.run, nameDir);

    files.push(`${dirName}/run.json`);
    files.push(`${dirName}/run.md`);
    files.push(`${dirName}/report.html`);
    files.push(`${dirName}/summary.json`);
  }

  return { files };
}
