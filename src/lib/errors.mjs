/**
 * Structured error handling for clearance-opinion-engine.
 * Error codes use the prefix COE.<CATEGORY>.<TYPE>.
 */

const useColor =
  !process.env.NO_COLOR &&
  !process.env.CI &&
  process.stdout.isTTY;

const RED = useColor ? "\x1b[31m" : "";
const YELLOW = useColor ? "\x1b[33m" : "";
const DIM = useColor ? "\x1b[2m" : "";
const RESET = useColor ? "\x1b[0m" : "";

/**
 * Print a fatal error and exit.
 * @param {string} code  - e.g. "COE.INIT.NO_ARGS"
 * @param {string} headline - user-facing summary
 * @param {object} [opts]
 * @param {string} [opts.fix] - remediation hint
 * @param {string} [opts.path] - relevant file/url
 * @param {string} [opts.nerd] - stack trace / debug detail
 * @param {number} [opts.exitCode=1]
 */
export function fail(code, headline, opts = {}) {
  const { fix, path, nerd, exitCode = 1 } = opts;
  const lines = [`${RED}[${code}]${RESET} ${headline}`];
  if (path) lines.push(`  file: ${path}`);
  if (fix) lines.push(`  fix:  ${fix}`);
  if (nerd) lines.push(`${DIM}  nerd: ${nerd}${RESET}`);
  console.error(lines.join("\n"));
  process.exit(exitCode);
}

/**
 * Print a warning (no exit).
 * @param {string} code
 * @param {string} headline
 * @param {object} [opts]
 * @param {string} [opts.fix]
 * @param {string} [opts.path]
 * @param {string} [opts.nerd]
 */
export function warn(code, headline, opts = {}) {
  const { fix, path, nerd } = opts;
  const lines = [`${YELLOW}[${code}]${RESET} ${headline}`];
  if (path) lines.push(`  file: ${path}`);
  if (fix) lines.push(`  fix:  ${fix}`);
  if (nerd) lines.push(`${DIM}  nerd: ${nerd}${RESET}`);
  console.warn(lines.join("\n"));
}

/**
 * Create a structured error object (for collecting, not printing).
 * @param {string} code
 * @param {string} message
 * @param {object} [context]
 * @returns {{ code: string, message: string, context?: object }}
 */
export function makeError(code, message, context) {
  const err = { code, message };
  if (context) err.context = context;
  return err;
}

/**
 * Map common error patterns to user-friendly messages.
 *
 * @param {Error} err
 * @returns {{ code: string, headline: string, fix: string } | null}
 */
export function friendlyError(err) {
  const msg = err?.message || "";
  const code = err?.code || err?.cause?.code || "";

  // DNS failure
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || msg.includes("getaddrinfo")) {
    return {
      code: "COE.NET.DNS_FAIL",
      headline: "DNS lookup failed — are you connected to the internet?",
      fix: "Check your network connection and try again.",
    };
  }

  // Connection refused
  if (code === "ECONNREFUSED") {
    return {
      code: "COE.NET.CONN_REFUSED",
      headline: "Connection refused by the remote server.",
      fix: "The service may be down. Try again later.",
    };
  }

  // Timeout
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || msg.includes("timeout")) {
    return {
      code: "COE.NET.TIMEOUT",
      headline: "Request timed out.",
      fix: "The service may be slow. Try again later or use --cache-dir to cache results.",
    };
  }

  // Rate limited
  if (msg.includes("429") || msg.includes("rate limit")) {
    return {
      code: "COE.NET.RATE_LIMITED",
      headline: "Rate limited by the remote service.",
      fix: "Wait a few minutes and try again, or use --cache-dir to avoid repeated requests.",
    };
  }

  // Permission denied
  if (code === "EACCES" || code === "EPERM") {
    return {
      code: "COE.FS.PERMISSION",
      headline: "Permission denied writing to disk.",
      fix: "Check file permissions on the output directory.",
    };
  }

  return null;
}
