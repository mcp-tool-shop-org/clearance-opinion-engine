import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  jaroWinkler,
  similarityLabel,
  comparePair,
  findSimilarMarks,
} from "../../src/scoring/similarity.mjs";

// ── jaroWinkler ─────────────────────────────────────────────────

describe("jaroWinkler", () => {
  it("returns 1.0 for identical strings", () => {
    assert.equal(jaroWinkler("hello", "hello"), 1.0);
  });

  it("returns 1.0 for identical strings (case-insensitive)", () => {
    assert.equal(jaroWinkler("Hello", "hello"), 1.0);
  });

  it("returns 0.0 for completely different strings", () => {
    const score = jaroWinkler("abc", "xyz");
    assert.ok(score < 0.5, `Expected low score, got ${score}`);
  });

  it("returns 0.0 when one string is empty", () => {
    assert.equal(jaroWinkler("", "hello"), 0.0);
    assert.equal(jaroWinkler("hello", ""), 0.0);
  });

  it("returns 1.0 when both strings are empty (identical)", () => {
    assert.equal(jaroWinkler("", ""), 1.0);
  });

  it("handles non-string inputs gracefully", () => {
    assert.equal(jaroWinkler(null, "hello"), 0.0);
    assert.equal(jaroWinkler("hello", undefined), 0.0);
    assert.equal(jaroWinkler(42, "hello"), 0.0);
  });

  it("produces ~0.961 for 'martha' vs 'marhta' (classic test case)", () => {
    const score = jaroWinkler("martha", "marhta");
    assert.ok(score >= 0.95 && score <= 0.97, `Expected ~0.961, got ${score}`);
  });

  it("applies prefix bonus (higher score for shared prefix)", () => {
    const withPrefix = jaroWinkler("clearance", "clearview");
    const withoutPrefix = jaroWinkler("earancecl", "earviewcl");
    assert.ok(
      withPrefix > withoutPrefix,
      `Prefix bonus should increase score: ${withPrefix} vs ${withoutPrefix}`
    );
  });

  it("is symmetric (a,b same as b,a)", () => {
    const ab = jaroWinkler("react", "reach");
    const ba = jaroWinkler("reach", "react");
    assert.equal(ab, ba);
  });

  it("returns high score for transpositions", () => {
    const score = jaroWinkler("abcde", "abdce");
    assert.ok(score > 0.9, `Expected high score for transposition, got ${score}`);
  });

  it("handles single character strings", () => {
    assert.equal(jaroWinkler("a", "a"), 1.0);
    const score = jaroWinkler("a", "b");
    assert.equal(score, 0.0);
  });
});

// ── similarityLabel ─────────────────────────────────────────────

describe("similarityLabel", () => {
  it("returns 'very high' for scores >= 0.95", () => {
    assert.equal(similarityLabel(0.95), "very high");
    assert.equal(similarityLabel(1.0), "very high");
  });

  it("returns 'high' for scores >= 0.85 and < 0.95", () => {
    assert.equal(similarityLabel(0.85), "high");
    assert.equal(similarityLabel(0.94), "high");
  });

  it("returns 'medium' for scores >= 0.70 and < 0.85", () => {
    assert.equal(similarityLabel(0.70), "medium");
    assert.equal(similarityLabel(0.84), "medium");
  });

  it("returns 'low' for scores < 0.70", () => {
    assert.equal(similarityLabel(0.69), "low");
    assert.equal(similarityLabel(0.0), "low");
  });
});

// ── comparePair ─────────────────────────────────────────────────

describe("comparePair", () => {
  it("returns the correct shape", () => {
    const result = comparePair("clearview", "clearvue");

    assert.equal(result.a, "clearview");
    assert.equal(result.b, "clearvue");
    assert.ok(typeof result.looks.score === "number");
    assert.ok(typeof result.looks.label === "string");
    assert.ok(typeof result.sounds.score === "number");
    assert.ok(typeof result.sounds.label === "string");
    assert.ok(typeof result.overall === "number");
    assert.ok(Array.isArray(result.why));
    assert.ok(result.why.length >= 2);
  });

  it("looks and sounds scores are between 0 and 1", () => {
    const result = comparePair("react-tool", "react-pool");

    assert.ok(result.looks.score >= 0 && result.looks.score <= 1);
    assert.ok(result.sounds.score >= 0 && result.sounds.score <= 1);
    assert.ok(result.overall >= 0 && result.overall <= 1);
  });

  it("why array contains 'Looks like' and 'Sounds like' entries", () => {
    const result = comparePair("myapp", "myaap");

    assert.ok(result.why.some((w) => w.startsWith('Looks like')));
    assert.ok(result.why.some((w) => w.startsWith('Sounds like')));
  });

  it("identical names produce overall=1.0", () => {
    const result = comparePair("my-tool", "my-tool");
    assert.equal(result.looks.score, 1.0);
    assert.equal(result.overall, 1.0);
  });

  it("respects custom weight parameters", () => {
    const looksOnly = comparePair("phone", "fone", { lookWeight: 1.0, soundWeight: 0.0 });
    const soundsOnly = comparePair("phone", "fone", { lookWeight: 0.0, soundWeight: 1.0 });

    // "phone" and "fone" look different but sound the same (Metaphone: FN)
    assert.ok(
      soundsOnly.overall > looksOnly.overall,
      `Sound-only should score higher for phone/fone: ${soundsOnly.overall} vs ${looksOnly.overall}`
    );
  });

  it("is deterministic", () => {
    const r1 = comparePair("clearance", "clearview");
    const r2 = comparePair("clearance", "clearview");
    assert.deepEqual(r1, r2);
  });
});

// ── findSimilarMarks ────────────────────────────────────────────

describe("findSimilarMarks", () => {
  const marks = [
    { mark: "react-tool" },
    { mark: "reach-tool" },
    { mark: "xyz-unrelated" },
    { mark: "reakt-tool" },
  ];

  it("returns marks above the threshold sorted by overall descending", () => {
    const results = findSimilarMarks("react-tool", marks, { threshold: 0.70 });

    assert.ok(results.length >= 1);
    // First result should be exact match
    assert.equal(results[0].mark, "react-tool");
    assert.equal(results[0].comparison.overall, 1.0);

    // Should be sorted descending
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i].comparison.overall <= results[i - 1].comparison.overall,
        "Results should be sorted descending by overall"
      );
    }
  });

  it("excludes marks below threshold", () => {
    const results = findSimilarMarks("react-tool", marks, { threshold: 0.99 });

    // Only exact match should pass 0.99 threshold
    assert.equal(results.length, 1);
    assert.equal(results[0].mark, "react-tool");
  });

  it("returns empty array when no marks match", () => {
    const results = findSimilarMarks("zzzzzzzzz", marks, { threshold: 0.90 });
    assert.equal(results.length, 0);
  });

  it("returns empty array for empty marks list", () => {
    const results = findSimilarMarks("anything", []);
    assert.equal(results.length, 0);
  });

  it("handles string marks (not objects)", () => {
    const stringMarks = [{ mark: "react-tool" }, { mark: "reach-pool" }];
    const results = findSimilarMarks("react-tool", stringMarks, { threshold: 0.70 });
    assert.ok(results.length >= 1);
  });

  it("each result has a mark and comparison object", () => {
    const results = findSimilarMarks("react-tool", marks, { threshold: 0.70 });

    for (const r of results) {
      assert.ok(typeof r.mark === "string");
      assert.ok(r.comparison);
      assert.ok(typeof r.comparison.overall === "number");
      assert.ok(Array.isArray(r.comparison.why));
    }
  });
});
