import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPool, createRateLimiter } from "../../src/lib/concurrency.mjs";

describe("createPool", () => {
  it("runs tasks and returns results", async () => {
    const pool = createPool(2);
    const r1 = pool.run(async () => "a");
    const r2 = pool.run(async () => "b");
    await pool.drain();
    assert.equal(await r1, "a");
    assert.equal(await r2, "b");
  });

  it("respects concurrency limit", async () => {
    const pool = createPool(2);
    let maxActive = 0;
    let active = 0;

    const task = () =>
      pool.run(async () => {
        active++;
        if (active > maxActive) maxActive = active;
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return true;
      });

    const tasks = [task(), task(), task(), task()];
    await pool.drain();
    await Promise.all(tasks);

    assert.ok(maxActive <= 2, `maxActive was ${maxActive}, expected <= 2`);
  });

  it("handles rejected tasks without deadlock", async () => {
    const pool = createPool(2);
    const ok = pool.run(async () => "ok");
    const bad = pool.run(async () => {
      throw new Error("boom");
    });
    const after = pool.run(async () => "after");

    await pool.drain();

    assert.equal(await ok, "ok");
    assert.equal(await after, "after");
    await assert.rejects(async () => await bad, { message: "boom" });
  });

  it("drain resolves when all tasks complete", async () => {
    const pool = createPool(1);
    const results = [];

    pool.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.push(1);
    });
    pool.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.push(2);
    });

    await pool.drain();
    assert.deepEqual(results, [1, 2]);
  });

  it("handles concurrency of 1 (serial execution)", async () => {
    const pool = createPool(1);
    const order = [];

    pool.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("a");
    });
    pool.run(async () => {
      order.push("b");
    });

    await pool.drain();
    assert.deepEqual(order, ["a", "b"]);
  });

  it("clamps concurrency below 1 to 1", async () => {
    const pool = createPool(0);
    const r = pool.run(async () => "ok");
    await pool.drain();
    assert.equal(await r, "ok");
  });

  it("handles empty drain", async () => {
    const pool = createPool(4);
    await pool.drain(); // Should not hang
  });

  it("runs many tasks with limited concurrency", async () => {
    const pool = createPool(3);
    const results = [];

    for (let i = 0; i < 10; i++) {
      pool.run(async () => {
        results.push(i);
        return i;
      });
    }

    await pool.drain();
    assert.equal(results.length, 10);
  });
});

describe("createRateLimiter", () => {
  it("allows calls within rate limit", async () => {
    let time = 0;
    const limiter = createRateLimiter(5, {
      nowFn: () => time,
      sleepFn: async (ms) => { time += ms; },
    });

    // 5 calls should not require waiting
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    // time should not have advanced much (no sleeping needed for first 5)
    assert.ok(time < 1000, `Expected no sleeping, but time advanced to ${time}`);
  });

  it("delays calls that exceed rate limit", async () => {
    let time = 0;
    const limiter = createRateLimiter(2, {
      nowFn: () => time,
      sleepFn: async (ms) => { time += ms; },
    });

    await limiter.acquire(); // time=0
    await limiter.acquire(); // time=0, at limit
    await limiter.acquire(); // should wait

    assert.ok(time > 0, `Expected time to advance, got ${time}`);
  });

  it("resets after window passes", async () => {
    let time = 0;
    const limiter = createRateLimiter(2, {
      nowFn: () => time,
      sleepFn: async (ms) => { time += ms; },
    });

    await limiter.acquire();
    await limiter.acquire();

    // Advance past the 1-second window
    time += 1001;

    const timeBefore = time;
    await limiter.acquire();
    // Should not need to wait since we're in a new window
    assert.equal(time, timeBefore);
  });

  it("uses injectable sleep function", async () => {
    let sleepCalls = 0;
    let time = 0;
    const limiter = createRateLimiter(1, {
      nowFn: () => time,
      sleepFn: async (ms) => {
        sleepCalls++;
        time += ms;
      },
    });

    await limiter.acquire();
    await limiter.acquire(); // should trigger sleep

    assert.ok(sleepCalls > 0, "Expected sleep to be called");
  });
});
