import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { refreshRun } from "../../src/refresh.mjs";
import { runCheck } from "../../src/pipeline.mjs";

const NOW = "2026-02-15T12:00:00.000Z";
const STALE_TIME = "2026-02-10T12:00:00.000Z"; // 5 days old
const FRESH_TIME = "2026-02-15T10:00:00.000Z"; // 2 hours old

const TMP_DIR = join(import.meta.dirname, "..", ".tmp-refresh");

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

/**
 * Create a run with a specific observedAt timestamp on checks.
 */
async function createRunWithTimestamp(observedAt) {
  const run = await runCheck("test-tool", {
    channels: ["npm"],
    fetchFn: allAvailableFetch(),
    now: observedAt,
    fuzzyQueryMode: "off",
  });

  // Override observedAt on all checks
  for (const check of run.checks) {
    check.observedAt = observedAt;
  }

  return run;
}

function writeRunDir(dirName, run) {
  const dir = join(TMP_DIR, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  return dir;
}

describe("refreshRun", () => {
  it("returns refreshed: false when all checks are fresh", async () => {
    setup();
    try {
      const run = await createRunWithTimestamp(FRESH_TIME);
      const dir = writeRunDir("fresh-run", run);

      const result = await refreshRun(dir, {
        maxAgeHours: 24,
        fetchFn: allAvailableFetch(),
        now: NOW,
      });

      assert.equal(result.refreshed, false);
      assert.equal(result.reason, "all checks fresh");
    } finally { cleanup(); }
  });

  it("returns refreshed: true when stale checks exist", async () => {
    setup();
    try {
      const run = await createRunWithTimestamp(STALE_TIME);
      const dir = writeRunDir("stale-run", run);

      const result = await refreshRun(dir, {
        maxAgeHours: 24,
        fetchFn: allAvailableFetch(),
        now: NOW,
      });

      assert.equal(result.refreshed, true);
      assert.ok(result.staleCount > 0);
    } finally { cleanup(); }
  });

  it("refreshed run has notes referencing original runId", async () => {
    setup();
    try {
      const run = await createRunWithTimestamp(STALE_TIME);
      const dir = writeRunDir("stale-run", run);
      const originalRunId = run.run.runId;

      const result = await refreshRun(dir, {
        maxAgeHours: 24,
        fetchFn: allAvailableFetch(),
        now: NOW,
      });

      assert.ok(result.run);
      assert.ok(result.run.run.notes.includes(originalRunId));
    } finally { cleanup(); }
  });

  it("refreshed run has a new runId with .refresh suffix", async () => {
    setup();
    try {
      const run = await createRunWithTimestamp(STALE_TIME);
      const dir = writeRunDir("stale-run", run);

      const result = await refreshRun(dir, {
        maxAgeHours: 24,
        fetchFn: allAvailableFetch(),
        now: NOW,
      });

      assert.ok(result.run.run.runId.endsWith(".refresh"));
    } finally { cleanup(); }
  });

  it("refreshed run preserves intake from original", async () => {
    setup();
    try {
      const run = await createRunWithTimestamp(STALE_TIME);
      const dir = writeRunDir("stale-run", run);

      const result = await refreshRun(dir, {
        maxAgeHours: 24,
        fetchFn: allAvailableFetch(),
        now: NOW,
      });

      assert.deepEqual(result.run.intake, run.intake);
    } finally { cleanup(); }
  });

  it("refreshed run has valid opinion", async () => {
    setup();
    try {
      const run = await createRunWithTimestamp(STALE_TIME);
      const dir = writeRunDir("stale-run", run);

      const result = await refreshRun(dir, {
        maxAgeHours: 24,
        fetchFn: allAvailableFetch(),
        now: NOW,
      });

      assert.ok(result.run.opinion);
      assert.ok(["green", "yellow", "red"].includes(result.run.opinion.tier));
    } finally { cleanup(); }
  });

  it("throws for non-existent run directory", async () => {
    setup();
    try {
      await assert.rejects(
        () => refreshRun(join(TMP_DIR, "nope"), {
          fetchFn: allAvailableFetch(),
          now: NOW,
        }),
        /no run\.json/i
      );
    } finally { cleanup(); }
  });

  it("throws for invalid run.json", async () => {
    setup();
    try {
      const dir = join(TMP_DIR, "bad-run");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "run.json"), "not json{{{", "utf8");

      await assert.rejects(
        () => refreshRun(dir, {
          fetchFn: allAvailableFetch(),
          now: NOW,
        }),
        /invalid/i
      );
    } finally { cleanup(); }
  });
});
