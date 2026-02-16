import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeError } from "../../src/lib/errors.mjs";

describe("errors", () => {
  it("makeError creates a structured error with code and message", () => {
    const err = makeError("COE.INIT.NO_ARGS", "No candidate name provided");
    assert.equal(err.code, "COE.INIT.NO_ARGS");
    assert.equal(err.message, "No candidate name provided");
    assert.equal(err.context, undefined);
  });

  it("makeError includes context when provided", () => {
    const err = makeError("COE.ADAPTER.GITHUB_FAIL", "GitHub error", {
      statusCode: 500,
      url: "https://api.github.com/orgs/test",
    });
    assert.equal(err.code, "COE.ADAPTER.GITHUB_FAIL");
    assert.equal(err.context.statusCode, 500);
    assert.equal(err.context.url, "https://api.github.com/orgs/test");
  });

  it("error codes follow COE.<CATEGORY>.<TYPE> pattern", () => {
    const codes = [
      "COE.INIT.NO_ARGS",
      "COE.INIT.BAD_CHANNEL",
      "COE.ADAPTER.GITHUB_FAIL",
      "COE.ADAPTER.NPM_FAIL",
      "COE.ADAPTER.PYPI_FAIL",
      "COE.RENDER.WRITE_FAIL",
      "COE.LOCK.MISMATCH",
    ];
    for (const code of codes) {
      assert.match(code, /^COE\.[A-Z]+\.[A-Z_]+$/);
    }
  });

  it("makeError without context omits context key", () => {
    const err = makeError("COE.INIT.NO_ARGS", "test");
    assert.ok(!("context" in err));
  });
});
