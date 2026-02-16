import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { validateArtifact, validateDirectory } from "../../src/validate.mjs";

const TMP_DIR = join(import.meta.dirname, ".tmp-validate");

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

describe("validateArtifact", () => {
  it("accepts valid run object", () => {
    const run = {
      schemaVersion: "1.0.0",
      run: {},
      intake: {},
      variants: {},
      checks: [],
      evidence: [],
      opinion: { tier: "green" },
    };
    const result = validateArtifact(run, "run");
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects run missing required fields", () => {
    const run = { schemaVersion: "1.0.0" };
    const result = validateArtifact(run, "run");
    assert.equal(result.valid, false);
    const messages = result.errors.map((e) => e.message);
    assert.ok(messages.some((m) => m.includes("missing required field")));
  });

  it("rejects wrong schemaVersion for run", () => {
    const run = {
      schemaVersion: "2.0.0",
      run: {},
      intake: {},
      variants: {},
      checks: [],
      evidence: [],
      opinion: { tier: "green" },
    };
    const result = validateArtifact(run, "run");
    assert.equal(result.valid, false);
    const messages = result.errors.map((e) => e.message);
    assert.ok(messages.some((m) => m.includes("expected") && m.includes("1.0.0")));
  });

  it("accepts valid summary object", () => {
    const summary = {
      schemaVersion: "1.0.0",
      formatVersion: "1.0.0",
      generatedAt: "2025-01-01",
      engineVersion: "0.9.0",
      runId: "abc",
      candidates: [],
      tier: "green",
      namespaces: [],
      findingsSummary: {},
    };
    const result = validateArtifact(summary, "summary");
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects summary with wrong formatVersion", () => {
    const summary = {
      schemaVersion: "1.0.0",
      formatVersion: "2.0.0",
      generatedAt: "2025-01-01",
      engineVersion: "0.9.0",
      runId: "abc",
      candidates: [],
      tier: "green",
      namespaces: [],
      findingsSummary: {},
    };
    const result = validateArtifact(summary, "summary");
    assert.equal(result.valid, false);
    const messages = result.errors.map((e) => e.message);
    assert.ok(messages.some((m) => m.includes("expected") && m.includes("1.0.0")));
  });

  it("rejects invalid tier enum", () => {
    const summary = {
      schemaVersion: "1.0.0",
      formatVersion: "1.0.0",
      generatedAt: "2025-01-01",
      engineVersion: "0.9.0",
      runId: "abc",
      candidates: [],
      tier: "blue",
      namespaces: [],
      findingsSummary: {},
    };
    const result = validateArtifact(summary, "summary");
    assert.equal(result.valid, false);
    const messages = result.errors.map((e) => e.message);
    assert.ok(messages.some((m) => m.includes("blue")));
  });

  it("accepts valid index-entry", () => {
    const entry = {
      schemaVersion: "1.0.0",
      slug: "test",
      name: "test",
      tier: "green",
      date: "2025-01-01",
    };
    const result = validateArtifact(entry, "index-entry");
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects index-entry missing required fields", () => {
    const entry = { schemaVersion: "1.0.0", slug: "x" };
    const result = validateArtifact(entry, "index-entry");
    assert.equal(result.valid, false);
    const messages = result.errors.map((e) => e.message);
    assert.ok(messages.some((m) => m.includes("missing required field")));
  });

  it("returns error for unknown type", () => {
    const result = validateArtifact({}, "bogus");
    assert.equal(result.valid, false);
    const messages = result.errors.map((e) => e.message);
    assert.ok(messages.some((m) => m.includes("unknown artifact type")));
  });
});

describe("validateDirectory", () => {
  before(() => setup());
  after(() => cleanup());

  it("validates temp dir with valid artifacts", () => {
    const dir = join(TMP_DIR, "valid-dir");
    mkdirSync(dir, { recursive: true });

    const validRun = {
      schemaVersion: "1.0.0",
      run: {},
      intake: {},
      variants: {},
      checks: [],
      evidence: [],
      opinion: { tier: "green" },
    };
    const validSummary = {
      schemaVersion: "1.0.0",
      formatVersion: "1.0.0",
      generatedAt: "2025-01-01",
      engineVersion: "0.9.0",
      runId: "abc",
      candidates: [],
      tier: "green",
      namespaces: [],
      findingsSummary: {},
    };

    writeFileSync(join(dir, "run.json"), JSON.stringify(validRun), "utf8");
    writeFileSync(join(dir, "summary.json"), JSON.stringify(validSummary), "utf8");

    const result = validateDirectory(dir);
    assert.equal(result.allValid, true);
    assert.equal(result.results.length, 2);
  });
});
