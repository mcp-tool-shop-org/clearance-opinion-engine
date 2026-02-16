import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runBatch } from "../../src/batch/runner.mjs";
import { parseBatchInput } from "../../src/batch/input.mjs";
import { writeBatchOutput } from "../../src/batch/writer.mjs";

const NOW = "2026-02-15T12:00:00.000Z";
const TMP_DIR = join(import.meta.dirname, "..", ".tmp-e2e-batch");

function allAvailableFetch() {
  return async (url) => ({
    ok: false,
    status: 404,
    text: async () => "Not Found",
    json: async () => ({}),
  });
}

describe("E2E: batch command", () => {
  before(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  after(() => {
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it("parses .txt input and produces batch output structure", async () => {
    // Create input file
    const inputPath = join(TMP_DIR, "names.txt");
    writeFileSync(inputPath, "alpha\nbeta\ngamma\n", "utf8");

    const parsed = parseBatchInput(inputPath);
    assert.equal(parsed.names.length, 3);
    assert.equal(parsed.format, "txt");

    const batchResult = await runBatch(parsed.names, {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
      concurrency: 2,
      fuzzyQueryMode: "off",
    });

    assert.equal(batchResult.results.length, 3);
    assert.equal(batchResult.errors.length, 0);

    // Write output
    const outDir = join(TMP_DIR, "out-txt");
    const { files } = writeBatchOutput(batchResult, outDir);

    // Verify batch-level files
    assert.ok(existsSync(join(outDir, "batch", "results.json")));
    assert.ok(existsSync(join(outDir, "batch", "summary.csv")));
    assert.ok(existsSync(join(outDir, "batch", "index.html")));

    // Verify per-name directories
    assert.ok(existsSync(join(outDir, "alpha", "run.json")));
    assert.ok(existsSync(join(outDir, "alpha", "report.html")));
    assert.ok(existsSync(join(outDir, "beta", "run.json")));
    assert.ok(existsSync(join(outDir, "gamma", "run.json")));
  });

  it("parses .json input with per-name config", async () => {
    const inputPath = join(TMP_DIR, "names.json");
    writeFileSync(inputPath, JSON.stringify([
      { name: "tool-one", riskTolerance: "aggressive" },
      { name: "tool-two" },
    ]), "utf8");

    const parsed = parseBatchInput(inputPath);
    assert.equal(parsed.names.length, 2);
    assert.equal(parsed.format, "json");

    // The parser extracts non-name fields as config
    assert.ok(parsed.names[0].config);
    assert.equal(parsed.names[0].config.riskTolerance, "aggressive");

    const batchResult = await runBatch(parsed.names, {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
      fuzzyQueryMode: "off",
    });

    assert.equal(batchResult.results.length, 2);

    // tool-one should have aggressive risk tolerance from per-name config
    const toolOne = batchResult.results.find((r) => r.name === "tool-one");
    assert.equal(toolOne.run.intake.riskTolerance, "aggressive");
  });

  it("results.json contains correct data", async () => {
    const batchResult = await runBatch(
      [{ name: "alpha" }, { name: "beta" }],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
        fuzzyQueryMode: "off",
      }
    );

    const outDir = join(TMP_DIR, "out-json");
    writeBatchOutput(batchResult, outDir);

    const resultsJson = JSON.parse(readFileSync(join(outDir, "batch", "results.json"), "utf8"));
    assert.ok(Array.isArray(resultsJson));
    assert.equal(resultsJson.length, 2);
    assert.ok(resultsJson.every((r) => r.tier === "green"));
  });

  it("summary.csv has correct rows", async () => {
    const batchResult = await runBatch(
      [{ name: "alpha" }, { name: "beta" }],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
        fuzzyQueryMode: "off",
      }
    );

    const outDir = join(TMP_DIR, "out-csv");
    writeBatchOutput(batchResult, outDir);

    const csv = readFileSync(join(outDir, "batch", "summary.csv"), "utf8");
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 3); // header + 2 data rows
    assert.ok(lines[0].includes("name,tier,score"));
  });

  it("index.html contains expected dashboard elements", async () => {
    const batchResult = await runBatch(
      [{ name: "alpha" }],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
        fuzzyQueryMode: "off",
      }
    );

    const outDir = join(TMP_DIR, "out-html");
    writeBatchOutput(batchResult, outDir);

    const html = readFileSync(join(outDir, "batch", "index.html"), "utf8");
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes("Batch Clearance Report"));
    assert.ok(html.includes("alpha"));
  });

  it("shared cache reduces API calls across batch names", async () => {
    const cacheDir = join(TMP_DIR, "batch-cache");
    mkdirSync(cacheDir, { recursive: true });

    let fetchCount = 0;
    const countingFetch = async (url) => {
      fetchCount++;
      return {
        ok: false,
        status: 404,
        text: async () => "Not Found",
        json: async () => ({}),
      };
    };

    // Run same name twice in batch
    await runBatch(
      [{ name: "cached-test" }],
      {
        channels: ["npm"],
        fetchFn: countingFetch,
        now: NOW,
        cacheDir,
        fuzzyQueryMode: "off",
      }
    );

    const firstRoundCalls = fetchCount;

    // Second run should use cache
    await runBatch(
      [{ name: "cached-test" }],
      {
        channels: ["npm"],
        fetchFn: countingFetch,
        now: NOW,
        cacheDir,
        fuzzyQueryMode: "off",
      }
    );

    const secondRoundCalls = fetchCount - firstRoundCalls;
    assert.ok(secondRoundCalls < firstRoundCalls, `Second round: ${secondRoundCalls}, first: ${firstRoundCalls}`);
  });

  it("determinism: same batch input produces identical output", async () => {
    const opts = {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
      fuzzyQueryMode: "off",
    };

    const batch1 = await runBatch([{ name: "alpha" }, { name: "beta" }], opts);
    const batch2 = await runBatch([{ name: "alpha" }, { name: "beta" }], opts);

    assert.deepEqual(batch1.results.map((r) => r.run), batch2.results.map((r) => r.run));
  });
});
