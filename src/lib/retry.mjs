/**
 * Retry logic with exponential backoff for clearance-opinion-engine.
 *
 * Provides a generic retry wrapper and a fetch-specific wrapper.
 * All timing is injectable for deterministic testing.
 */

/**
 * Default sleep implementation (real timer).
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 *
 * @param {() => Promise<T>} fn - Async function to retry
 * @param {{ maxRetries?: number, baseDelayMs?: number, maxDelayMs?: number, sleepFn?: (ms: number) => Promise<void>, shouldRetry?: (err: Error) => boolean }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
export async function withRetry(fn, opts = {}) {
  const {
    maxRetries = 2,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    sleepFn = defaultSleep,
    shouldRetry = () => true,
  } = opts;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries || !shouldRetry(err)) {
        throw err;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      await sleepFn(delay);
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Create a fetch function that retries on failure.
 *
 * Wraps a fetch implementation with retry logic. Network errors (thrown)
 * trigger retries. HTTP error responses (4xx, 5xx) are NOT retried
 * because they are valid responses — the adapter interprets the status code.
 *
 * @param {typeof globalThis.fetch} fetchFn - Underlying fetch
 * @param {object} [retryOpts] - Retry options (same as withRetry)
 * @returns {typeof globalThis.fetch}
 */
export function retryFetch(fetchFn, retryOpts = {}) {
  return (url, init) => withRetry(() => fetchFn(url, init), retryOpts);
}
