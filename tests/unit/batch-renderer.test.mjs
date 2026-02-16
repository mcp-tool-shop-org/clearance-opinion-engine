import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderBatchResultsJson,
  renderBatchSummaryCsv,
  renderBatchDashboardHtml,
} from "../../src/renderers/batch.mjs";

function makeResult(name, tier = "green", score = 85) {
  return {
    name,
    run: {
      opinion: { tier, scoreBreakdown: { overallScore: score } },
      checks: [{ id: "chk.npm." + name, status: "available" }],
      findings: [],
      run: { runId: `run.2026-02-15.${name}` },
    },
  };
}

function makeErrorResult(name) {
  return { name, error: "Network failure", run: null };
}

describe("renderBatchResultsJson", () => {
  it("returns array with name and tier for each result", () => {
    const results = [makeResult("foo"), makeResult("bar", "red", 30)];
    const json = renderBatchResultsJson(results);
    assert.equal(json.length, 2);
    assert.equal(json[0].name, "foo");
    assert.equal(json[0].tier, "green");
    assert.equal(json[1].tier, "red");
  });

  it("handles error results", () => {
    const json = renderBatchResultsJson([makeErrorResult("bad")]);
    assert.equal(json[0].tier, "error");
    assert.ok(json[0].error);
  });
});

describe("renderBatchSummaryCsv", () => {
  it("has correct header and rows", () => {
    const csv = renderBatchSummaryCsv([makeResult("alpha"), makeResult("beta")]);
    const lines = csv.trim().split("\n");
    assert.equal(lines[0], "name,tier,score,topConflict,checksCount,findingsCount");
    assert.equal(lines.length, 3); // header + 2 rows
  });

  it("sorts rows by name", () => {
    const csv = renderBatchSummaryCsv([makeResult("zulu"), makeResult("alpha")]);
    const lines = csv.trim().split("\n");
    assert.ok(lines[1].startsWith("alpha"));
    assert.ok(lines[2].startsWith("zulu"));
  });

  it("escapes CSV values with commas", () => {
    const r = makeResult("foo");
    r.run.findings = [{ summary: 'Has, commas "and" quotes' }];
    const csv = renderBatchSummaryCsv([r]);
    assert.ok(csv.includes('"Has, commas ""and"" quotes"'));
  });

  it("handles empty results", () => {
    const csv = renderBatchSummaryCsv([]);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 1); // header only
  });
});

describe("renderBatchDashboardHtml", () => {
  it("produces valid HTML with DOCTYPE", () => {
    const html = renderBatchDashboardHtml([makeResult("test")], { total: 1, succeeded: 1, failed: 0, durationMs: 1234 });
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes("</html>"));
  });

  it("contains batch stats", () => {
    const html = renderBatchDashboardHtml([makeResult("test")], { total: 5, succeeded: 4, failed: 1, durationMs: 5000 });
    assert.ok(html.includes("Total: 5"));
    assert.ok(html.includes("Failed: 1"));
  });

  it("escapes HTML in name strings", () => {
    const xss = makeResult('<script>alert(1)</script>');
    const html = renderBatchDashboardHtml([xss], {});
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("sorts results by name", () => {
    const html = renderBatchDashboardHtml(
      [makeResult("zulu"), makeResult("alpha")],
      {}
    );
    const alphaIdx = html.indexOf("alpha");
    const zuluIdx = html.indexOf("zulu");
    assert.ok(alphaIdx < zuluIdx);
  });

  it("includes links to per-name report.html", () => {
    const html = renderBatchDashboardHtml([makeResult("my-tool")], {});
    assert.ok(html.includes("my-tool/report.html"));
  });

  it("handles empty results", () => {
    const html = renderBatchDashboardHtml([], {});
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("<tbody>"));
  });

  it("shows tier colors", () => {
    const html = renderBatchDashboardHtml(
      [makeResult("a", "green"), makeResult("b", "red"), makeResult("c", "yellow")],
      {}
    );
    assert.ok(html.includes("#22c55e")); // green
    assert.ok(html.includes("#ef4444")); // red
    assert.ok(html.includes("#eab308")); // yellow
  });
});
