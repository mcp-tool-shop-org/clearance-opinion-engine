import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveCacheDir } from "../../src/lib/config.mjs";

describe("resolveCacheDir", () => {
  const originalEnv = process.env.COE_CACHE_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.COE_CACHE_DIR;
    } else {
      process.env.COE_CACHE_DIR = originalEnv;
    }
  });

  it("returns flag value when provided", () => {
    process.env.COE_CACHE_DIR = "/env/cache";
    assert.equal(resolveCacheDir("/flag/cache"), "/flag/cache");
  });

  it("falls back to COE_CACHE_DIR env var", () => {
    process.env.COE_CACHE_DIR = "/env/cache";
    assert.equal(resolveCacheDir(null), "/env/cache");
  });

  it("returns null when neither set", () => {
    delete process.env.COE_CACHE_DIR;
    assert.equal(resolveCacheDir(null), null);
  });
});
