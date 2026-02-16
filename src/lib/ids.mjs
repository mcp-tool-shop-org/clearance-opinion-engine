/**
 * Deterministic ID generation for clearance-opinion-engine.
 *
 * ID prefixes:
 *   chk.*  — namespace checks
 *   ev.*   — evidence records
 *   fd.*   — findings
 *
 * All IDs are deterministic: same inputs → same ID, no randomness.
 */

/**
 * Sanitize a string for use in an ID segment.
 * Lowercases, replaces non-alphanumeric (except dots/hyphens) with hyphens,
 * collapses consecutive hyphens, trims leading/trailing hyphens.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeSegment(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9.\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate a namespace check ID.
 * @param {string} namespace - e.g. "npm", "pypi", "github-org", "github-repo"
 * @param {string} name - the name being checked
 * @returns {string} e.g. "chk.npm.my-cool-tool"
 */
export function checkId(namespace, name) {
  return `chk.${sanitizeSegment(namespace)}.${sanitizeSegment(name)}`;
}

/**
 * Generate an evidence ID.
 * @param {string} parentCheckId - the check this evidence belongs to
 * @param {number} idx - zero-based index
 * @returns {string} e.g. "ev.chk.npm.my-cool-tool.0"
 */
export function evidenceId(parentCheckId, idx) {
  return `ev.${parentCheckId}.${idx}`;
}

/**
 * Generate a finding ID.
 * @param {string} kind - e.g. "exact_conflict", "phonetic_conflict"
 * @param {string} slug - the candidate name (sanitized)
 * @param {number} idx - zero-based index for uniqueness
 * @returns {string} e.g. "fd.exact_conflict.my-cool-tool.0"
 */
export function findingId(kind, slug, idx) {
  return `fd.${sanitizeSegment(kind)}.${sanitizeSegment(slug)}.${idx}`;
}
