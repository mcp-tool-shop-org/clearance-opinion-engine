import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAdaptiveBackoff } from "../../src/lib/adaptive-backoff.mjs";

/**
 * Build a mock fetch that always returns the given status and headers.
 * @param {number}                status
 * @param {Record<string,string>} [headers]
 * @returns {(url: string) => Promise<{ ok: boolean, status: number, headers: { get: (h: string) => string|null } }>}
 */
function mockFetch(status, headers = {}) {
  return async (url) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => headers[h] || headers[h.toLowerCase()] || null },
  });
}

/** No-op sleep — records calls but never waits. */
function fakeSleep() {
  const calls = [];
  const fn = async (ms) => { calls.push(ms); };
  fn.calls = calls;
  return fn;
}

/** Fixed clock returning a settable timestamp. */
function fakeClock(start = 1_000_000) {
  let now = start;
  const fn = () => now;
  fn.set = (v) => { now = v; };
  fn.advance = (ms) => { now += ms; };
  return fn;
}

// ---------------------------------------------------------------------------

describe("createAdaptiveBackoff", () => {
  it("returns response unchanged on success", async () => {
    const fetch = createAdaptiveBackoff(mockFetch(200), {
      sleepFn: fakeSleep(),
    });

    const res = await fetch("https://api.example.com/data");
    assert.equal(res.status, 200);
    assert.equal(res.ok, true);
  });

  it("tracks per-host state independently", async () => {
    let callCount = 0;
    const underlying = async (url) => {
      callCount++;
      const host = new URL(url).hostname;
      // Host A always 429, Host B always 200
      const status = host === "a.example.com" ? 429 : 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => null },
      };
    };

    const fetch = createAdaptiveBackoff(underlying, {
      sleepFn: fakeSleep(),
    });

    await fetch("https://a.example.com/x");
    await fetch("https://b.example.com/y");

    const stats = fetch.getStats();
    assert.equal(stats.hosts["a.example.com"].consecutiveFailures, 1);
    assert.equal(stats.hosts["a.example.com"].backoffMs, 1000);
    assert.equal(stats.hosts["b.example.com"].consecutiveFailures, 0);
    assert.equal(stats.hosts["b.example.com"].backoffMs, 0);
  });

  it("doubles backoff on 429", async () => {
    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(mockFetch(429), { sleepFn: sleep });

    await fetch("https://api.example.com/a");
    const stats1 = fetch.getStats();
    assert.equal(stats1.hosts["api.example.com"].backoffMs, 1000);

    await fetch("https://api.example.com/b");
    const stats2 = fetch.getStats();
    assert.equal(stats2.hosts["api.example.com"].backoffMs, 2000);

    await fetch("https://api.example.com/c");
    const stats3 = fetch.getStats();
    assert.equal(stats3.hosts["api.example.com"].backoffMs, 4000);
  });

  it("increases backoff by 50% on 5xx", async () => {
    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(mockFetch(503), { sleepFn: sleep });

    await fetch("https://api.example.com/a");
    const s1 = fetch.getStats();
    assert.equal(s1.hosts["api.example.com"].backoffMs, 1000);

    await fetch("https://api.example.com/b");
    const s2 = fetch.getStats();
    assert.equal(s2.hosts["api.example.com"].backoffMs, 1500);

    await fetch("https://api.example.com/c");
    const s3 = fetch.getStats();
    assert.equal(s3.hosts["api.example.com"].backoffMs, 2250);
  });

  it("halves backoff on success after failure", async () => {
    let status = 429;
    const underlying = async (url) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
    });

    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(underlying, { sleepFn: sleep });

    // Two 429s → backoff 1000 then 2000
    await fetch("https://api.example.com/a");
    await fetch("https://api.example.com/b");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 2000);

    // Switch to success
    status = 200;
    await fetch("https://api.example.com/c");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 1000);

    await fetch("https://api.example.com/d");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 500);

    await fetch("https://api.example.com/e");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 250);
  });

  it("respects maxBackoffMs cap", async () => {
    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(mockFetch(429), {
      sleepFn: sleep,
      maxBackoffMs: 5000,
    });

    // 1000 → 2000 → 4000 → 5000 (capped) → 5000 (capped)
    await fetch("https://api.example.com/a");
    await fetch("https://api.example.com/b");
    await fetch("https://api.example.com/c");
    await fetch("https://api.example.com/d");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 5000);

    await fetch("https://api.example.com/e");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 5000);
  });

  it("sleeps before request when backoffMs > 0", async () => {
    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(mockFetch(429), { sleepFn: sleep });

    // First request — no sleep (backoff starts at 0)
    await fetch("https://api.example.com/a");
    assert.deepEqual(sleep.calls, []);

    // Second request — should sleep for 1000 ms (set by first 429)
    await fetch("https://api.example.com/b");
    assert.deepEqual(sleep.calls, [1000]);

    // Third request — should sleep for 2000 ms (doubled)
    await fetch("https://api.example.com/c");
    assert.deepEqual(sleep.calls, [1000, 2000]);
  });

  it("respects Retry-After header (seconds)", async () => {
    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(
      mockFetch(429, { "Retry-After": "10" }),
      { sleepFn: sleep },
    );

    await fetch("https://api.example.com/a");
    const stats = fetch.getStats();
    // Retry-After 10s = 10000ms > doubled-backoff 1000ms → use 10000
    assert.equal(stats.hosts["api.example.com"].backoffMs, 10000);
  });

  it("respects Retry-After header (HTTP date)", async () => {
    const clock = fakeClock(1_000_000);
    // Date 5 seconds in the future
    const futureDate = new Date(1_000_000 + 5000).toUTCString();

    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(
      mockFetch(429, { "Retry-After": futureDate }),
      { sleepFn: sleep, clockFn: clock },
    );

    await fetch("https://api.example.com/a");
    const stats = fetch.getStats();
    // Retry-After 5000ms > doubled 1000ms → use 5000
    assert.equal(stats.hosts["api.example.com"].backoffMs, 5000);
  });

  it("uses max(Retry-After, backoffMs)", async () => {
    // Retry-After of 1s (1000ms) — shorter than the doubling at step 3
    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(
      mockFetch(429, { "Retry-After": "1" }),
      { sleepFn: sleep },
    );

    // Step 1: backoff doubles to max(0*2, 1000) = 1000, then max(retryAfter=1000, 1000) = 1000
    await fetch("https://api.example.com/a");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 1000);

    // Step 2: backoff doubles to max(1000*2, 1000) = 2000, then max(retryAfter=1000, 2000) = 2000
    await fetch("https://api.example.com/b");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 2000);

    // Step 3: backoff doubles to max(2000*2, 1000) = 4000, then max(retryAfter=1000, 4000) = 4000
    await fetch("https://api.example.com/c");
    assert.equal(fetch.getStats().hosts["api.example.com"].backoffMs, 4000);
  });

  it("getStats() returns host state", async () => {
    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(mockFetch(429), { sleepFn: sleep });

    // Initially empty
    assert.deepEqual(fetch.getStats(), { hosts: {} });

    await fetch("https://alpha.io/x");
    await fetch("https://beta.io/y");

    const stats = fetch.getStats();
    assert.ok("alpha.io" in stats.hosts);
    assert.ok("beta.io" in stats.hosts);
    assert.equal(stats.hosts["alpha.io"].consecutiveFailures, 1);
    assert.equal(stats.hosts["alpha.io"].backoffMs, 1000);
    assert.equal(stats.hosts["beta.io"].consecutiveFailures, 1);
    assert.equal(stats.hosts["beta.io"].backoffMs, 1000);
  });

  it("resets consecutiveFailures on success", async () => {
    let status = 500;
    const underlying = async (url) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
    });

    const sleep = fakeSleep();
    const fetch = createAdaptiveBackoff(underlying, { sleepFn: sleep });

    await fetch("https://api.example.com/a");
    await fetch("https://api.example.com/b");
    await fetch("https://api.example.com/c");
    assert.equal(
      fetch.getStats().hosts["api.example.com"].consecutiveFailures,
      3,
    );

    // Recover
    status = 200;
    await fetch("https://api.example.com/d");
    assert.equal(
      fetch.getStats().hosts["api.example.com"].consecutiveFailures,
      0,
    );
  });
});
