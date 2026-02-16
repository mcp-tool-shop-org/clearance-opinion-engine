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
