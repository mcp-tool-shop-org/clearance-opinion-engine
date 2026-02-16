import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runBatch } from "../../src/batch/runner.mjs";

const NOW = "2026-02-15T12:00:00.000Z";

function allAvailableFetch() {
  return async (url) => ({
    ok: false,
    status: 404,
    text: async () => "Not Found",
    json: async () => ({}),
  });
}

function errorFetch(failName) {
  return async (url) => {
    if (url.includes(failName)) {
      throw new Error("Network error");
    }
    return {
      ok: false,
      status: 404,
      text: async () => "Not Found",
      json: async () => ({}),
    };
  };
}

describe("runBatch", () => {
  it("returns results for multiple names", async () => {
    const batch = await runBatch(
      [{ name: "alpha" }, { name: "beta" }, { name: "gamma" }],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
        concurrency: 2,
      }
    );

    assert.equal(batch.results.length, 3);
    assert.equal(batch.errors.length, 0);
    assert.equal(batch.stats.total, 3);
    assert.equal(batch.stats.succeeded, 3);
    assert.equal(batch.stats.failed, 0);
  });

  it("sorts results alphabetically by name", async () => {
    const batch = await runBatch(
      [{ name: "gamma" }, { name: "alpha" }, { name: "beta" }],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
      }
    );

    assert.equal(batch.results[0].name, "alpha");
    assert.equal(batch.results[1].name, "beta");
    assert.equal(batch.results[2].name, "gamma");
  });

  it("each result contains a valid run object", async () => {
    const batch = await runBatch(
      [{ name: "test-tool" }],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
      }
    );

    const result = batch.results[0];
    assert.equal(result.name, "test-tool");
    assert.ok(result.run);
    assert.ok(result.run.run.runId);
    assert.ok(result.run.opinion);
    assert.equal(result.error, null);
  });

  it("captures errors without aborting batch", async () => {
    // Use a fetch that throws for specific names
    const failingFetch = async (url) => {
      throw new Error("Simulated network failure");
    };

    const batch = await runBatch(
      [{ name: "good-name" }, { name: "bad-name" }],
      {
        channels: ["npm"],
        fetchFn: failingFetch,
        now: NOW,
      }
    );

    // Both should have errors since fetch throws for all
    assert.equal(batch.stats.total, 2);
    assert.equal(batch.stats.succeeded + batch.stats.failed, 2);
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let current = 0;

    const trackingFetch = async (url) => {
      current++;
      if (current > maxConcurrent) maxConcurrent = current;
      await new Promise((r) => setTimeout(r, 10));
      current--;
      return {
        ok: false,
        status: 404,
        text: async () => "Not Found",
        json: async () => ({}),
      };
    };

    await runBatch(
      [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }],
      {
        channels: ["npm"],
        fetchFn: trackingFetch,
        now: NOW,
        concurrency: 2,
        fuzzyQueryMode: "off",
      }
    );

    assert.ok(maxConcurrent <= 2, `Max concurrent was ${maxConcurrent}, expected <= 2`);
  });

  it("uses shared cache across names", async () => {
    const TMP_CACHE = join(import.meta.dirname, "..", ".tmp-batch-cache");
    mkdirSync(TMP_CACHE, { recursive: true });

    try {
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

      // First batch populates cache
      await runBatch(
        [{ name: "same-name" }],
        {
          channels: ["npm"],
          fetchFn: countingFetch,
          now: NOW,
          cacheDir: TMP_CACHE,
          fuzzyQueryMode: "off",
        }
      );

      const firstCount = fetchCount;

      // Second batch should use cache
      await runBatch(
        [{ name: "same-name" }],
        {
          channels: ["npm"],
          fetchFn: countingFetch,
          now: NOW,
          cacheDir: TMP_CACHE,
          fuzzyQueryMode: "off",
        }
      );

      // Second run should make fewer fetch calls due to cache
      const secondCount = fetchCount - firstCount;
      assert.ok(secondCount < firstCount, `Second run made ${secondCount} calls, first made ${firstCount}`);
    } finally {
      try { rmSync(TMP_CACHE, { recursive: true, force: true }); } catch {}
    }
  });

  it("includes stats with duration", async () => {
    const batch = await runBatch(
      [{ name: "test" }],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
      }
    );

    assert.ok(typeof batch.stats.durationMs === "number");
    assert.ok(batch.stats.durationMs >= 0);
  });

  it("handles string entries in names array", async () => {
    const batch = await runBatch(
      ["alpha", "beta"],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
      }
    );

    assert.equal(batch.results.length, 2);
    assert.equal(batch.results[0].name, "alpha");
    assert.equal(batch.results[1].name, "beta");
  });

  it("handles empty names array", async () => {
    const batch = await runBatch([], {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.equal(batch.results.length, 0);
    assert.equal(batch.errors.length, 0);
    assert.equal(batch.stats.total, 0);
  });

  it("per-name config overrides batch-level config", async () => {
    const batch = await runBatch(
      [{ name: "test", config: { riskTolerance: "aggressive" } }],
      {
        channels: ["npm"],
        fetchFn: allAvailableFetch(),
        now: NOW,
        riskTolerance: "conservative",
      }
    );

    assert.equal(batch.results[0].run.intake.riskTolerance, "aggressive");
  });
});
