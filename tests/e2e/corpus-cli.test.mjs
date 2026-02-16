import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { corpusInit, corpusAdd } from "../../src/corpus/cli.mjs";
import { loadCorpus, compareAgainstCorpus } from "../../src/adapters/corpus.mjs";

const NOW = "2026-02-15T12:00:00.000Z";
const TMP_DIR = join(import.meta.dirname, "..", ".tmp-e2e-corpus");

describe("E2E: corpus CLI", () => {
  before(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  after(() => {
    if (existsSync(TMP_DIR)) {
      rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it("init + add + compare produces expected results", () => {
    const corpusPath = join(TMP_DIR, "corpus.json");

    // Init
    const initResult = corpusInit(corpusPath, { now: NOW });
    assert.equal(initResult.created, true);

    // Add marks
    const r1 = corpusAdd(corpusPath, { name: "React", class: 9, registrant: "Meta" });
    assert.equal(r1.added, true);
    assert.ok(r1.id);

    const r2 = corpusAdd(corpusPath, { name: "Vue", class: 9, registrant: "Evan You" });
    assert.equal(r2.added, true);

    const r3 = corpusAdd(corpusPath, { name: "Angular", class: 9, registrant: "Google" });
    assert.equal(r3.added, true);

    // Verify file content
    const data = JSON.parse(readFileSync(corpusPath, "utf8"));
    assert.equal(data.marks.length, 3);
    assert.equal(data.marks[0].mark, "React");
    assert.equal(data.marks[0].class, 9);
    assert.equal(data.marks[0].registrant, "Meta");

    // Load and compare
    const corpus = loadCorpus(corpusPath);
    assert.equal(corpus.marks.length, 3);

    // Compare "ReactJS" against corpus — should find similarity with "React"
    const comparison = compareAgainstCorpus("ReactJS", corpus, { threshold: 0.70 });
    assert.ok(comparison.findings.length >= 1, "Should find ReactJS similar to React");
  });

  it("deduplicates marks case-insensitively", () => {
    const corpusPath = join(TMP_DIR, "dedup-corpus.json");
    corpusInit(corpusPath, { now: NOW });

    corpusAdd(corpusPath, { name: "React" });
    const dup = corpusAdd(corpusPath, { name: "react" });

    assert.equal(dup.added, false);
    assert.equal(dup.reason, "duplicate");

    const data = JSON.parse(readFileSync(corpusPath, "utf8"));
    assert.equal(data.marks.length, 1);
  });

  it("produces deterministic IDs", () => {
    const p1 = join(TMP_DIR, "det1.json");
    const p2 = join(TMP_DIR, "det2.json");

    corpusInit(p1, { now: NOW });
    corpusInit(p2, { now: NOW });

    const r1 = corpusAdd(p1, { name: "React" });
    const r2 = corpusAdd(p2, { name: "React" });

    assert.equal(r1.id, r2.id);
  });

  it("init fails if file already exists", () => {
    const corpusPath = join(TMP_DIR, "exists-corpus.json");
    corpusInit(corpusPath, { now: NOW });

    assert.throws(
      () => corpusInit(corpusPath, { now: NOW }),
      /already exists/i
    );
  });
});
