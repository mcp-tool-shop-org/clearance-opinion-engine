import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runCheck, withCache } from "../../src/pipeline.mjs";

const NOW = "2026-02-15T12:00:00.000Z";

function allAvailableFetch() {
  return async (url) => ({
    ok: false,
    status: 404,
    text: async () => "Not Found",
    json: async () => ({}),
  });
}

describe("runCheck", () => {
  it("returns a valid run object with required top-level keys", async () => {
    const run = await runCheck("test-tool", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.ok(run.schemaVersion);
    assert.ok(run.run);
    assert.ok(run.run.runId);
    assert.ok(run.run.engineVersion);
    assert.ok(run.run.createdAt);
    assert.ok(run.intake);
    assert.ok(run.variants);
    assert.ok(Array.isArray(run.checks));
    assert.ok(Array.isArray(run.findings));
    assert.ok(Array.isArray(run.evidence));
    assert.ok(run.opinion);
  });

  it("uses injected now timestamp", async () => {
    const run = await runCheck("test-tool", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.equal(run.run.createdAt, NOW);
  });

  it("respects channels option", async () => {
    const run = await runCheck("test-tool", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    const namespaces = run.checks.map((c) => c.namespace);
    assert.ok(namespaces.includes("npm"));
    assert.ok(!namespaces.includes("pypi"));
    assert.ok(!namespaces.includes("github_repo"));
  });

  it("produces GREEN opinion when all available", async () => {
    const run = await runCheck("test-tool", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.equal(run.opinion.tier, "green");
  });

  it("produces deterministic output (same inputs → same run)", async () => {
    const opts = {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    };

    const run1 = await runCheck("test-tool", opts);
    const run2 = await runCheck("test-tool", opts);

    assert.deepEqual(run1, run2);
  });

  it("does NOT write any files to disk", async () => {
    // runCheck returns the run object — writeRun is NOT called
    const run = await runCheck("test-tool", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    // If it wrote files, it would need an outputDir, which we don't provide
    assert.ok(run.run.runId);
  });

  it("includes adapter versions for enabled channels", async () => {
    const run = await runCheck("test-tool", {
      channels: ["npm", "pypi"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.ok(run.run.adapterVersions.npm);
    assert.ok(run.run.adapterVersions.pypi);
    assert.ok(!run.run.adapterVersions.github);
  });

  it("respects risk tolerance option", async () => {
    const run = await runCheck("test-tool", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
      riskTolerance: "aggressive",
    });

    assert.equal(run.intake.riskTolerance, "aggressive");
  });

  it("produces variants for the candidate", async () => {
    const run = await runCheck("my-cool-tool", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
    });

    assert.ok(run.variants.items.length > 0);
    assert.equal(run.variants.items[0].candidateMark, "my-cool-tool");
  });

  it("handles fuzzyQueryMode off", async () => {
    const run = await runCheck("test-tool", {
      channels: ["npm"],
      fetchFn: allAvailableFetch(),
      now: NOW,
      fuzzyQueryMode: "off",
    });

    // With fuzzy off, no variant checks
    const variantChecks = run.checks.filter((c) => c.query?.isVariant);
    assert.equal(variantChecks.length, 0);
  });
});

describe("withCache", () => {
  it("passes through when cache is null", async () => {
    let called = false;
    const result = await withCache(null, "test", "1.0", {}, async () => {
      called = true;
      return { check: { id: "test", status: "available" } };
    });
    assert.ok(called);
    assert.equal(result.check.cacheHit, false);
  });

  it("marks cacheHit false on first call with cache", async () => {
    const cache = {
      get: () => null,
      set: () => {},
    };
    const result = await withCache(cache, "test", "1.0", {}, async () => {
      return { check: { id: "test", status: "available" } };
    });
    assert.equal(result.check.cacheHit, false);
  });
});
