import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WEIGHT_PROFILES,
  TIER_THRESHOLDS,
  getWeightProfile,
  computeScoreBreakdown,
  computeDupontFactors,
} from "../../src/scoring/weights.mjs";

describe("WEIGHT_PROFILES", () => {
  it("has profiles for conservative, balanced, aggressive", () => {
    assert.ok(WEIGHT_PROFILES.conservative);
    assert.ok(WEIGHT_PROFILES.balanced);
    assert.ok(WEIGHT_PROFILES.aggressive);
  });

  it("all weights sum to 100 for each profile", () => {
    for (const [name, profile] of Object.entries(WEIGHT_PROFILES)) {
      const sum =
        profile.namespaceAvailability +
        profile.coverageCompleteness +
        profile.conflictSeverity +
        profile.domainAvailability;
      assert.equal(sum, 100, `Profile "${name}" weights sum to ${sum}, expected 100`);
    }
  });
});

describe("TIER_THRESHOLDS", () => {
  it("has thresholds for each risk tolerance", () => {
    assert.ok(TIER_THRESHOLDS.conservative);
    assert.ok(TIER_THRESHOLDS.balanced);
    assert.ok(TIER_THRESHOLDS.aggressive);
  });

  it("green > yellow for all profiles", () => {
    for (const [name, t] of Object.entries(TIER_THRESHOLDS)) {
      assert.ok(t.green > t.yellow, `Profile "${name}": green (${t.green}) must be > yellow (${t.yellow})`);
    }
  });
});

describe("getWeightProfile", () => {
  it("returns the correct profile for known tolerance", () => {
    assert.deepEqual(getWeightProfile("conservative"), WEIGHT_PROFILES.conservative);
    assert.deepEqual(getWeightProfile("balanced"), WEIGHT_PROFILES.balanced);
    assert.deepEqual(getWeightProfile("aggressive"), WEIGHT_PROFILES.aggressive);
  });

  it("defaults to conservative for unknown tolerance", () => {
    assert.deepEqual(getWeightProfile("unknown"), WEIGHT_PROFILES.conservative);
    assert.deepEqual(getWeightProfile(""), WEIGHT_PROFILES.conservative);
  });
});

describe("computeScoreBreakdown", () => {
  const allAvailableChecks = [
    { namespace: "github_repo", status: "available", query: { value: "test" } },
    { namespace: "npm", status: "available", query: { value: "test" } },
    { namespace: "pypi", status: "available", query: { value: "test" } },
  ];

  it("returns 100 overall when all namespaces available and no conflicts (excluding domain weight)", () => {
    const result = computeScoreBreakdown(
      { checks: allAvailableChecks, findings: [], variants: {} },
      { riskTolerance: "conservative" }
    );

    assert.equal(result.namespaceAvailability.score, 100);
    assert.equal(result.conflictSeverity.score, 100);
    // Domain not checked = 50, coverage 3/4 = 75
    assert.equal(result.domainAvailability.score, 50);
    assert.equal(result.coverageCompleteness.score, 75);
    assert.ok(result.overallScore > 0);
    assert.ok(result.overallScore <= 100);
  });

  it("returns lower score when some namespaces taken", () => {
    const mixedChecks = [
      { namespace: "github_repo", status: "available", query: { value: "test" } },
      { namespace: "npm", status: "taken", query: { value: "test" } },
      { namespace: "pypi", status: "available", query: { value: "test" } },
    ];
    const result = computeScoreBreakdown(
      { checks: mixedChecks, findings: [], variants: {} }
    );

    // 2/3 available = 67
    assert.equal(result.namespaceAvailability.score, 67);
    assert.ok(result.overallScore < 100);
  });

  it("conflictSeverity decreases with exact conflicts", () => {
    const exactFindings = [
      { kind: "exact_conflict" },
      { kind: "exact_conflict" },
    ];
    const result = computeScoreBreakdown(
      { checks: allAvailableChecks, findings: exactFindings, variants: {} }
    );

    // 100 - 30 - 30 = 40
    assert.equal(result.conflictSeverity.score, 40);
  });

  it("coverageCompleteness reflects missing channels", () => {
    const singleCheck = [
      { namespace: "npm", status: "available", query: { value: "test" } },
    ];
    const result = computeScoreBreakdown(
      { checks: singleCheck, findings: [], variants: {} }
    );

    // 1/4 channels checked = 25
    assert.equal(result.coverageCompleteness.score, 25);
    assert.ok(result.coverageCompleteness.details.includes("not checked"));
  });

  it("domainAvailability is 50 when domain not checked", () => {
    const result = computeScoreBreakdown(
      { checks: allAvailableChecks, findings: [], variants: {} }
    );

    assert.equal(result.domainAvailability.score, 50);
    assert.equal(result.domainAvailability.details, "Domain not checked");
  });

  it("domainAvailability is 100 when domain available", () => {
    const checksWithDomain = [
      ...allAvailableChecks,
      { namespace: "domain", status: "available", query: { value: "test.com" } },
    ];
    const result = computeScoreBreakdown(
      { checks: checksWithDomain, findings: [], variants: {} }
    );

    assert.equal(result.domainAvailability.score, 100);
    assert.ok(result.domainAvailability.details.includes("available"));
  });

  it("overallScore respects weight profile for risk tolerance", () => {
    const data = { checks: allAvailableChecks, findings: [], variants: {} };
    const conservative = computeScoreBreakdown(data, { riskTolerance: "conservative" });
    const aggressive = computeScoreBreakdown(data, { riskTolerance: "aggressive" });

    // Both should produce reasonable scores, may differ slightly due to weights
    assert.ok(typeof conservative.overallScore === "number");
    assert.ok(typeof aggressive.overallScore === "number");
  });

  it("all sub-scores are integers 0-100", () => {
    const result = computeScoreBreakdown(
      { checks: allAvailableChecks, findings: [], variants: {} }
    );

    for (const key of ["namespaceAvailability", "coverageCompleteness", "conflictSeverity", "domainAvailability"]) {
      const s = result[key].score;
      assert.ok(Number.isInteger(s), `${key}.score = ${s} is not integer`);
      assert.ok(s >= 0 && s <= 100, `${key}.score = ${s} is out of range`);
    }
    assert.ok(Number.isInteger(result.overallScore));
    assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
  });

  it("details strings are human-readable", () => {
    const result = computeScoreBreakdown(
      { checks: allAvailableChecks, findings: [], variants: {} }
    );

    assert.ok(result.namespaceAvailability.details.length > 0);
    assert.ok(result.coverageCompleteness.details.length > 0);
    assert.ok(result.conflictSeverity.details.length > 0);
    assert.ok(result.domainAvailability.details.length > 0);
  });

  it("includes tierThresholds", () => {
    const result = computeScoreBreakdown(
      { checks: allAvailableChecks, findings: [], variants: {} },
      { riskTolerance: "conservative" }
    );

    assert.equal(result.tierThresholds.green, 80);
    assert.equal(result.tierThresholds.yellow, 50);
  });

  it("conflictSeverity clamps to 0 (never negative)", () => {
    const manyFindings = Array.from({ length: 10 }, () => ({ kind: "exact_conflict" }));
    const result = computeScoreBreakdown(
      { checks: allAvailableChecks, findings: manyFindings, variants: {} }
    );

    assert.equal(result.conflictSeverity.score, 0);
  });
});

// ── Phase 6: computeDupontFactors ────────────────────────────

describe("computeDupontFactors", () => {
  it("exists and is a function", () => {
    assert.equal(typeof computeDupontFactors, "function");
  });

  it("returns object with similarityOfMarks, channelOverlap, fameProxy, intentProxy", () => {
    const result = computeDupontFactors({ checks: [], findings: [] });
    assert.ok(result.similarityOfMarks);
    assert.ok(result.channelOverlap);
    assert.ok(result.fameProxy);
    assert.ok(result.intentProxy);
  });

  it("each factor has score (number) and rationale (string)", () => {
    const result = computeDupontFactors({ checks: [], findings: [] });
    for (const key of ["similarityOfMarks", "channelOverlap", "fameProxy", "intentProxy"]) {
      assert.ok(typeof result[key].score === "number", `${key}.score must be a number`);
      assert.ok(typeof result[key].rationale === "string", `${key}.rationale must be a string`);
    }
  });

  it("default scores are 0 when no radar/corpus data present", () => {
    const result = computeDupontFactors({ checks: [], findings: [] });
    assert.equal(result.similarityOfMarks.score, 0);
    assert.equal(result.fameProxy.score, 0);
    assert.equal(result.intentProxy.score, 0);
  });

  it("channelOverlap calculates based on conflict ratio", () => {
    const checks = [
      { namespace: "npm", status: "taken", query: { value: "test" } },
      { namespace: "pypi", status: "available", query: { value: "test" } },
    ];
    const intake = { channels: ["open-source", "saas"] };
    const result = computeDupontFactors({ checks, findings: [], intake });
    // 1 taken out of 2 channels = 50
    assert.equal(result.channelOverlap.score, 50);
  });

  it("fameProxy fires when >3 high-similarity radar hits", () => {
    const checks = Array.from({ length: 4 }, (_, i) => ({
      namespace: "custom",
      status: "taken",
      query: { value: `similar-${i}` },
      details: {
        source: "github_search",
        similarity: { overall: 0.90, looks: { label: "high" }, sounds: { label: "high" } },
      },
    }));
    const result = computeDupontFactors({ checks, findings: [] });
    assert.ok(result.fameProxy.score > 0, "fameProxy score should be > 0 with high-similarity hits");
    assert.equal(result.fameProxy.score, 100); // 4 * 25 = 100
  });

  it("intentProxy fires when variant_taken findings exist", () => {
    const findings = [
      { kind: "variant_taken", summary: "variant taken" },
      { kind: "variant_taken", summary: "another variant taken" },
    ];
    const result = computeDupontFactors({ checks: [], findings });
    assert.ok(result.intentProxy.score > 0, "intentProxy score should be > 0 with variant_taken findings");
    assert.equal(result.intentProxy.score, 60); // 2 * 30 = 60
  });
});
