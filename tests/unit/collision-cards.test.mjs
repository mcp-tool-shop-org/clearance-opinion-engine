import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCollisionCards } from "../../src/scoring/collision-cards.mjs";

function finding(kind, severity, summary, opts = {}) {
  return {
    kind,
    severity,
    summary,
    candidateMark: "testname",
    why: opts.why || [],
    evidenceRefs: opts.evidenceRefs || [],
    ...opts,
  };
}

describe("buildCollisionCards", () => {
  it("empty findings produces empty cards", () => {
    const cards = buildCollisionCards([], []);
    assert.deepEqual(cards, []);
  });

  it("variant_taken finding produces variant_taken card", () => {
    const findings = [finding("variant_taken", "high", 'Variant "testpkg" is taken in npm')];
    const cards = buildCollisionCards(findings, []);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].kind, "variant_taken");
    assert.equal(cards[0].severity, "critical");
  });

  it("phonetic_conflict produces sounds_like card", () => {
    const findings = [finding("phonetic_conflict", "medium", 'Phonetically similar to "tst"')];
    const cards = buildCollisionCards(findings, []);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].kind, "sounds_like");
    assert.equal(cards[0].severity, "major");
  });

  it("near_conflict (non-radar) produces looks_like card", () => {
    const findings = [finding("near_conflict", "medium", 'Similar to "test-pkg"')];
    const cards = buildCollisionCards(findings, []);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].kind, "looks_like");
  });

  it("near_conflict with market signal produces market_signal card", () => {
    const findings = [
      finding("near_conflict", "low", 'Similar to "mkt"', {
        why: ["Market usage signal found on github_search"],
      }),
    ];
    const cards = buildCollisionCards(findings, []);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].kind, "market_signal");
  });

  it("confusable_risk produces confusable_chars card", () => {
    const findings = [finding("confusable_risk", "medium", 'Confusable with "t\u0435st"')];
    const cards = buildCollisionCards(findings, []);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].kind, "confusable_chars");
  });

  it("exact_conflict is skipped (no card)", () => {
    const findings = [finding("exact_conflict", "high", "Exact match in npm")];
    const cards = buildCollisionCards(findings, []);
    assert.equal(cards.length, 0);
  });

  it("caps at 6 cards", () => {
    const findings = [];
    for (let i = 0; i < 8; i++) {
      findings.push(finding("variant_taken", "high", `Variant "pkg${i}" is taken in npm`));
    }
    const cards = buildCollisionCards(findings, []);
    assert.equal(cards.length, 6);
  });

  it("sorted by severity then stable key", () => {
    const findings = [
      finding("variant_taken", "low", 'Variant "zzz-low" is taken in npm'),
      finding("variant_taken", "high", 'Variant "aaa-high" is taken in npm'),
    ];
    const cards = buildCollisionCards(findings, []);
    assert.equal(cards.length, 2);
    assert.equal(cards[0].severity, "critical");
    assert.equal(cards[1].severity, "moderate");
  });
});
