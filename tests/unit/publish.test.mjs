import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { publishRun } from "../../src/publish.mjs";

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
      writeFileSync(join(runDir, "run.json"), "{}", "utf8"); // only run.json, no report.html
      assert.throws(
        () => publishRun(runDir, join(TMP_DIR, "out")),
        /no publishable/i
      );
    } finally { cleanup(); }
  });
});
