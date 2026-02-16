/**
 * Adaptive per-host backoff for rate-limited APIs.
 *
 * Wraps a fetch function to track per-host failure state and
 * automatically delay requests when a host is returning 429 or 5xx.
 * Composes with retryFetch — this module handles pacing, not retries.
 *
 * All timing is injectable for deterministic testing.
 */

/**
 * @typedef {Object} HostState
 * @property {number} consecutiveFailures - Sequential 429/5xx count
 * @property {number} backoffMs           - Current delay before next request
 * @property {number} lastFailureAt       - Timestamp of most recent failure
 */

/**
 * @typedef {Object} AdaptiveBackoffOpts
 * @property {number}                          [maxBackoffMs=30000] - Upper bound for backoff delay
 * @property {(ms: number) => Promise<void>}   [sleepFn]           - Injectable sleep (default: real timer)
 * @property {() => number}                    [clockFn]           - Injectable clock (default: Date.now)
 */

/**
 * Extract the hostname from a URL string or Request object.
 *
 * @param {string | URL | Request} input
 * @returns {string}
 */
function extractHostname(input) {
  const raw = typeof input === "string" || input instanceof URL
    ? input
    : input.url;
  return new URL(raw).hostname;
}

/**
 * Parse a Retry-After header value into milliseconds.
 *
 * Supports two formats defined by HTTP/1.1:
 *   - Delay-seconds  (integer string, e.g. "120")
 *   - HTTP-date      (e.g. "Fri, 31 Dec 1999 23:59:59 GMT")
 *
 * @param {string | null} value - Raw header value
 * @param {() => number}  clockFn
 * @returns {number} Milliseconds to wait, or 0 if unparseable / missing
 */
function parseRetryAfter(value, clockFn) {
  if (value == null) return 0;

  // Try as integer seconds first
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }

  // Try as HTTP date
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - clockFn();
    return delta > 0 ? delta : 0;
  }

  return 0;
}

/**
 * Create a fetch wrapper with adaptive per-host backoff.
 *
 * The returned function has the same signature as the native `fetch` and
 * transparently delays requests to hosts that are returning 429 or 5xx.
 *
 * Attach `.getStats()` to inspect current per-host state.
 *
 * @param {typeof globalThis.fetch} fetchFn - Underlying fetch implementation
 * @param {AdaptiveBackoffOpts}     [opts]
 * @returns {typeof globalThis.fetch & { getStats: () => { hosts: Record<string, { consecutiveFailures: number, backoffMs: number }> } }}
 */
export function createAdaptiveBackoff(fetchFn, opts = {}) {
  const {
    maxBackoffMs = 30000,
    sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
    clockFn = () => Date.now(),
  } = opts;

  /** @type {Map<string, HostState>} */
  const hosts = new Map();

  /**
   * Get or initialise the state for a hostname.
   * @param {string} hostname
   * @returns {HostState}
   */
  function getState(hostname) {
    if (!hosts.has(hostname)) {
      hosts.set(hostname, {
        consecutiveFailures: 0,
        backoffMs: 0,
        lastFailureAt: 0,
      });
    }
    return hosts.get(hostname);
  }

  /**
   * Wrapped fetch with adaptive backoff.
   * @param {string | URL | Request} input
   * @param {RequestInit}            [init]
   * @returns {Promise<Response>}
   */
  async function adaptiveFetch(input, init) {
    const hostname = extractHostname(input);
    const state = getState(hostname);

    // Sleep if a backoff is active
    if (state.backoffMs > 0) {
      await sleepFn(state.backoffMs);
    }

    const response = await fetchFn(input, init);

    if (response.status === 429) {
      // Rate limited — double backoff (min 1000)
      state.backoffMs = Math.min(
        Math.max(state.backoffMs * 2, 1000),
        maxBackoffMs,
      );

      // Honour Retry-After if present
      const retryAfterMs = parseRetryAfter(
        response.headers.get("Retry-After"),
        clockFn,
      );
      if (retryAfterMs > 0) {
        state.backoffMs = Math.min(
          Math.max(retryAfterMs, state.backoffMs),
          maxBackoffMs,
        );
      }

      state.consecutiveFailures++;
      state.lastFailureAt = clockFn();
    } else if (response.status >= 500 && response.status < 600) {
      // Server error — increase backoff by 50% (min 1000)
      state.backoffMs = Math.min(
        Math.max(Math.ceil(state.backoffMs * 1.5), 1000),
        maxBackoffMs,
      );
      state.consecutiveFailures++;
      state.lastFailureAt = clockFn();
    } else {
      // Success — cool down
      state.backoffMs = Math.floor(state.backoffMs / 2);
      state.consecutiveFailures = 0;
    }

    return response;
  }

  /**
   * Return a snapshot of per-host backoff state.
   *
   * @returns {{ hosts: Record<string, { consecutiveFailures: number, backoffMs: number }> }}
   */
  adaptiveFetch.getStats = function getStats() {
    const snapshot = {};
    for (const [hostname, state] of hosts) {
      snapshot[hostname] = {
        consecutiveFailures: state.consecutiveFailures,
        backoffMs: state.backoffMs,
      };
    }
    return { hosts: snapshot };
  };

  return adaptiveFetch;
}
