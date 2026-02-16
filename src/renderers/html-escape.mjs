/**
 * HTML escaping utilities for clearance-opinion-engine.
 *
 * Security boundary: all user-provided strings MUST pass through
 * escapeHtml() or escapeAttr() before insertion into HTML output.
 *
 * Character map follows OWASP recommendations.
 */

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;",
  "/": "&#x2F;",
};

const HTML_ESCAPE_RE = /[&<>"'`/]/g;

/**
 * Escape a string for safe insertion into HTML content.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Escape a string for safe insertion into an HTML attribute value.
 * More aggressive than content escaping — also encodes = and control chars.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeAttr(str) {
  if (typeof str !== "string") return "";
  // First do standard HTML escaping
  let result = escapeHtml(str);
  // Then encode additional attribute-dangerous characters
  result = result.replace(/=/g, "&#x3D;");
  // Remove control characters (0x00-0x1F except tab/newline/cr)
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return result;
}
