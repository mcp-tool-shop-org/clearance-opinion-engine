/**
 * Name tokenization for clearance-opinion-engine.
 *
 * Splits names into meaningful tokens by detecting separators and
 * camelCase boundaries.
 */

/**
 * Tokenize a name into component words.
 *
 * Splits on:
 * - Hyphens, underscores, dots, spaces
 * - camelCase boundaries (e.g., "myCoolTool" → ["my", "Cool", "Tool"])
 * - Consecutive uppercase runs (e.g., "HTMLParser" → ["HTML", "Parser"])
 *
 * All tokens are lowercased in the output.
 *
 * @param {string} name
 * @returns {string[]}
 */
export function tokenize(name) {
  // Step 1: Split on explicit separators
  const parts = name.split(/[-_.\s]+/).filter(Boolean);

  // Step 2: Split each part on camelCase boundaries
  const tokens = [];
  for (const part of parts) {
    const camelTokens = part
      // Insert separator before uppercase letters following lowercase
      .replace(/([a-z])([A-Z])/g, "$1\0$2")
      // Insert separator between consecutive uppercase and uppercase+lowercase
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\0$2")
      .split("\0")
      .filter(Boolean);
    for (const t of camelTokens) {
      tokens.push(t.toLowerCase());
    }
  }

  return tokens;
}
