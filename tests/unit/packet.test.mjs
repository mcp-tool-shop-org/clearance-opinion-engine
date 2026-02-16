import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderPacketHtml, renderSummaryJson } from "../../src/renderers/packet.mjs";

// Minimal valid run object for testing
function makeTestRun(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    run: {
      runId: "run.2026-02-15.abc12345",
      engineVersion: "0.2.0",
      createdAt: "2026-02-15T12:00:00.000Z",
      inputsSha256: "a".repeat(64),
    },
    intake: {
      candidates: [{ mark: "my-cool-tool", style: "word" }],
      goodsServices: "Software tool",
      geographies: [{ type: "region", code: "GLOBAL" }],
      channels: ["open-source"],
      riskTolerance: "conservative",
    },
    variants: {
      generatedAt: "2026-02-15T12:00:00.000Z",
      items: [
        {
          candidateMark: "my-cool-tool",
          canonical: "mycooltool",
          forms: [
            { type: "original", value: "my-cool-tool" },
            { type: "phonetic", value: "MKLTH" },
          ],
          warnings: [],
        },
      ],
    },
    checks: [
      {
        id: "chk.npm.my-cool-tool",
        namespace: "npm",
        query: { candidateMark: "my-cool-tool", value: "my-cool-tool" },
        status: "available",
        authority: "authoritative",
        observedAt: "2026-02-15T12:00:00.000Z",
        evidenceRef: "ev.chk.npm.my-cool-tool.0",
        errors: [],
      },
    ],
    findings: [],
    evidence: [
      {
        id: "ev.chk.npm.my-cool-tool.0",
        type: "http_response",
        source: { system: "npm", url: "https://registry.npmjs.org/my-cool-tool", method: "GET" },
        observedAt: "2026-02-15T12:00:00.000Z",
        sha256: "b".repeat(64),
        bytes: 100,
      },
    ],
    opinion: {
      tier: "green",
      summary: 'All namespaces available for "my-cool-tool". No conflicts detected.',
      reasons: ["All 1 namespace check(s) returned available with no conflicts"],
      assumptions: ["Namespace availability is checked at a point in time."],
      limitations: ["This engine does not check trademark databases."],
      recommendedActions: [
        {
          type: "claim_handles",
          label: "Claim namespace handles now",
          details: "All 1 namespaces are available.",
          links: ["https://www.npmjs.com/package/my-cool-tool"],
        },
      ],
      closestConflicts: [],
      scoreBreakdown: {
        namespaceAvailability: { score: 100, weight: 40, details: "1/1 namespaces available" },
        coverageCompleteness: { score: 25, weight: 25, details: "1/4 channels checked" },
        conflictSeverity: { score: 100, weight: 25, details: "No conflicts detected" },
        domainAvailability: { score: 50, weight: 10, details: "Domain not checked" },
        overallScore: 78,
        tierThresholds: { green: 80, yellow: 50 },
      },
    },
    ...overrides,
  };
}

describe("renderPacketHtml", () => {
  it("returns valid HTML document with DOCTYPE", () => {
    const html = renderPacketHtml(makeTestRun());
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes("</html>"));
  });

  it("contains inline CSS (no external links)", () => {
    const html = renderPacketHtml(makeTestRun());
    assert.ok(html.includes("<style>"));
    assert.ok(!html.includes('<link rel="stylesheet"'));
    assert.ok(!html.includes("https://fonts.googleapis.com"));
  });

  it("escapes user-provided candidate names in output", () => {
    const run = makeTestRun({
      intake: {
        candidates: [{ mark: '<script>alert("xss")</script>', style: "word" }],
        goodsServices: "Test",
        geographies: [],
        channels: [],
        riskTolerance: "conservative",
      },
    });
    const html = renderPacketHtml(run);
    assert.ok(!html.includes('<script>alert("xss")</script>'));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("includes score breakdown table", () => {
    const html = renderPacketHtml(makeTestRun());
    assert.ok(html.includes("Why This Tier?"));
    assert.ok(html.includes("Namespace Availability"));
    assert.ok(html.includes("Overall Score"));
  });

  it("includes evidence chain table", () => {
    const html = renderPacketHtml(makeTestRun());
    assert.ok(html.includes("Evidence Chain"));
    assert.ok(html.includes("ev.chk.npm.my-cool-tool.0"));
  });

  it("is deterministic — same run produces identical HTML", () => {
    const run = makeTestRun();
    const html1 = renderPacketHtml(run);
    const html2 = renderPacketHtml(run);
    assert.equal(html1, html2);
  });

  it("includes clickable links in recommended actions", () => {
    const html = renderPacketHtml(makeTestRun());
    assert.ok(html.includes('href="https:'));
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes('rel="noopener noreferrer"'));
  });
});

describe("renderSummaryJson", () => {
  it("includes tier and overallScore", () => {
    const summary = renderSummaryJson(makeTestRun());
    assert.equal(summary.tier, "green");
    assert.equal(summary.overallScore, 78);
  });

  it("includes namespace status array", () => {
    const summary = renderSummaryJson(makeTestRun());
    assert.ok(Array.isArray(summary.namespaces));
    assert.equal(summary.namespaces.length, 1);
    assert.equal(summary.namespaces[0].namespace, "npm");
    assert.equal(summary.namespaces[0].status, "available");
  });

  it("includes findingsSummary with byKind counts", () => {
    const summary = renderSummaryJson(makeTestRun());
    assert.ok(summary.findingsSummary);
    assert.equal(summary.findingsSummary.total, 0);
    assert.deepEqual(summary.findingsSummary.byKind, {});
  });

  it("includes recommendedActions with links", () => {
    const summary = renderSummaryJson(makeTestRun());
    assert.ok(Array.isArray(summary.recommendedActions));
    assert.ok(summary.recommendedActions[0].links.length > 0);
  });

  it("includes candidate names", () => {
    const summary = renderSummaryJson(makeTestRun());
    assert.deepEqual(summary.candidates, ["my-cool-tool"]);
  });

  it("includes runId and inputsSha256", () => {
    const summary = renderSummaryJson(makeTestRun());
    assert.ok(summary.runId.startsWith("run."));
    assert.equal(summary.inputsSha256.length, 64);
  });
});
