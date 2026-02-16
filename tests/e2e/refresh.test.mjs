import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { refreshRun } from "../../src/refresh.mjs";
import { runCheck } from "../../src/pipeline.mjs";
import { writeRun } from "../../src/renderers/report.mjs";

const NOW = "2026-02-15T12:00:00.000Z";
const STALE_TIME = "2026-02-10T12:00:00.000Z"; // 5 days old
const FRESH_TIME = "2026-02-15T10:00:00.000Z"; // 2 hours old
const TMP_DIR = join(import.meta.dirname, "..", ".tmp-e2e-refresh");

function allAvailableFetch() {
  return async (url) => ({
    ok: false,
    status: 404,
    text: async () => "Not Found",
    json: async () => ({}),
  });
}

async function createStaleRun(dirName) {
  const run = await runCheck("test-tool", {
    channels: ["npm"],
    fetchFn: allAvailableFetch(),
    now: STALE_TIME,
    fuzzyQueryMode: "off",
  });

  // Make all checks stale
  for (const check of run.checks) {
    check.observedAt = STALE_TIME;
  }

  const dir = join(TMP_DIR, dirName);
  writeRun(run, dir);
  return { dir, run };
}

async function createFreshRun(dirName) {
  const run = await runCheck("test-tool", {
    channels: ["npm"],
    fetchFn: allAvailableFetch(),
    now: FRESH_TIME,
    fuzzyQueryMode: "off",
  });

  for (const check of run.checks) {
    check.observedAt = FRESH_TIME;
  }

  const dir = join(TMP_DIR, dirName);
  writeRun(run, dir);
  return { dir, run };
}

describe("E2E: refresh command", () => {
  before(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  after(() => {
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it("does not refresh when all checks are fresh", async () => {
    const { dir } = await createFreshRun("fresh-run");

    const result = await refreshRun(dir, {
      maxAgeHours: 24,
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.equal(result.refreshed, false);
    assert.equal(result.reason, "all checks fresh");
  });

  it("refreshes stale checks and produces new run", async () => {
    const { dir, run: originalRun } = await createStaleRun("stale-run");

    const result = await refreshRun(dir, {
      maxAgeHours: 24,
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.equal(result.refreshed, true);
    assert.ok(result.staleCount > 0);
    assert.ok(result.run);
    assert.ok(result.run.run.runId.endsWith(".refresh"));
  });

  it("refreshed run references original runId in notes", async () => {
    const { dir, run: originalRun } = await createStaleRun("stale-notes");

    const result = await refreshRun(dir, {
      maxAgeHours: 24,
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.ok(result.run.run.notes.includes(originalRun.run.runId));
  });

  it("original run directory is not modified", async () => {
    const { dir } = await createStaleRun("stale-immutable");
    const originalContent = readFileSync(join(dir, "run.json"), "utf8");

    await refreshRun(dir, {
      maxAgeHours: 24,
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    const afterContent = readFileSync(join(dir, "run.json"), "utf8");
    assert.equal(originalContent, afterContent);
  });

  it("refreshed run can be written to disk", async () => {
    const { dir } = await createStaleRun("stale-write");

    const result = await refreshRun(dir, {
      maxAgeHours: 24,
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    const refreshDir = dir + "-refreshed";
    const { jsonPath, mdPath, htmlPath } = writeRun(result.run, refreshDir);

    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(mdPath));
    assert.ok(existsSync(htmlPath));

    // Verify the written run is valid
    const writtenRun = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.ok(writtenRun.run.runId.endsWith(".refresh"));
  });

  it("throws for non-existent run directory", async () => {
    await assert.rejects(
      () => refreshRun(join(TMP_DIR, "nonexistent"), {
        fetchFn: allAvailableFetch(),
        now: NOW,
      }),
      /no run\.json/i
    );
  });
});
