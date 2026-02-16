import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fuzzyVariants, selectTopN } from "../../src/variants/fuzzy.mjs";

describe("fuzzyVariants", () => {
  it("generates deletion variants", () => {
    const variants = fuzzyVariants("abc", { maxVariants: 500 });
    // Removing each char: "bc", "ac", "ab"
    assert.ok(variants.includes("bc"));
    assert.ok(variants.includes("ac"));
    assert.ok(variants.includes("ab"));
  });

  it("generates substitution variants", () => {
    const variants = fuzzyVariants("abc", { maxVariants: 500 });
    // Replacing 'a' with 'x': "xbc"
    assert.ok(variants.includes("xbc"));
    // Replacing 'b' with 'z': "azc"
    assert.ok(variants.includes("azc"));
  });

  it("generates insertion variants", () => {
    const variants = fuzzyVariants("ab", { maxVariants: 500 });
    // Insert 'x' at start: "xab"
    assert.ok(variants.includes("xab"));
    // Insert 'x' in middle: "axb"
    assert.ok(variants.includes("axb"));
    // Insert 'x' at end: "abx"
    assert.ok(variants.includes("abx"));
  });

  it("sorts variants deterministically", () => {
    const a = fuzzyVariants("test", { maxVariants: 100 });
    const b = fuzzyVariants("test", { maxVariants: 100 });
    assert.deepEqual(a, b);
  });

  it("deduplicates variants", () => {
    const variants = fuzzyVariants("abc", { maxVariants: 500 });
    const unique = new Set(variants);
    assert.equal(variants.length, unique.size);
  });

  it("caps at maxVariants", () => {
    const variants = fuzzyVariants("my-cool-tool", { maxVariants: 10 });
    assert.ok(variants.length <= 10);
  });

  it("does not include the original name", () => {
    const variants = fuzzyVariants("test", { maxVariants: 500 });
    assert.ok(!variants.includes("test"));
  });

  it("handles single character name", () => {
    const variants = fuzzyVariants("a", { maxVariants: 500 });
    // Deletions: "" (empty, filtered out)
    // Substitutions: all other chars
    // Insertions: all chars at pos 0 and 1
    assert.ok(variants.length > 0);
    assert.ok(!variants.includes("a"));
    assert.ok(!variants.includes("")); // empty strings excluded
  });

  it("handles empty string", () => {
    const variants = fuzzyVariants("", { maxVariants: 500 });
    // Only insertions of single chars
    assert.ok(variants.length > 0);
    // Each single char is an insertion
    assert.ok(variants.includes("a"));
    assert.ok(variants.includes("z"));
  });

  it("handles long names without explosion", () => {
    const variants = fuzzyVariants("this-is-a-very-long-name", { maxVariants: 30 });
    assert.ok(variants.length <= 30);
    assert.ok(variants.length > 0);
  });

  it("default maxVariants is 30", () => {
    const variants = fuzzyVariants("my-cool-tool");
    assert.ok(variants.length <= 30);
  });

  it("stable across multiple runs", () => {
    // Run 10 times and verify identical
    const first = fuzzyVariants("tool", { maxVariants: 20 });
    for (let i = 0; i < 10; i++) {
      const next = fuzzyVariants("tool", { maxVariants: 20 });
      assert.deepEqual(first, next, `run ${i + 1} differs`);
    }
  });
});

describe("selectTopN", () => {
  it("returns first N items", () => {
    const input = ["a", "b", "c", "d", "e"];
    const result = selectTopN(input, 3);
    assert.deepEqual(result, ["a", "b", "c"]);
  });

  it("returns all if fewer than N", () => {
    const input = ["a", "b"];
    const result = selectTopN(input, 5);
    assert.deepEqual(result, ["a", "b"]);
  });

  it("defaults to 12", () => {
    const input = Array.from({ length: 20 }, (_, i) => String(i));
    const result = selectTopN(input);
    assert.equal(result.length, 12);
  });

  it("returns empty for empty input", () => {
    assert.deepEqual(selectTopN([]), []);
  });
});
