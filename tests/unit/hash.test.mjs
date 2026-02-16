import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashString, hashObject, canonicalize } from "../../src/lib/hash.mjs";

describe("hash", () => {
  describe("hashString", () => {
    it("produces a 64-char hex SHA-256", () => {
      const h = hashString("hello");
      assert.equal(h.length, 64);
      assert.match(h, /^[a-f0-9]{64}$/);
    });

    it("is deterministic", () => {
      assert.equal(hashString("test"), hashString("test"));
    });

    it("different inputs produce different hashes", () => {
      assert.notEqual(hashString("a"), hashString("b"));
    });
  });

  describe("canonicalize", () => {
    it("sorts object keys alphabetically", () => {
      const input = { z: 1, a: 2, m: 3 };
      const result = canonicalize(input);
      assert.deepEqual(Object.keys(result), ["a", "m", "z"]);
    });

    it("sorts nested objects recursively", () => {
      const input = { b: { z: 1, a: 2 }, a: 1 };
      const result = canonicalize(input);
      assert.deepEqual(Object.keys(result), ["a", "b"]);
      assert.deepEqual(Object.keys(result.b), ["a", "z"]);
    });

    it("preserves array order", () => {
      const input = { arr: [3, 1, 2] };
      const result = canonicalize(input);
      assert.deepEqual(result.arr, [3, 1, 2]);
    });

    it("handles null and primitives", () => {
      assert.equal(canonicalize(null), null);
      assert.equal(canonicalize(42), 42);
      assert.equal(canonicalize("hello"), "hello");
      assert.equal(canonicalize(true), true);
    });
  });

  describe("hashObject", () => {
    it("produces identical hash regardless of key order", () => {
      const a = { z: 1, a: 2 };
      const b = { a: 2, z: 1 };
      assert.equal(hashObject(a), hashObject(b));
    });

    it("different objects produce different hashes", () => {
      assert.notEqual(hashObject({ a: 1 }), hashObject({ a: 2 }));
    });
  });
});
