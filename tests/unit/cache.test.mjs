import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { createCache } from "../../src/lib/cache.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname, "..", ".tmp-cache-tests");

describe("createCache", () => {
  before(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  after(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("auto-creates cache directory if it does not exist", () => {
    const dir = join(tmpDir, "auto-create");
    assert.ok(!existsSync(dir));
    createCache(dir);
    assert.ok(existsSync(dir));
  });

  it("get returns null for missing entry", () => {
    const cache = createCache(join(tmpDir, "miss"));
    const result = cache.get("github", { name: "foo" }, "0.3.0");
    assert.equal(result, null);
  });

  it("set + get round-trips correctly", () => {
    const dir = join(tmpDir, "roundtrip");
    const cache = createCache(dir, {
      maxAgeHours: 24,
      now: () => "2026-02-15T12:00:00.000Z",
    });

    const data = { check: { status: "available" }, evidence: { id: "ev.1" } };
    cache.set("npm", { name: "my-tool" }, "0.3.0", data);

    const result = cache.get("npm", { name: "my-tool" }, "0.3.0");
    assert.ok(result !== null);
    assert.deepEqual(result.data, data);
  });

  it("expired entries return null", () => {
    const dir = join(tmpDir, "expired");
    let clock = "2026-02-15T12:00:00.000Z";
    const cache = createCache(dir, {
      maxAgeHours: 1,
      now: () => clock,
    });

    cache.set("github", { name: "test" }, "0.3.0", { status: "available" });

    // Advance clock past TTL
    clock = "2026-02-15T14:00:00.000Z"; // 2 hours later

    const result = cache.get("github", { name: "test" }, "0.3.0");
    assert.equal(result, null);
  });

  it("cacheKey is deterministic (same inputs = same key)", () => {
    const dir = join(tmpDir, "key-determ");
    const cache = createCache(dir);

    const key1 = cache.cacheKey("npm", { name: "foo" }, "0.3.0");
    const key2 = cache.cacheKey("npm", { name: "foo" }, "0.3.0");
    assert.equal(key1, key2);
    assert.match(key1, /^[a-f0-9]{64}$/);
  });

  it("cacheKey varies with adapter, query, and version", () => {
    const dir = join(tmpDir, "key-vary");
    const cache = createCache(dir);

    const k1 = cache.cacheKey("npm", { name: "foo" }, "0.3.0");
    const k2 = cache.cacheKey("github", { name: "foo" }, "0.3.0");
    const k3 = cache.cacheKey("npm", { name: "bar" }, "0.3.0");
    const k4 = cache.cacheKey("npm", { name: "foo" }, "0.4.0");

    assert.notEqual(k1, k2);
    assert.notEqual(k1, k3);
    assert.notEqual(k1, k4);
  });

  it("corrupted JSON file returns null (does not throw)", () => {
    const dir = join(tmpDir, "corrupt");
    const cache = createCache(dir);

    // Write a corrupted cache file
    const key = cache.cacheKey("npm", { name: "bad" }, "0.3.0");
    writeFileSync(join(dir, `${key}.json`), "NOT VALID JSON{{{", "utf8");

    const result = cache.get("npm", { name: "bad" }, "0.3.0");
    assert.equal(result, null);
  });

  it("clear removes all entries", () => {
    const dir = join(tmpDir, "clear-all");
    const cache = createCache(dir, {
      now: () => "2026-02-15T12:00:00.000Z",
    });

    cache.set("a", { n: 1 }, "v", { d: 1 });
    cache.set("b", { n: 2 }, "v", { d: 2 });

    assert.equal(cache.stats().entries, 2);

    const { cleared } = cache.clear();
    assert.equal(cleared, 2);
    assert.equal(cache.stats().entries, 0);
  });

  it("clear({ expiredOnly: true }) only removes expired entries", () => {
    const dir = join(tmpDir, "clear-expired");
    let clock = "2026-02-15T12:00:00.000Z";
    const cache = createCache(dir, {
      maxAgeHours: 1,
      now: () => clock,
    });

    cache.set("old", { n: 1 }, "v", { d: 1 });

    // Advance clock past TTL
    clock = "2026-02-15T14:00:00.000Z";

    // Add a fresh entry
    cache.set("new", { n: 2 }, "v", { d: 2 });

    assert.equal(cache.stats().entries, 2);

    const { cleared } = cache.clear({ expiredOnly: true });
    assert.equal(cleared, 1); // only "old" removed
    assert.equal(cache.stats().entries, 1);

    // Fresh entry still accessible
    const result = cache.get("new", { n: 2 }, "v");
    assert.ok(result !== null);
  });

  it("stats returns correct entry count and total bytes", () => {
    const dir = join(tmpDir, "stats");
    const cache = createCache(dir, {
      now: () => "2026-02-15T12:00:00.000Z",
    });

    cache.set("x", { n: 1 }, "v", { data: "hello" });
    cache.set("y", { n: 2 }, "v", { data: "world" });

    const s = cache.stats();
    assert.equal(s.entries, 2);
    assert.ok(s.totalBytes > 0);
  });

  it("different maxAgeHours produces different expiration", () => {
    const dir = join(tmpDir, "ttl");
    let clock = "2026-02-15T12:00:00.000Z";
    const cache = createCache(dir, {
      maxAgeHours: 2,
      now: () => clock,
    });

    cache.set("x", { n: 1 }, "v", { d: 1 });

    // 1 hour later — should still be valid
    clock = "2026-02-15T13:00:00.000Z";
    assert.ok(cache.get("x", { n: 1 }, "v") !== null);

    // 3 hours later — should be expired
    clock = "2026-02-15T15:00:00.000Z";
    assert.equal(cache.get("x", { n: 1 }, "v"), null);
  });
});
