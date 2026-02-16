import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withRetry, retryFetch, defaultSleep } from "../../src/lib/retry.mjs";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry(async () => 42);
    assert.equal(result, 42);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    let attempt = 0;
    const result = await withRetry(
      async () => {
        attempt++;
        if (attempt < 2) throw new Error("transient");
        return "ok";
      },
      { sleepFn: async () => {} }
    );
    assert.equal(result, "ok");
    assert.equal(attempt, 2);
  });

  it("retries up to maxRetries times then throws", async () => {
    let attempt = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            attempt++;
            throw new Error("always fails");
          },
          { maxRetries: 3, sleepFn: async () => {} }
        ),
      { message: "always fails" }
    );
    assert.equal(attempt, 4); // 1 initial + 3 retries
  });

  it("respects shouldRetry predicate — skips retry when false", async () => {
    let attempt = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            attempt++;
            throw new Error("fatal");
          },
          {
            maxRetries: 3,
            sleepFn: async () => {},
            shouldRetry: () => false,
          }
        ),
      { message: "fatal" }
    );
    assert.equal(attempt, 1); // No retries
  });

  it("uses injectable sleepFn (no real delay in tests)", async () => {
    const sleepCalls = [];
    let attempt = 0;
    const result = await withRetry(
      async () => {
        attempt++;
        if (attempt < 3) throw new Error("transient");
        return "done";
      },
      {
        maxRetries: 2,
        sleepFn: async (ms) => {
          sleepCalls.push(ms);
        },
      }
    );
    assert.equal(result, "done");
    assert.equal(sleepCalls.length, 2);
  });

  it("exponential backoff — sleepFn receives increasing delays", async () => {
    const delays = [];
    let attempt = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            attempt++;
            throw new Error("fail");
          },
          {
            maxRetries: 3,
            baseDelayMs: 100,
            maxDelayMs: 1000,
            sleepFn: async (ms) => {
              delays.push(ms);
            },
          }
        )
    );
    // Delays: 100, 200, 400
    assert.deepEqual(delays, [100, 200, 400]);
  });

  it("respects maxDelayMs cap", async () => {
    const delays = [];
    let attempt = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            attempt++;
            throw new Error("fail");
          },
          {
            maxRetries: 4,
            baseDelayMs: 1000,
            maxDelayMs: 3000,
            sleepFn: async (ms) => {
              delays.push(ms);
            },
          }
        )
    );
    // Delays: 1000, 2000, 3000 (capped), 3000 (capped)
    assert.deepEqual(delays, [1000, 2000, 3000, 3000]);
  });
});

describe("retryFetch", () => {
  it("wraps fetch with retry behavior", async () => {
    let attempt = 0;
    const mockFetch = async () => {
      attempt++;
      if (attempt < 2) throw new Error("network error");
      return { status: 200, text: async () => "ok" };
    };

    const wrappedFetch = retryFetch(mockFetch, { sleepFn: async () => {} });
    const res = await wrappedFetch("https://example.com", {});
    assert.equal(res.status, 200);
    assert.equal(attempt, 2);
  });

  it("passes through URL and init to underlying fetch", async () => {
    let capturedUrl = null;
    let capturedInit = null;
    const mockFetch = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return { status: 200, text: async () => "ok" };
    };

    const wrappedFetch = retryFetch(mockFetch, { sleepFn: async () => {} });
    await wrappedFetch("https://example.com/test", { method: "GET" });
    assert.equal(capturedUrl, "https://example.com/test");
    assert.deepEqual(capturedInit, { method: "GET" });
  });
});

describe("defaultSleep", () => {
  it("is a function that returns a promise", () => {
    assert.equal(typeof defaultSleep, "function");
    const result = defaultSleep(0);
    assert.ok(result instanceof Promise);
  });
});
