import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, escapeAttr } from "../../src/renderers/html-escape.mjs";

describe("escapeHtml", () => {
  it("escapes & < > \" ' ` / characters", () => {
    assert.equal(escapeHtml("&"), "&amp;");
    assert.equal(escapeHtml("<"), "&lt;");
    assert.equal(escapeHtml(">"), "&gt;");
    assert.equal(escapeHtml('"'), "&quot;");
    assert.equal(escapeHtml("'"), "&#x27;");
    assert.equal(escapeHtml("`"), "&#x60;");
    assert.equal(escapeHtml("/"), "&#x2F;");
  });

  it("returns empty string for empty input", () => {
    assert.equal(escapeHtml(""), "");
  });

  it("returns empty string for non-string input", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
    assert.equal(escapeHtml(42), "");
  });

  it("passes through safe alphanumeric strings unchanged", () => {
    assert.equal(escapeHtml("hello world 123"), "hello world 123");
    assert.equal(escapeHtml("my-cool-tool"), "my-cool-tool");
  });

  it("handles XSS attempt: <script>alert('xss')</script>", () => {
    const input = "<script>alert('xss')</script>";
    const expected = "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;";
    assert.equal(escapeHtml(input), expected);
  });

  it("escapes multiple special characters in one string", () => {
    assert.equal(escapeHtml("a & b < c"), "a &amp; b &lt; c");
  });
});

describe("escapeAttr", () => {
  it("includes all HTML escaping", () => {
    assert.equal(escapeAttr("<"), "&lt;");
    assert.equal(escapeAttr("&"), "&amp;");
    assert.equal(escapeAttr('"'), "&quot;");
  });

  it("additionally escapes = character", () => {
    assert.ok(escapeAttr("a=b").includes("&#x3D;"));
  });

  it("removes control characters", () => {
    assert.equal(escapeAttr("hello\x00world"), "helloworld");
    assert.equal(escapeAttr("test\x01\x02"), "test");
  });

  it("returns empty string for non-string input", () => {
    assert.equal(escapeAttr(null), "");
  });
});
