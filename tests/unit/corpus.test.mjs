import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

import { loadCorpus, compareAgainstCorpus } from "../../src/adapters/corpus.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures", "corpus");
const tmpDir = join(__dirname, "..", ".tmp-corpus-tests");

const NOW = "2026-02-15T12:00:00.000Z";

// ── loadCorpus ──────────────────────────────────────────────────

describe("loadCorpus", () => {
  it("loads a valid corpus file", () => {
    const corpus = loadCorpus(join(fixturesDir, "sample-corpus.json"));
    assert.ok(Array.isArray(corpus.marks));
    assert.ok(corpus.marks.length >= 1);
    assert.ok(corpus.marks.every((m) => typeof m.mark === "string"));
  });

  it("throws COE.CORPUS.INVALID for missing file", () => {
    assert.throws(
      () => loadCorpus("/nonexistent/path/corpus.json"),
      (err) => err.code === "COE.CORPUS.INVALID"
    );
  });

  it("throws COE.CORPUS.INVALID for invalid JSON", () => {
    mkdirSync(tmpDir, { recursive: true });
    const path = join(tmpDir, "bad.json");
    writeFileSync(path, "NOT JSON{{{", "utf8");

    try {
      assert.throws(
        () => loadCorpus(path),
        (err) => err.code === "COE.CORPUS.INVALID"
      );
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws COE.CORPUS.INVALID when marks array is missing", () => {
    mkdirSync(tmpDir, { recursive: true });
    const path = join(tmpDir, "no-marks.json");
    writeFileSync(path, '{"something": "else"}', "utf8");

    try {
      assert.throws(
        () => loadCorpus(path),
        (err) => err.code === "COE.CORPUS.INVALID"
      );
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws COE.CORPUS.INVALID when a mark entry has no mark string", () => {
    mkdirSync(tmpDir, { recursive: true });
    const path = join(tmpDir, "bad-entry.json");
    writeFileSync(path, '{"marks": [{"mark": "Good"}, {"notmark": "Bad"}]}', "utf8");

    try {
      assert.throws(
        () => loadCorpus(path),
        (err) => err.code === "COE.CORPUS.INVALID"
      );
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts empty marks array", () => {
    mkdirSync(tmpDir, { recursive: true });
    const path = join(tmpDir, "empty.json");
    writeFileSync(path, '{"marks": []}', "utf8");

    try {
      const corpus = loadCorpus(path);
      assert.deepEqual(corpus.marks, []);
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── compareAgainstCorpus ────────────────────────────────────────

describe("compareAgainstCorpus", () => {
  const corpus = {
    marks: [
      { mark: "ClearView", class: 42, registrant: "ClearView AI" },
      { mark: "ClearVue", class: 42 },
      { mark: "TotallyDifferent" },
    ],
  };

  it("finds similar marks above threshold", () => {
    const { findings, evidence, closestConflicts } = compareAgainstCorpus(
      "ClearView",
      corpus,
      { now: NOW, threshold: 0.70 }
    );

    assert.ok(findings.length >= 1);
    assert.ok(evidence.length >= 1);
    assert.ok(closestConflicts.length >= 1);
  });

  it("returns empty results when no marks match", () => {
    const { findings, evidence, closestConflicts } = compareAgainstCorpus(
      "zzzzz-no-match",
      corpus,
      { now: NOW, threshold: 0.90 }
    );

    assert.equal(findings.length, 0);
    assert.equal(evidence.length, 0);
    assert.equal(closestConflicts.length, 0);
  });

  it("evidence has system 'user_corpus'", () => {
    const { evidence } = compareAgainstCorpus("ClearView", corpus, { now: NOW });

    for (const ev of evidence) {
      assert.equal(ev.source.system, "user_corpus");
      assert.equal(ev.type, "text");
      assert.ok(ev.sha256);
    }
  });

  it("findings have correct kind based on similarity score", () => {
    // "ClearView" vs "ClearView" is exact → near_conflict high
    const { findings } = compareAgainstCorpus("ClearView", corpus, { now: NOW, threshold: 0.70 });

    const exactMatch = findings.find((f) => f.summary.includes('"ClearView"'));
    assert.ok(exactMatch);
    assert.ok(["near_conflict", "phonetic_conflict"].includes(exactMatch.kind));
  });

  it("why includes commercial impression template", () => {
    const { findings } = compareAgainstCorpus("ClearView", corpus, { now: NOW });

    for (const f of findings) {
      assert.ok(
        f.why.some((w) => w.startsWith("Commercial impression:")),
        `Finding "${f.summary}" should have commercial impression in why[]`
      );
    }
  });

  it("is deterministic", () => {
    const r1 = compareAgainstCorpus("ClearView", corpus, { now: NOW });
    const r2 = compareAgainstCorpus("ClearView", corpus, { now: NOW });
    assert.deepEqual(r1, r2);
  });

  it("handles corpus with optional class and registrant fields", () => {
    const { evidence } = compareAgainstCorpus("ClearView", corpus, { now: NOW });

    // Evidence notes should mention class/registrant when available
    const evWithClass = evidence.find((e) => e.notes?.includes("Nice class"));
    assert.ok(evWithClass, "Should mention Nice class in notes when present");
  });
});
