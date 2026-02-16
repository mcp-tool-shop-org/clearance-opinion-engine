/**
 * Concurrency primitives for batch mode.
 *
 * createPool(n)        — Promise-based semaphore pool
 * createRateLimiter(r) — Token-bucket rate limiter
 */

/**
 * Create a concurrency pool that limits parallel async tasks.
 *
 * @param {number} concurrency - Max simultaneous tasks
 * @returns {{ run: (fn: () => Promise<T>) => Promise<T>, drain: () => Promise<void> }}
 */
export function createPool(concurrency) {
  if (concurrency < 1) concurrency = 1;

  let active = 0;
  const queue = [];
  const settled = [];

  function tryNext() {
    while (active < concurrency && queue.length > 0) {
      const { fn, resolve: res, reject: rej } = queue.shift();
      active++;
      fn()
        .then((val) => {
          active--;
          res(val);
          tryNext();
        })
        .catch((err) => {
          active--;
          rej(err);
          tryNext();
        });
    }
  }

  /**
   * Enqueue an async function to run when a slot is available.
   * Returns a promise that resolves with the function's result.
   */
  function run(fn) {
    const p = new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
    });
    settled.push(p.catch(() => {})); // track for drain, swallow errors
    tryNext();
    return p;
  }

  /**
   * Wait for all enqueued tasks to settle (resolve or reject).
   */
  async function drain() {
    await Promise.allSettled(settled);
  }

  return { run, drain };
}

/**
 * Create a token-bucket rate limiter.
 *
 * @param {number} maxPerSecond - Maximum calls per second
 * @param {object} [opts]
 * @param {Function} [opts.sleepFn] - Injectable sleep (for testing)
 * @param {Function} [opts.nowFn] - Injectable clock (for testing)
 * @returns {{ acquire: () => Promise<void> }}
 */
export function createRateLimiter(maxPerSecond, opts = {}) {
  const sleepFn = opts.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const nowFn = opts.nowFn || (() => Date.now());

  const timestamps = [];

  async function acquire() {
    const now = nowFn();
    const windowStart = now - 1000;

    // Remove timestamps outside the 1-second window
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= maxPerSecond) {
      // Wait until the oldest timestamp exits the window
      const waitMs = timestamps[0] - windowStart + 1;
      await sleepFn(waitMs);
      // Recurse to re-check after waiting
      return acquire();
    }

    timestamps.push(nowFn());
  }

  return { acquire };
}
