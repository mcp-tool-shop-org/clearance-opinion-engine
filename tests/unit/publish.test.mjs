import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { publishRun, appendRunIndex } from "../../src/publish.mjs";

const TMP_DIR = join(import.meta.dirname, "..", ".tmp-publish");

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

function createFakeRun(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), '{"run":{"runId":"test"}}', "utf8");
  writeFileSync(join(dir, "report.html"), "<html>report</html>", "utf8");
  writeFileSync(join(dir, "summary.json"), '{"tier":"green","overallScore":90}', "utf8");
  writeFileSync(join(dir, "run.md"), "# Report", "utf8");
}

describe("publishRun", () => {
  it("copies report.html and summary.json to output directory", () => {
    setup();
    try {
      const runDir = join(TMP_DIR, "source");
      const outDir = join(TMP_DIR, "out", "run1");
      createFakeRun(runDir);

      const result = publishRun(runDir, outDir);
      assert.ok(result.published.includes("report.html"));
      assert.ok(result.published.includes("summary.json"));
      assert.ok(existsSync(join(outDir, "report.html")));
      assert.ok(existsSync(join(outDir, "summary.json")));
    } finally { cleanup(); }
  });

  it("handles missing manifest.json gracefully", () => {
    setup();
    try {
      const runDir = join(TMP_DIR, "source");
      const outDir = join(TMP_DIR, "out", "run1");
      createFakeRun(runDir);
      // Don't create manifest.json

      const result = publishRun(runDir, outDir);
      assert.ok(!result.published.includes("manifest.json"));
      assert.ok(result.published.includes("report.html"));
    } finally { cleanup(); }
  });

  it("copies manifest.json when present", () => {
    setup();
    try {
      const runDir = join(TMP_DIR, "source");
      const outDir = join(TMP_DIR, "out", "run1");
      createFakeRun(runDir);
      writeFileSync(join(runDir, "manifest.json"), '{"files":[]}', "utf8");

      const result = publishRun(runDir, outDir);
      assert.ok(result.published.includes("manifest.json"));
      assert.ok(existsSync(join(outDir, "manifest.json")));
    } finally { cleanup(); }
  });

  it("generates index.html when multiple sibling runs exist", () => {
    setup();
    try {
      const parentDir = join(TMP_DIR, "pub");

      // Create two published runs
      const dir1 = join(parentDir, "run1");
      const dir2 = join(parentDir, "run2");
      mkdirSync(dir1, { recursive: true });
      mkdirSync(dir2, { recursive: true });
      writeFileSync(join(dir1, "summary.json"), '{"tier":"green","overallScore":90}', "utf8");
      writeFileSync(join(dir1, "report.html"), "<html>1</html>", "utf8");

      // Now publish to run2
      const runDir = join(TMP_DIR, "source");
      createFakeRun(runDir);
      const result = publishRun(runDir, dir2);

      assert.ok(result.indexGenerated);
      assert.ok(existsSync(join(parentDir, "index.html")));

      const idx = readFileSync(join(parentDir, "index.html"), "utf8");
      assert.ok(idx.includes("run1"));
      assert.ok(idx.includes("run2"));
    } finally { cleanup(); }
  });

  it("fails for non-existent run directory", () => {
    setup();
    try {
      assert.throws(
        () => publishRun(join(TMP_DIR, "nope"), join(TMP_DIR, "out")),
        /not found/i
      );
    } finally { cleanup(); }
  });

  it("fails if no publishable files exist", () => {
    setup();
    try {
      const runDir = join(TMP_DIR, "empty-run");
      mkdirSync(runDir, { recursive: true });
      writeFileSync(join(runDir, "notes.txt"), "not a publishable file", "utf8");
      assert.throws(
        () => publishRun(runDir, join(TMP_DIR, "out")),
        /no publishable/i
      );
    } finally { cleanup(); }
  });

  it("generates clearance-index.json when summary.json exists", () => {
    setup();
    try {
      const runDir = join(TMP_DIR, "source");
      const outDir = join(TMP_DIR, "out", "my-run");
      createFakeRun(runDir);

      const result = publishRun(runDir, outDir);
      assert.ok(result.published.includes("clearance-index.json"));
      assert.ok(existsSync(join(outDir, "clearance-index.json")));

      const idx = JSON.parse(readFileSync(join(outDir, "clearance-index.json"), "utf8"));
      assert.equal(idx.schemaVersion, "1.0.0");
      assert.equal(idx.tier, "green");
      assert.equal(idx.slug, "my-run");
      assert.ok(idx.reportUrl.includes("report.html"));
    } finally { cleanup(); }
  });

  it("appendRunIndex creates new runs.json when file does not exist", () => {
    setup();
    try {
      const indexPath = join(TMP_DIR, "new-runs.json");
      const entry = { slug: "my-tool", name: "my-tool", tier: "green", score: 90, date: "2026-02-15T12:00:00Z" };

      const result = appendRunIndex(indexPath, entry);
      assert.ok(existsSync(indexPath));
      assert.equal(result.entries, 1);
      assert.equal(result.created, true);

      const runs = JSON.parse(readFileSync(indexPath, "utf8"));
      assert.equal(runs.length, 1);
      assert.equal(runs[0].slug, "my-tool");
    } finally { cleanup(); }
  });

  it("appendRunIndex appends to existing runs.json", () => {
    setup();
    try {
      const indexPath = join(TMP_DIR, "existing-runs.json");
      const entry1 = { slug: "tool-a", name: "tool-a", tier: "green", score: 85, date: "2026-02-14T12:00:00Z" };
      const entry2 = { slug: "tool-b", name: "tool-b", tier: "yellow", score: 60, date: "2026-02-15T12:00:00Z" };

      // Pre-write a 1-entry file
      writeFileSync(indexPath, JSON.stringify([entry1]), "utf8");

      const result = appendRunIndex(indexPath, entry2);
      assert.equal(result.entries, 2);

      const runs = JSON.parse(readFileSync(indexPath, "utf8"));
      assert.equal(runs.length, 2);
      // Sorted by date desc — entry2 (Feb 15) should come first
      assert.equal(runs[0].slug, "tool-b");
      assert.equal(runs[1].slug, "tool-a");
    } finally { cleanup(); }
  });

  it("appendRunIndex deduplicates by slug", () => {
    setup();
    try {
      const indexPath = join(TMP_DIR, "dedup-runs.json");
      const entry1 = { slug: "my-tool", name: "my-tool", tier: "yellow", score: 50, date: "2026-02-14T12:00:00Z" };
      const entry2 = { slug: "my-tool", name: "my-tool", tier: "green", score: 90, date: "2026-02-15T12:00:00Z" };

      appendRunIndex(indexPath, entry1);
      const result = appendRunIndex(indexPath, entry2);

      assert.equal(result.entries, 1);
      const runs = JSON.parse(readFileSync(indexPath, "utf8"));
      assert.equal(runs.length, 1);
      assert.equal(runs[0].tier, "green"); // latest entry wins
    } finally { cleanup(); }
  });

  it("appendRunIndex handles corrupt JSON gracefully", () => {
    setup();
    try {
      const indexPath = join(TMP_DIR, "corrupt-runs.json");
      writeFileSync(indexPath, "{{not valid json!!", "utf8");

      const entry = { slug: "fixed-tool", name: "fixed-tool", tier: "green", score: 95, date: "2026-02-15T12:00:00Z" };
      const result = appendRunIndex(indexPath, entry);

      assert.equal(result.entries, 1);
      const runs = JSON.parse(readFileSync(indexPath, "utf8"));
      assert.equal(runs.length, 1);
      assert.equal(runs[0].slug, "fixed-tool");
    } finally { cleanup(); }
  });

  it("publishRun with indexPath populates runs.json", () => {
    setup();
    try {
      const runDir = join(TMP_DIR, "source");
      const outDir = join(TMP_DIR, "out", "my-run");
      const indexPath = join(TMP_DIR, "runs.json");
      createFakeRun(runDir);

      const result = publishRun(runDir, outDir, { indexPath });
      assert.ok(result.indexResult !== null);
      assert.ok(existsSync(indexPath));

      const runs = JSON.parse(readFileSync(indexPath, "utf8"));
      assert.ok(runs.length >= 1);
      assert.equal(runs[0].slug, "my-run");
    } finally { cleanup(); }
  });
});
