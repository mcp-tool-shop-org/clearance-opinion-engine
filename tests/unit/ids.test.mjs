import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeSegment,
  checkId,
  evidenceId,
  findingId,
} from "../../src/lib/ids.mjs";

describe("ids", () => {
  describe("sanitizeSegment", () => {
    it("lowercases and strips special characters", () => {
      assert.equal(sanitizeSegment("My Cool Tool"), "my-cool-tool");
    });

    it("preserves dots and hyphens", () => {
      assert.equal(sanitizeSegment("my.cool-tool"), "my.cool-tool");
    });

    it("collapses consecutive hyphens", () => {
      assert.equal(sanitizeSegment("a---b"), "a-b");
    });

    it("trims leading and trailing hyphens", () => {
      assert.equal(sanitizeSegment("-hello-"), "hello");
    });
  });

  describe("checkId", () => {
    it("generates chk.<namespace>.<name>", () => {
      assert.equal(checkId("npm", "my-tool"), "chk.npm.my-tool");
    });

    it("sanitizes namespace and name", () => {
      assert.equal(checkId("GitHub Org", "My Tool!"), "chk.github-org.my-tool");
    });
  });

  describe("evidenceId", () => {
    it("generates ev.<checkId>.<idx>", () => {
      assert.equal(
        evidenceId("chk.npm.my-tool", 0),
        "ev.chk.npm.my-tool.0"
      );
    });

    it("increments index", () => {
      assert.equal(
        evidenceId("chk.npm.my-tool", 3),
        "ev.chk.npm.my-tool.3"
      );
    });
  });

  describe("findingId", () => {
    it("generates fd.<kind>.<slug>.<idx>", () => {
      assert.equal(
        findingId("exact_conflict", "my-tool", 0),
        "fd.exact-conflict.my-tool.0"
      );
    });

    it("handles phonetic_conflict kind", () => {
      assert.equal(
        findingId("phonetic_conflict", "my-tool", 1),
        "fd.phonetic-conflict.my-tool.1"
      );
    });
  });
});
