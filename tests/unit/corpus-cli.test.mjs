import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { corpusInit, corpusAdd } from "../../src/corpus/cli.mjs";

const TMP_DIR = join(import.meta.dirname, "..", ".tmp-corpus-cli");

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

const NOW = "2026-02-15T12:00:00.000Z";

describe("corpusInit", () => {
  it("creates a valid corpus.json template", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      const result = corpusInit(p, { now: NOW });
      assert.equal(result.created, true);
      const data = JSON.parse(readFileSync(p, "utf8"));
      assert.ok(Array.isArray(data.marks));
      assert.equal(data.marks.length, 0);
      assert.equal(data.metadata.version, "1.0.0");
      assert.equal(data.metadata.createdAt, NOW);
    } finally { cleanup(); }
  });

  it("fails if file already exists", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      writeFileSync(p, "{}", "utf8");
      assert.throws(() => corpusInit(p, { now: NOW }), /already exists/i);
    } finally { cleanup(); }
  });
});

describe("corpusAdd", () => {
  it("appends a mark to existing corpus", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      corpusInit(p, { now: NOW });
      const result = corpusAdd(p, { name: "React" });
      assert.equal(result.added, true);
      assert.ok(result.id);

      const data = JSON.parse(readFileSync(p, "utf8"));
      assert.equal(data.marks.length, 1);
      assert.equal(data.marks[0].mark, "React");
    } finally { cleanup(); }
  });

  it("generates deterministic ID from name", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      corpusInit(p, { now: NOW });
      const r1 = corpusAdd(p, { name: "React" });
      cleanup();
      setup();
      const p2 = join(TMP_DIR, "corpus.json");
      corpusInit(p2, { now: NOW });
      const r2 = corpusAdd(p2, { name: "React" });
      assert.equal(r1.id, r2.id);
    } finally { cleanup(); }
  });

  it("deduplicates by name (case-insensitive)", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      corpusInit(p, { now: NOW });
      corpusAdd(p, { name: "React" });
      const result = corpusAdd(p, { name: "react" });
      assert.equal(result.added, false);
      assert.equal(result.reason, "duplicate");

      const data = JSON.parse(readFileSync(p, "utf8"));
      assert.equal(data.marks.length, 1);
    } finally { cleanup(); }
  });

  it("preserves existing marks when adding", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      corpusInit(p, { now: NOW });
      corpusAdd(p, { name: "React" });
      corpusAdd(p, { name: "Vue" });

      const data = JSON.parse(readFileSync(p, "utf8"));
      assert.equal(data.marks.length, 2);
      assert.equal(data.marks[0].mark, "React");
      assert.equal(data.marks[1].mark, "Vue");
    } finally { cleanup(); }
  });

  it("includes class and registrant when provided", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      corpusInit(p, { now: NOW });
      corpusAdd(p, { name: "React", class: 9, registrant: "Meta" });

      const data = JSON.parse(readFileSync(p, "utf8"));
      assert.equal(data.marks[0].class, 9);
      assert.equal(data.marks[0].registrant, "Meta");
    } finally { cleanup(); }
  });

  it("fails with empty name", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      corpusInit(p, { now: NOW });
      assert.throws(() => corpusAdd(p, { name: "" }), /required/i);
    } finally { cleanup(); }
  });

  it("fails if corpus file does not exist", () => {
    setup();
    try {
      const p = join(TMP_DIR, "nonexistent.json");
      assert.throws(() => corpusAdd(p, { name: "React" }), /not found/i);
    } finally { cleanup(); }
  });

  it("writes atomically (tmp file should not persist)", () => {
    setup();
    try {
      const p = join(TMP_DIR, "corpus.json");
      corpusInit(p, { now: NOW });
      corpusAdd(p, { name: "React" });

      // No .corpus-tmp-* files should remain
      const files = readdirSync(TMP_DIR);
      const tmpFiles = files.filter((f) => f.startsWith(".corpus-tmp-"));
      assert.equal(tmpFiles.length, 0);
    } finally { cleanup(); }
  });
});
