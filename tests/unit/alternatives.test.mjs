import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateAlternatives, recheckAlternatives } from "../../src/scoring/alternatives.mjs";

describe("generateAlternatives", () => {
  it("returns exactly 5 items", () => {
    const alts = generateAlternatives("my-tool");
    assert.equal(alts.length, 5);
  });

  it("each item has name, strategy, availability fields", () => {
    const alts = generateAlternatives("my-tool");
    for (const alt of alts) {
      assert.ok(typeof alt.name === "string", "name must be a string");
      assert.ok(typeof alt.strategy === "string", "strategy must be a string");
      assert.ok(typeof alt.availability === "object", "availability must be an object");
      assert.ok(typeof alt.availability.checked === "boolean", "availability.checked must be a boolean");
      assert.ok(typeof alt.availability.summary === "string", "availability.summary must be a string");
    }
  });

  it("availability.checked is false and summary is 'Not checked'", () => {
    const alts = generateAlternatives("my-tool");
    for (const alt of alts) {
      assert.equal(alt.availability.checked, false);
      assert.equal(alt.availability.summary, "Not checked");
    }
  });

  it("strategies are prefix, suffix, separator, abbreviation, compound (one each)", () => {
    const alts = generateAlternatives("my-tool");
    const strategies = alts.map((a) => a.strategy);
    assert.deepEqual(strategies, ["prefix", "suffix", "separator", "abbreviation", "compound"]);
  });

  it("prefix strategy uses 'go-' prefix", () => {
    const alts = generateAlternatives("my-tool");
    const prefix = alts.find((a) => a.strategy === "prefix");
    assert.ok(prefix.name.startsWith("go-"), `Expected prefix to start with 'go-', got '${prefix.name}'`);
  });

  it("suffix strategy uses '-js' suffix", () => {
    const alts = generateAlternatives("my-tool");
    const suffix = alts.find((a) => a.strategy === "suffix");
    assert.ok(suffix.name.endsWith("-js"), `Expected suffix to end with '-js', got '${suffix.name}'`);
  });

  it("separator strategy uses '-app' suffix", () => {
    const alts = generateAlternatives("my-tool");
    const sep = alts.find((a) => a.strategy === "separator");
    assert.ok(sep.name.endsWith("-app"), `Expected separator to end with '-app', got '${sep.name}'`);
  });

  it("compound strategy uses '-hub' suffix", () => {
    const alts = generateAlternatives("my-tool");
    const comp = alts.find((a) => a.strategy === "compound");
    assert.ok(comp.name.endsWith("-hub"), `Expected compound to end with '-hub', got '${comp.name}'`);
  });

  it("abbreviation for multi-word name produces first-letter abbreviation", () => {
    const alts = generateAlternatives("my-tool");
    const abbr = alts.find((a) => a.strategy === "abbreviation");
    assert.equal(abbr.name, "mt", `Expected abbreviation 'mt' for 'my-tool', got '${abbr.name}'`);
  });

  it("abbreviation for long single word produces first3+last3", () => {
    const alts = generateAlternatives("something");
    const abbr = alts.find((a) => a.strategy === "abbreviation");
    assert.equal(abbr.name, "soming", `Expected abbreviation 'soming' for 'something', got '${abbr.name}'`);
  });

  it("abbreviation for short single word (<=6 chars) produces '{name}-x'", () => {
    const alts = generateAlternatives("foo");
    const abbr = alts.find((a) => a.strategy === "abbreviation");
    assert.equal(abbr.name, "foo-x", `Expected abbreviation 'foo-x' for 'foo', got '${abbr.name}'`);
  });
});

describe("recheckAlternatives", () => {
  it("updates availability.checked to true", async () => {
    const alts = generateAlternatives("my-tool");
    const checkFn = async () => ({
      checks: [{ status: "available" }],
    });

    const results = await recheckAlternatives(alts, checkFn);
    assert.equal(results.length, 5);
    for (const r of results) {
      assert.equal(r.availability.checked, true);
    }
  });

  it("handles check failures gracefully", async () => {
    const alts = generateAlternatives("my-tool");
    const checkFn = async () => {
      throw new Error("Network error");
    };

    const results = await recheckAlternatives(alts, checkFn);
    assert.equal(results.length, 5);
    for (const r of results) {
      assert.equal(r.availability.checked, false);
      assert.equal(r.availability.summary, "Check failed");
    }
  });
});
