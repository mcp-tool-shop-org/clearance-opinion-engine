import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkFreshness, findStaleAdapters } from "../../src/lib/freshness.mjs";

const NOW = "2026-02-15T12:00:00.000Z";

function makeRun(checks) {
  return { checks };
}

describe("checkFreshness", () => {
  it("returns not stale when all checks are fresh", () => {
    const run = makeRun([
      { id: "chk.npm.foo", observedAt: "2026-02-15T11:00:00.000Z" },
      { id: "chk.pypi.foo", observedAt: "2026-02-15T10:00:00.000Z" },
    ]);
    const result = checkFreshness(run, { maxAgeHours: 24, now: NOW });
    assert.equal(result.isStale, false);
    assert.equal(result.staleChecks.length, 0);
    assert.equal(result.banner, null);
  });

  it("returns stale when a check exceeds maxAgeHours", () => {
    const run = makeRun([
      { id: "chk.npm.foo", observedAt: "2026-02-15T11:00:00.000Z" },
      { id: "chk.pypi.foo", observedAt: "2026-02-13T12:00:00.000Z" }, // 2 days old
    ]);
    const result = checkFreshness(run, { maxAgeHours: 24, now: NOW });
    assert.equal(result.isStale, true);
    assert.deepEqual(result.staleChecks, ["chk.pypi.foo"]);
    assert.ok(result.banner.includes("24 hours"));
  });

  it("identifies the oldest observed timestamp", () => {
    const run = makeRun([
      { id: "chk.npm.foo", observedAt: "2026-02-15T11:00:00.000Z" },
      { id: "chk.pypi.foo", observedAt: "2026-02-13T06:00:00.000Z" },
      { id: "chk.github.foo", observedAt: "2026-02-14T06:00:00.000Z" },
    ]);
    const result = checkFreshness(run, { maxAgeHours: 24, now: NOW });
    assert.equal(result.oldestObservedAt, "2026-02-13T06:00:00.000Z");
  });

  it("returns not stale for empty checks array", () => {
    const result = checkFreshness(makeRun([]), { maxAgeHours: 24, now: NOW });
    assert.equal(result.isStale, false);
    assert.equal(result.oldestObservedAt, null);
  });

  it("banner includes oldest timestamp", () => {
    const staleTime = "2026-02-13T00:00:00.000Z";
    const run = makeRun([{ id: "chk.npm.foo", observedAt: staleTime }]);
    const result = checkFreshness(run, { maxAgeHours: 24, now: NOW });
    assert.ok(result.banner.includes(staleTime));
  });

  it("skips checks without observedAt", () => {
    const run = makeRun([
      { id: "chk.npm.foo" }, // no observedAt
      { id: "chk.pypi.foo", observedAt: "2026-02-15T11:00:00.000Z" },
    ]);
    const result = checkFreshness(run, { maxAgeHours: 24, now: NOW });
    assert.equal(result.isStale, false);
  });

  it("uses injectable now parameter", () => {
    const run = makeRun([
      { id: "chk.npm.foo", observedAt: "2026-02-15T11:00:00.000Z" },
    ]);
    // With a now far in the future, the check is stale
    const result = checkFreshness(run, { maxAgeHours: 24, now: "2026-02-20T12:00:00.000Z" });
    assert.equal(result.isStale, true);
  });
});

describe("findStaleAdapters", () => {
  it("returns stale adapter info", () => {
    const run = makeRun([
      { id: "chk.npm.foo", namespace: "npm", query: { name: "foo" }, observedAt: "2026-02-13T00:00:00.000Z" },
      { id: "chk.pypi.foo", namespace: "pypi", query: { name: "foo" }, observedAt: "2026-02-15T11:00:00.000Z" },
    ]);
    const stale = findStaleAdapters(run, { maxAgeHours: 24, now: NOW });
    assert.equal(stale.length, 1);
    assert.equal(stale[0].adapter, "npm");
    assert.equal(stale[0].checkId, "chk.npm.foo");
  });

  it("returns empty for all-fresh run", () => {
    const run = makeRun([
      { id: "chk.npm.foo", namespace: "npm", query: { name: "foo" }, observedAt: "2026-02-15T11:00:00.000Z" },
    ]);
    const stale = findStaleAdapters(run, { maxAgeHours: 24, now: NOW });
    assert.equal(stale.length, 0);
  });
});
