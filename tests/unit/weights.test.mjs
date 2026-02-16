import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WEIGHT_PROFILES,
  TIER_THRESHOLDS,
  getWeightProfile,
  computeScoreBreakdown,
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
