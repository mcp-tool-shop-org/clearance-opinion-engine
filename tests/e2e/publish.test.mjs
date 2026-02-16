import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { publishRun } from "../../src/publish.mjs";
import { runCheck } from "../../src/pipeline.mjs";
import { writeRun } from "../../src/renderers/report.mjs";

const NOW = "2026-02-15T12:00:00.000Z";
const TMP_DIR = join(import.meta.dirname, "..", ".tmp-e2e-publish");

function allAvailableFetch() {
  return async (url) => ({
    ok: false,
    status: 404,
    text: async () => "Not Found",
    json: async () => ({}),
  });
}

describe("E2E: publish command", () => {
  before(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  after(() => {
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it("publishes run artifacts to output directory", async () => {
    // Create a real run
    const run = await runCheck("publish-test", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
      fuzzyQueryMode: "off",
    });

    const runDir = join(TMP_DIR, "run1");
    writeRun(run, runDir);

    // Publish it
    const outDir = join(TMP_DIR, "pub", "run1");
    const result = publishRun(runDir, outDir);

    assert.ok(result.published.includes("report.html"));
    assert.ok(result.published.includes("summary.json"));
    assert.ok(existsSync(join(outDir, "report.html")));
    assert.ok(existsSync(join(outDir, "summary.json")));
  });

  it("generates index.html with multiple published runs", async () => {
    const fetch = allAvailableFetch();

    // Create and publish first run
    const run1 = await runCheck("tool-a", {
      channels: ["npm"], fetchFn: fetch, now: NOW, fuzzyQueryMode: "off",
    });
    const runDir1 = join(TMP_DIR, "runs", "run1");
    writeRun(run1, runDir1);

    const pubDir = join(TMP_DIR, "published");
    publishRun(runDir1, join(pubDir, "tool-a"));

    // Create and publish second run
    const run2 = await runCheck("tool-b", {
      channels: ["npm"], fetchFn: fetch, now: NOW, fuzzyQueryMode: "off",
    });
    const runDir2 = join(TMP_DIR, "runs", "run2");
    writeRun(run2, runDir2);

    const result = publishRun(runDir2, join(pubDir, "tool-b"));

    // Should generate index.html in parent
    assert.ok(result.indexGenerated);
    assert.ok(existsSync(join(pubDir, "index.html")));

    const indexHtml = readFileSync(join(pubDir, "index.html"), "utf8");
    assert.ok(indexHtml.includes("tool-a"));
    assert.ok(indexHtml.includes("tool-b"));
    assert.ok(indexHtml.includes("Published Clearance Reports"));
  });

  it("published summary.json is valid", async () => {
    const run = await runCheck("summary-test", {
      channels: ["npm"], fetchFn: allAvailableFetch(), now: NOW, fuzzyQueryMode: "off",
    });

    const runDir = join(TMP_DIR, "summary-run");
    writeRun(run, runDir);

    const outDir = join(TMP_DIR, "pub-summary", "run1");
    publishRun(runDir, outDir);

    const summary = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8"));
    assert.equal(summary.tier, "green");
    assert.ok(typeof summary.overallScore === "number");
  });

  it("throws for non-existent run directory", () => {
    assert.throws(
      () => publishRun(join(TMP_DIR, "nonexistent"), join(TMP_DIR, "out")),
      /not found/i
    );
  });
});
