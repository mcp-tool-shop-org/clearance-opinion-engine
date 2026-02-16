import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreOpinion,
  classifyFindings,
  extractTopFactors,
  generateRiskNarrative,
  buildNextActions,
} from "../../src/scoring/opinion.mjs";

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

// ── Phase 6: extractTopFactors ────────────────────────────────

describe("extractTopFactors", () => {
  it("exists and is a function", () => {
    assert.equal(typeof extractTopFactors, "function");
  });

  it("returns array of 3-5 items for a RED run with exact conflicts", () => {
    const data = {
      checks: [TAKEN_CHECK],
      findings: [
        {
          id: "fd.exact-conflict.npm.0",
          candidateMark: "taken-tool",
          kind: "exact_conflict",
          summary: "Name taken in npm",
          severity: "high",
          evidenceRefs: ["ev.0"],
        },
        {
          id: "fd.exact-conflict.pypi.1",
          candidateMark: "taken-tool",
          kind: "exact_conflict",
          summary: "Name taken in pypi",
          severity: "high",
          evidenceRefs: ["ev.1"],
        },
        {
          id: "fd.near-conflict.0",
          candidateMark: "taken-tool",
          kind: "near_conflict",
          summary: 'Name "taken-tool" is near',
          severity: "medium",
          score: 75,
          evidenceRefs: [],
        },
      ],
    };
    const context = { tier: "red", candidateName: "taken-tool" };
    const factors = extractTopFactors(data, context);
    assert.ok(Array.isArray(factors));
    assert.ok(factors.length >= 3 && factors.length <= 5, `Expected 3-5 factors, got ${factors.length}`);
  });

  it("returns all_clear factor for GREEN run", () => {
    const data = {
      checks: [AVAILABLE_CHECK],
      findings: [],
    };
    const context = { tier: "green", candidateName: "my-tool" };
    const factors = extractTopFactors(data, context);
    assert.ok(factors.some((f) => f.factor === "all_clear"));
  });
});

// ── Phase 6: generateRiskNarrative ────────────────────────────

describe("generateRiskNarrative", () => {
  it("exists and is a function", () => {
    assert.equal(typeof generateRiskNarrative, "function");
  });

  it("returns string for RED tier with namespace_collision top factor", () => {
    const context = {
      tier: "red",
      topFactors: [
        { factor: "namespace_collision", statement: "The name 'test' is taken", weight: "critical", category: "exact_conflict" },
      ],
      candidateName: "test",
    };
    const narrative = generateRiskNarrative(context);
    assert.ok(typeof narrative === "string");
    assert.ok(narrative.length > 20);
  });

  it("returns string for GREEN tier", () => {
    const context = {
      tier: "green",
      topFactors: [
        { factor: "all_clear", statement: "All namespaces available", weight: "minor", category: "all_clear" },
      ],
      candidateName: "safe-name",
    };
    const narrative = generateRiskNarrative(context);
    assert.ok(typeof narrative === "string");
    assert.ok(narrative.length > 20);
  });

  it("narrative contains the candidate name", () => {
    const context = {
      tier: "red",
      topFactors: [
        { factor: "namespace_collision", statement: "The name 'my-tool' is taken", weight: "critical", category: "exact_conflict" },
      ],
      candidateName: "my-tool",
    };
    const narrative = generateRiskNarrative(context);
    assert.ok(narrative.includes("my-tool"), "Narrative should contain candidate name");
  });
});

// ── Phase 6: scoreOpinion output includes topFactors and riskNarrative ──

describe("scoreOpinion (Phase 6 additions)", () => {
  it("output includes topFactors array", () => {
    const result = scoreOpinion({
      checks: [AVAILABLE_CHECK],
      findings: [],
      variants: VARIANTS_CLEAN,
    });
    assert.ok(Array.isArray(result.topFactors), "topFactors must be an array");
  });

  it("output includes riskNarrative string", () => {
    const result = scoreOpinion({
      checks: [AVAILABLE_CHECK],
      findings: [],
      variants: VARIANTS_CLEAN,
    });
    assert.ok(typeof result.riskNarrative === "string", "riskNarrative must be a string");
    assert.ok(result.riskNarrative.length > 0, "riskNarrative must not be empty");
  });
});

// ── Phase 8: buildNextActions ─────────────────────────────────────

describe("buildNextActions", () => {
  it("includes url for claim_now when claimLinks provided", () => {
    const actions = buildNextActions(
      { checks: [AVAILABLE_CHECK] },
      {
        tier: "green",
        candidateName: "my-tool",
        claimLinks: ["https://npmjs.com/package/test"],
      }
    );
    const claimAction = actions.find((a) => a.type === "claim_now");
    assert.ok(claimAction, "claim_now action must exist");
    assert.equal(claimAction.url, "https://npmjs.com/package/test");
  });

  it("includes url for register_domain when domainLinks provided", () => {
    const domainCheck = {
      ...AVAILABLE_CHECK,
      id: "chk.domain.my-tool.com",
      namespace: "domain",
      query: { candidateMark: "my-tool", value: "my-tool.com" },
    };
    const actions = buildNextActions(
      { checks: [AVAILABLE_CHECK, domainCheck] },
      {
        tier: "green",
        candidateName: "my-tool",
        domainLinks: ["https://namecheap.com/domains/registration/results/?domain=my-tool.com"],
      }
    );
    const domainAction = actions.find((a) => a.type === "register_domain");
    assert.ok(domainAction, "register_domain action must exist");
    assert.equal(domainAction.url, "https://namecheap.com/domains/registration/results/?domain=my-tool.com");
  });

  it("omits url when no links available", () => {
    const actions = buildNextActions(
      { checks: [AVAILABLE_CHECK] },
      {
        tier: "green",
        candidateName: "my-tool",
      }
    );
    const claimAction = actions.find((a) => a.type === "claim_now");
    assert.ok(claimAction, "claim_now action must exist");
    assert.equal(claimAction.url, undefined, "url must not be set when no claimLinks provided");
  });

  it("scoreOpinion passes claimLinks to nextActions", () => {
    const npmCheck = {
      ...AVAILABLE_CHECK,
      id: "chk.npm.my-tool",
      namespace: "npm",
      query: { candidateMark: "my-tool", value: "my-tool" },
    };
    const githubCheck = {
      ...AVAILABLE_CHECK,
      id: "chk.github-org.my-tool",
      namespace: "github_org",
      query: { candidateMark: "my-tool", value: "my-tool" },
    };
    const result = scoreOpinion({
      checks: [npmCheck, githubCheck],
      findings: [],
      variants: VARIANTS_CLEAN,
    });
    assert.ok(result.nextActions.length > 0, "nextActions must have entries");
    const claimAction = result.nextActions.find((a) => a.type === "claim_now");
    assert.ok(claimAction, "claim_now action must exist");
    assert.ok(claimAction.url, "claim_now action must have url from reservation links");
  });
});
