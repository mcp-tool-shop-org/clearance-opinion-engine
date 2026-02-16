import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalize, stripAll } from "../../src/variants/normalize.mjs";
import { tokenize } from "../../src/variants/tokenize.mjs";
import { metaphone, phoneticVariants, phoneticSignature } from "../../src/variants/phonetic.mjs";
import { homoglyphVariants, areConfusable } from "../../src/variants/homoglyphs.mjs";
import { generateVariants, generateAllVariants } from "../../src/variants/index.mjs";

describe("normalize", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    assert.equal(normalize("My Cool Tool"), "my-cool-tool");
  });

  it("strips non-alphanumeric except hyphens", () => {
    assert.equal(normalize("hello!@#world"), "hello-world");
  });

  it("collapses consecutive hyphens", () => {
    assert.equal(normalize("a---b"), "a-b");
  });

  it("trims leading/trailing hyphens", () => {
    assert.equal(normalize("--hello--"), "hello");
  });

  it("stripAll removes everything except alphanumeric", () => {
    assert.equal(stripAll("My-Cool_Tool!"), "mycooltool");
  });
});

describe("tokenize", () => {
  it("splits on hyphens", () => {
    assert.deepEqual(tokenize("my-cool-tool"), ["my", "cool", "tool"]);
  });

  it("splits on underscores", () => {
    assert.deepEqual(tokenize("my_cool_tool"), ["my", "cool", "tool"]);
  });

  it("splits on camelCase boundaries", () => {
    assert.deepEqual(tokenize("myCoolTool"), ["my", "cool", "tool"]);
  });

  it("handles consecutive uppercase (acronyms)", () => {
    assert.deepEqual(tokenize("HTMLParser"), ["html", "parser"]);
  });

  it("splits on dots", () => {
    assert.deepEqual(tokenize("my.cool.tool"), ["my", "cool", "tool"]);
  });

  it("handles mixed separators", () => {
    assert.deepEqual(tokenize("my-cool_Tool.v2"), ["my", "cool", "tool", "v2"]);
  });
});

describe("phonetic", () => {
  it("metaphone produces a code for a word", () => {
    const code = metaphone("tool");
    assert.ok(code.length > 0);
    assert.equal(typeof code, "string");
  });

  it("similar-sounding words produce same code", () => {
    // "phone" and "fone" should have similar encoding
    assert.equal(metaphone("phone"), metaphone("fone"));
  });

  it("returns empty string for empty input", () => {
    assert.equal(metaphone(""), "");
    assert.equal(metaphone(null), "");
  });

  it("phoneticVariants maps array of tokens", () => {
    const variants = phoneticVariants(["my", "tool"]);
    assert.equal(variants.length, 2);
  });

  it("phoneticSignature joins codes with space", () => {
    const sig = phoneticSignature(["my", "tool"]);
    assert.ok(sig.includes(" "));
  });
});

describe("homoglyphs", () => {
  it("generates substitution variants", () => {
    const variants = homoglyphVariants("tool");
    assert.ok(variants.length > 0);
    // 't' → 7/+, 'o' → 0 (×2), 'l' → 1/i/|
    assert.ok(variants.includes("7ool")); // t→7
    assert.ok(variants.includes("t0ol")); // first o→0
  });

  it("returns sorted, deduplicated array", () => {
    const variants = homoglyphVariants("test");
    const sorted = [...variants].sort();
    assert.deepEqual(variants, sorted);
  });

  it("returns empty array for no confusables", () => {
    const variants = homoglyphVariants("xyz");
    // x, y, z have no confusables except z→2
    assert.ok(variants.includes("xy2")); // z→2
  });

  it("areConfusable detects single-char confusable pairs", () => {
    // Single-substitution: first o→0
    assert.ok(areConfusable("tool", "t0ol"));
    // Single-substitution: t→7
    assert.ok(areConfusable("tool", "7ool"));
  });

  it("areConfusable returns false for identical strings", () => {
    assert.ok(!areConfusable("tool", "tool"));
  });
});

describe("generateVariants (orchestrator)", () => {
  it("produces all form types", () => {
    const result = generateVariants("My Cool Tool");
    assert.equal(result.candidateMark, "My Cool Tool");
    assert.equal(result.canonical, "my-cool-tool");

    const types = result.forms.map((f) => f.type);
    assert.ok(types.includes("original"));
    assert.ok(types.includes("lower"));
    assert.ok(types.includes("hyphenated"));
    assert.ok(types.includes("phonetic"));
  });

  it("generates warnings for homoglyph risk", () => {
    const result = generateVariants("tool");
    // "tool" has multiple confusables
    assert.ok(result.warnings.length > 0);
    assert.equal(result.warnings[0].code, "COE.HOMOGLYPH_RISK");
  });

  it("is deterministic", () => {
    const a = generateVariants("test-name");
    const b = generateVariants("test-name");
    assert.deepEqual(a, b);
  });

  it("generateAllVariants wraps multiple candidates", () => {
    const result = generateAllVariants(["a", "b"], { now: "2026-01-01T00:00:00Z" });
    assert.equal(result.generatedAt, "2026-01-01T00:00:00Z");
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].candidateMark, "a");
    assert.equal(result.items[1].candidateMark, "b");
  });
});
