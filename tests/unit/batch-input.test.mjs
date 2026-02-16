import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseBatchInput } from "../../src/batch/input.mjs";

const TMP_DIR = join(import.meta.dirname, "..", ".tmp-batch-input");

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
}

function cleanup() {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

function writeTmp(name, content) {
  const p = join(TMP_DIR, name);
  writeFileSync(p, content, "utf8");
  return p;
}

describe("parseBatchInput", () => {
  it("parses .txt with one name per line", () => {
    setup();
    try {
      const p = writeTmp("names.txt", "foo\nbar\nbaz\n");
      const result = parseBatchInput(p);
      assert.equal(result.format, "txt");
      assert.equal(result.names.length, 3);
      assert.deepEqual(result.names.map((n) => n.name), ["foo", "bar", "baz"]);
    } finally { cleanup(); }
  });

  it("ignores blank lines and # comments in .txt", () => {
    setup();
    try {
      const p = writeTmp("names.txt", "# My names\nfoo\n\n# Another\nbar\n\n");
      const result = parseBatchInput(p);
      assert.equal(result.names.length, 2);
      assert.deepEqual(result.names.map((n) => n.name), ["foo", "bar"]);
    } finally { cleanup(); }
  });

  it("parses JSON string array", () => {
    setup();
    try {
      const p = writeTmp("names.json", JSON.stringify(["alpha", "beta"]));
      const result = parseBatchInput(p);
      assert.equal(result.format, "json");
      assert.equal(result.names.length, 2);
      assert.deepEqual(result.names.map((n) => n.name), ["alpha", "beta"]);
    } finally { cleanup(); }
  });

  it("parses JSON object array with per-name config", () => {
    setup();
    try {
      const data = [
        { name: "foo", channels: "all" },
        { name: "bar" },
      ];
      const p = writeTmp("names.json", JSON.stringify(data));
      const result = parseBatchInput(p);
      assert.equal(result.names.length, 2);
      assert.equal(result.names[0].name, "foo");
      assert.deepEqual(result.names[0].config, { channels: "all" });
      assert.equal(result.names[1].config, undefined);
    } finally { cleanup(); }
  });

  it("rejects duplicate names", () => {
    setup();
    try {
      const p = writeTmp("names.txt", "foo\nbar\nFOO\n");
      assert.throws(() => parseBatchInput(p), /[Dd]uplicate/);
    } finally { cleanup(); }
  });

  it("rejects empty .txt file", () => {
    setup();
    try {
      const p = writeTmp("names.txt", "# just comments\n\n");
      assert.throws(() => parseBatchInput(p), /no names/i);
    } finally { cleanup(); }
  });

  it("rejects empty JSON array", () => {
    setup();
    try {
      const p = writeTmp("names.json", "[]");
      assert.throws(() => parseBatchInput(p), /no names/i);
    } finally { cleanup(); }
  });

  it("rejects JSON with empty string entry", () => {
    setup();
    try {
      const p = writeTmp("names.json", JSON.stringify(["foo", ""]));
      assert.throws(() => parseBatchInput(p), /empty/i);
    } finally { cleanup(); }
  });

  it("rejects unsupported file extension", () => {
    setup();
    try {
      const p = writeTmp("names.csv", "foo,bar");
      assert.throws(() => parseBatchInput(p), /[Uu]nsupported/);
    } finally { cleanup(); }
  });

  it("trims whitespace in .txt names", () => {
    setup();
    try {
      const p = writeTmp("names.txt", "  foo  \n  bar  \n");
      const result = parseBatchInput(p);
      assert.deepEqual(result.names.map((n) => n.name), ["foo", "bar"]);
    } finally { cleanup(); }
  });
});
