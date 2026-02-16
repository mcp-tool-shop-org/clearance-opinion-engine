/**
 * Name normalization for clearance-opinion-engine.
 *
 * Produces a stable canonical form: lowercase, special chars stripped
 * (hyphens preserved), whitespace collapsed.
 */

/**
 * Normalize a name to its canonical lowercase form.
 * - Lowercases
 * - Replaces non-alphanumeric (except hyphens) with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 *
 * @param {string} name
 * @returns {string}
 */
export function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Strip all punctuation and spaces, lowercase only.
 * Used for aggressive matching (e.g., "MyCoolTool" → "mycooltool").
 *
 * @param {string} name
 * @returns {string}
 */
export function stripAll(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
