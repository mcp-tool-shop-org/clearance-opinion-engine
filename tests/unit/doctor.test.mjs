import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runDoctor } from "../../src/doctor.mjs";

describe("runDoctor", () => {
  it("returns array of results", async () => {
    const results = await runDoctor({
      fetchFn: async () => ({ status: 200 }),
      engineVersion: "0.6.0",
    });
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });

  it("each result has check, status, detail", async () => {
    const results = await runDoctor({
      fetchFn: async () => ({ status: 200 }),
      engineVersion: "0.6.0",
    });
    for (const r of results) {
      assert.ok(typeof r.check === "string", `check must be a string, got ${typeof r.check}`);
      assert.ok(["pass", "warn", "fail"].includes(r.status), `status must be pass/warn/fail, got ${r.status}`);
      assert.ok(typeof r.detail === "string", `detail must be a string, got ${typeof r.detail}`);
    }
  });

  it("Node version check passes (we are on Node 20+)", async () => {
    const results = await runDoctor({
      fetchFn: async () => ({ status: 200 }),
      engineVersion: "0.6.0",
    });
    const nodeCheck = results.find((r) => r.check === "Node.js version");
    assert.ok(nodeCheck);
    assert.equal(nodeCheck.status, "pass");
  });

  it("GITHUB_TOKEN check returns pass or warn based on env", async () => {
    const results = await runDoctor({
      fetchFn: async () => ({ status: 200 }),
      engineVersion: "0.6.0",
    });
    const tokenCheck = results.find((r) => r.check === "GITHUB_TOKEN");
    assert.ok(tokenCheck);
    if (process.env.GITHUB_TOKEN) {
      assert.equal(tokenCheck.status, "pass");
    } else {
      assert.equal(tokenCheck.status, "warn");
    }
  });

  it("network check uses provided fetchFn", async () => {
    const results = await runDoctor({
      fetchFn: async () => ({ status: 200 }),
      engineVersion: "0.6.0",
    });
    const netCheck = results.find((r) => r.check === "Network reachability");
    assert.ok(netCheck);
    assert.equal(netCheck.status, "pass");
    assert.ok(netCheck.detail.includes("200"));
  });

  it("engine version check shows provided version", async () => {
    const results = await runDoctor({
      fetchFn: async () => ({ status: 200 }),
      engineVersion: "0.6.0-test",
    });
    const versionCheck = results.find((r) => r.check === "Engine version");
    assert.ok(versionCheck);
    assert.equal(versionCheck.detail, "0.6.0-test");
  });
});
