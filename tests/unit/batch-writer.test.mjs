import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeBatchOutput } from "../../src/batch/writer.mjs";
import { runCheck } from "../../src/pipeline.mjs";

const NOW = "2026-02-15T12:00:00.000Z";
const TMP_DIR = join(import.meta.dirname, "..", ".tmp-batch-writer");

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

function allAvailableFetch() {
  return async (url) => ({
    ok: false,
    status: 404,
    text: async () => "Not Found",
    json: async () => ({}),
  });
}

async function makeBatchResult(names) {
  const results = [];
  for (const name of names) {
    const run = await runCheck(name, {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
      fuzzyQueryMode: "off",
    });
    results.push({ name, run, error: null });
  }
  return {
    results,
    errors: [],
    stats: { total: names.length, succeeded: names.length, failed: 0, durationMs: 100 },
  };
}

describe("writeBatchOutput", () => {
  it("writes expected batch-level files", async () => {
    setup();
    try {
      const batchResult = await makeBatchResult(["alpha", "beta"]);
      const outDir = join(TMP_DIR, "out");
      const { files } = writeBatchOutput(batchResult, outDir);

      assert.ok(existsSync(join(outDir, "batch", "results.json")));
      assert.ok(existsSync(join(outDir, "batch", "summary.csv")));
      assert.ok(existsSync(join(outDir, "batch", "index.html")));
      assert.ok(files.includes("batch/results.json"));
      assert.ok(files.includes("batch/summary.csv"));
      assert.ok(files.includes("batch/index.html"));
    } finally { cleanup(); }
  });

  it("writes per-name subdirectories with run artifacts", async () => {
    setup();
    try {
      const batchResult = await makeBatchResult(["alpha", "beta"]);
      const outDir = join(TMP_DIR, "out");
      writeBatchOutput(batchResult, outDir);

      assert.ok(existsSync(join(outDir, "alpha", "run.json")));
      assert.ok(existsSync(join(outDir, "alpha", "run.md")));
      assert.ok(existsSync(join(outDir, "alpha", "report.html")));
      assert.ok(existsSync(join(outDir, "alpha", "summary.json")));

      assert.ok(existsSync(join(outDir, "beta", "run.json")));
    } finally { cleanup(); }
  });

  it("results.json is valid JSON array", async () => {
    setup();
    try {
      const batchResult = await makeBatchResult(["alpha"]);
      const outDir = join(TMP_DIR, "out");
      writeBatchOutput(batchResult, outDir);

      const content = JSON.parse(readFileSync(join(outDir, "batch", "results.json"), "utf8"));
      assert.ok(Array.isArray(content));
      assert.equal(content.length, 1);
    } finally { cleanup(); }
  });

  it("summary.csv has expected number of rows", async () => {
    setup();
    try {
      const batchResult = await makeBatchResult(["alpha", "beta"]);
      const outDir = join(TMP_DIR, "out");
      writeBatchOutput(batchResult, outDir);

      const csv = readFileSync(join(outDir, "batch", "summary.csv"), "utf8");
      const lines = csv.trim().split("\n");
      assert.equal(lines.length, 3); // header + 2 data rows
    } finally { cleanup(); }
  });

  it("sanitizes directory names for special characters", async () => {
    setup();
    try {
      const batchResult = await makeBatchResult(["My Cool Tool"]);
      const outDir = join(TMP_DIR, "out");
      writeBatchOutput(batchResult, outDir);

      // "My Cool Tool" → "my-cool-tool"
      assert.ok(existsSync(join(outDir, "my-cool-tool", "run.json")));
    } finally { cleanup(); }
  });

  it("returns list of all written files", async () => {
    setup();
    try {
      const batchResult = await makeBatchResult(["alpha"]);
      const outDir = join(TMP_DIR, "out");
      const { files } = writeBatchOutput(batchResult, outDir);

      assert.ok(files.length >= 7); // 3 batch + 4 per name
      assert.ok(files.includes("alpha/run.json"));
      assert.ok(files.includes("alpha/report.html"));
    } finally { cleanup(); }
  });
});
