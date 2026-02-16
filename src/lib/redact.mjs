/**
 * Evidence redaction for clearance-opinion-engine.
 *
 * Strips sensitive data (tokens, API keys, Authorization headers)
 * from evidence objects before writing to disk.
 */

/**
 * Maximum bytes for a single evidence notes field.
 */
export const MAX_EVIDENCE_BYTES = 50_000;

/**
 * Query parameter names to strip from URLs.
 */
const SENSITIVE_PARAMS = ["token", "access_token", "api_key", "key", "secret", "password"];

/**
 * Redact sensitive data from a URL string.
 * Strips token-like query parameters.
 *
 * @param {string} url
 * @returns {string} Redacted URL
 */
export function redactUrl(url) {
  if (!url || typeof url !== "string") return url;

  try {
    const parsed = new URL(url);
    let changed = false;
    for (const param of SENSITIVE_PARAMS) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[REDACTED]");
        changed = true;
      }
    }
    return changed ? parsed.toString() : url;
  } catch {
    // Malformed URL — return as-is
    return url;
  }
}

/**
 * Redact Authorization headers from a string (e.g., repro step).
 *
 * @param {string} str
 * @returns {string}
 */
function redactAuthHeaders(str) {
  if (!str || typeof str !== "string") return str;
  return str
    .replace(/Authorization:\s*Bearer\s+\S+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Authorization:\s*token\s+\S+/gi, "Authorization: token [REDACTED]");
}

/**
 * Redact sensitive data from an evidence object (in-place mutation).
 *
 * - Strips token-like query params from source.url
 * - Strips Authorization header values from repro[]
 * - Truncates notes exceeding MAX_EVIDENCE_BYTES
 *
 * @param {object} evidence
 * @returns {object} Same object, mutated
 */
export function redactEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") return evidence;

  // Redact source URL
  if (evidence.source?.url) {
    evidence.source.url = redactUrl(evidence.source.url);
  }

  // Redact repro steps
  if (Array.isArray(evidence.repro)) {
    evidence.repro = evidence.repro.map((step) => {
      let redacted = redactAuthHeaders(step);
      redacted = redactUrl(redacted); // Also catch URLs with tokens in repro
      return redacted;
    });
  }

  // Truncate oversized notes
  if (evidence.notes && typeof evidence.notes === "string" && evidence.notes.length > MAX_EVIDENCE_BYTES) {
    evidence.notes = evidence.notes.slice(0, MAX_EVIDENCE_BYTES) + " [TRUNCATED]";
  }

  return evidence;
}

/**
 * Redact all evidence in an array (in-place mutation).
 *
 * @param {object[]} evidenceArray
 * @returns {object[]} Same array, mutated
 */
export function redactAllEvidence(evidenceArray) {
  if (!Array.isArray(evidenceArray)) return evidenceArray;
  for (const ev of evidenceArray) {
    redactEvidence(ev);
  }
  return evidenceArray;
}

/**
 * Patterns that should NEVER appear in output files.
 * Each pattern has a label for diagnostic output.
 */
const SECRET_PATTERNS = [
  { pattern: /ghp_[A-Za-z0-9]{36}/, label: "GitHub personal access token" },
  { pattern: /github_pat_[A-Za-z0-9_]{82}/, label: "GitHub fine-grained PAT" },
  { pattern: /gho_[A-Za-z0-9]{36}/, label: "GitHub OAuth token" },
  { pattern: /ghs_[A-Za-z0-9]{36}/, label: "GitHub server token" },
  { pattern: /npm_[A-Za-z0-9]{36}/, label: "npm token" },
  { pattern: /Bearer\s+[A-Za-z0-9._\-]{20,}/, label: "Bearer token" },
  { pattern: /sk-[A-Za-z0-9]{32,}/, label: "OpenAI-style API key" },
  { pattern: /AKIA[A-Z0-9]{16}/, label: "AWS access key" },
];

/**
 * Scan a string for known secret patterns.
 *
 * @param {string} content
 * @returns {string[]} Array of pattern labels that matched (empty = clean)
 */
export function scanForSecrets(content) {
  if (!content || typeof content !== "string") return [];

  const matches = [];
  for (const { pattern, label } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      matches.push(label);
    }
  }
  return matches;
}
