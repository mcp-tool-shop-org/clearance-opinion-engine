import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreOpinion, classifyFindings } from "../../src/scoring/opinion.mjs";

const AVAILABLE_CHECK = {
  id: "chk.npm.my-tool",
  namespace: "npm",
  query: { candidateMark: "my-tool", value: "my-tool" },
  status: "available",
  authority: "authoritative",
  observedAt: "2026-02-15T12:00:00Z",
  evidenceRef: "ev.chk.npm.my-tool.0",
  errors: [],
};

const TAKEN_CHECK = {
  id: "chk.npm.taken-tool",
  namespace: "npm",
  query: { candidateMark: "taken-tool", value: "taken-tool" },
  status: "taken",
  authority: "authoritative",
  observedAt: "2026-02-15T12:00:00Z",
  evidenceRef: "ev.chk.npm.taken-tool.0",
  errors: [],
};

const UNKNOWN_CHECK = {
  id: "chk.pypi.my-tool",
  namespace: "pypi",
  query: { candidateMark: "my-tool", value: "my-tool" },
  status: "unknown",
  authority: "indicative",
  observedAt: "2026-02-15T12:00:00Z",
  errors: [{ code: "COE.ADAPTER.PYPI_FAIL", message: "Network error" }],
};

const VARIANTS_CLEAN = {
  generatedAt: "2026-02-15T12:00:00Z",
  items: [
    {
      candidateMark: "my-tool",
      canonical: "my-tool",
      forms: [{ type: "original", value: "my-tool" }],
      warnings: [],
    },
  ],
};

const VARIANTS_WITH_HOMOGLYPHS = {
  generatedAt: "2026-02-15T12:00:00Z",
  items: [
    {
      candidateMark: "tool",
      canonical: "tool",
      forms: [{ type: "original", value: "tool" }],
      warnings: [
        {
          code: "COE.HOMOGLYPH_RISK",
          message: "5 confusable variant(s) detected",
          severity: "high",
        },
      ],
    },
  ],
};

describe("scoreOpinion", () => {
  it("returns GREEN when all checks available and no findings", () => {
    const result = scoreOpinion({
      checks: [AVAILABLE_CHECK, { ...AVAILABLE_CHECK, id: "chk.github-org.my-tool", namespace: "github_org" }],
      findings: [],
      variants: VARIANTS_CLEAN,
    });
    assert.equal(result.tier, "green");
    assert.ok(result.summary.includes("GREEN") || result.summary.includes("available"));
    assert.ok(result.reasons.length > 0);
    assert.ok(result.recommendedActions.length > 0);
  });

  it("returns RED when exact_conflict finding exists", () => {
    const exactFinding = {
      id: "fd.exact-conflict.npm.0",
      candidateMark: "taken-tool",
      kind: "exact_conflict",
      summary: "Name taken in npm",
      severity: "high",
      evidenceRefs: ["ev.chk.npm.taken-tool.0"],
    };
    const result = scoreOpinion({
      checks: [TAKEN_CHECK],
      findings: [exactFinding],
      variants: VARIANTS_CLEAN,
    });
    assert.equal(result.tier, "red");
    assert.ok(result.closestConflicts.length > 0);
    assert.ok(result.recommendedActions.some((a) => a.type === "pick_variant"));
  });

  it("returns RED when phonetic_conflict finding exists", () => {
    const phoneticFinding = {
      id: "fd.phonetic-conflict.0",
      candidateMark: "my-tool",
      kind: "phonetic_conflict",
      summary: "Sounds similar to existing name",
      severity: "high",
      evidenceRefs: ["ev.0"],
    };
    const result = scoreOpinion({
      checks: [AVAILABLE_CHECK],
      findings: [phoneticFinding],
      variants: VARIANTS_CLEAN,
    });
    assert.equal(result.tier, "red");
  });

  it("returns YELLOW when some checks are unknown", () => {
    const result = scoreOpinion({
      checks: [AVAILABLE_CHECK, UNKNOWN_CHECK],
      findings: [],
      variants: VARIANTS_CLEAN,
    });
    assert.equal(result.tier, "yellow");
    assert.ok(result.reasons.some((r) => r.includes("unknown")));
    assert.ok(result.limitations.some((l) => l.includes("network")));
  });

  it("returns YELLOW when near_conflict finding exists", () => {
    const nearFinding = {
      id: "fd.near-conflict.0",
      candidateMark: "my-tool",
      kind: "near_conflict",
      summary: "Similar name exists",
      severity: "medium",
      evidenceRefs: ["ev.0"],
    };
    const result = scoreOpinion({
      checks: [AVAILABLE_CHECK],
      findings: [nearFinding],
      variants: VARIANTS_CLEAN,
    });
    assert.equal(result.tier, "yellow");
  });

  it("returns YELLOW for confusable risk when all namespaces available", () => {
    const confusableFinding = {
      id: "fd.confusable-risk.0",
      candidateMark: "tool",
      kind: "confusable_risk",
      summary: "Multiple homoglyph variants",
      severity: "high",
      evidenceRefs: [],
    };
    const result = scoreOpinion(
      {
        checks: [AVAILABLE_CHECK],
        findings: [confusableFinding],
        variants: VARIANTS_WITH_HOMOGLYPHS,
      },
      { riskTolerance: "conservative" }
    );
    // Confusable risk without taken namespaces is YELLOW, not RED
    assert.equal(result.tier, "yellow");
  });

  it("returns RED for confusable risk when namespace is taken", () => {
    const confusableFinding = {
      id: "fd.confusable-risk.0",
      candidateMark: "tool",
      kind: "confusable_risk",
      summary: "Multiple homoglyph variants",
      severity: "high",
      evidenceRefs: [],
    };
    const result = scoreOpinion(
      {
        checks: [TAKEN_CHECK],
        findings: [confusableFinding],
        variants: VARIANTS_WITH_HOMOGLYPHS,
      },
      { riskTolerance: "conservative" }
    );
    // Taken namespace + confusable risk = RED
    assert.equal(result.tier, "red");
  });

  it("always includes assumptions and limitations", () => {
    const result = scoreOpinion({
      checks: [AVAILABLE_CHECK],
      findings: [],
      variants: VARIANTS_CLEAN,
    });
    assert.ok(result.assumptions.length > 0);
    assert.ok(result.limitations.length > 0);
  });

  it("recommendedActions always has at least one item", () => {
    const greenResult = scoreOpinion({
      checks: [AVAILABLE_CHECK],
      findings: [],
      variants: VARIANTS_CLEAN,
    });
    assert.ok(greenResult.recommendedActions.length >= 1);

    const redResult = scoreOpinion({
      checks: [TAKEN_CHECK],
      findings: [
        {
          id: "fd.exact-conflict.0",
          candidateMark: "taken-tool",
          kind: "exact_conflict",
          summary: "Name taken",
          severity: "high",
          evidenceRefs: ["ev.0"],
        },
      ],
      variants: VARIANTS_CLEAN,
    });
    assert.ok(redResult.recommendedActions.length >= 1);
  });
});

describe("classifyFindings", () => {
  it("creates exact_conflict for taken checks", () => {
    const findings = classifyFindings([TAKEN_CHECK], VARIANTS_CLEAN);
    assert.ok(findings.length > 0);
    assert.equal(findings[0].kind, "exact_conflict");
    assert.equal(findings[0].severity, "high");
  });

  it("does not create findings for available checks", () => {
    const findings = classifyFindings([AVAILABLE_CHECK], VARIANTS_CLEAN);
    assert.equal(findings.length, 0);
  });

  it("creates confusable_risk for homoglyph warnings when namespace is taken", () => {
    const findings = classifyFindings(
      [TAKEN_CHECK],
      VARIANTS_WITH_HOMOGLYPHS
    );
    assert.ok(findings.some((f) => f.kind === "confusable_risk"));
  });

  it("does NOT create confusable_risk when all namespaces available", () => {
    const findings = classifyFindings(
      [AVAILABLE_CHECK],
      VARIANTS_WITH_HOMOGLYPHS
    );
    assert.ok(!findings.some((f) => f.kind === "confusable_risk"));
  });
});
