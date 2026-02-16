/**
 * Homoglyph / confusable character detection for clearance-opinion-engine.
 *
 * Conservative: only common ASCII confusables. No Unicode confusables
 * (those require a full Unicode confusable table and are deferred to v2).
 */

/**
 * ASCII confusable substitution table.
 * Each entry maps a character to its common confusable(s).
 */
const CONFUSABLE_MAP = {
  a: ["4", "@"],
  b: ["8"],
  e: ["3"],
  g: ["9", "6"],
  i: ["1", "l", "!"],
  l: ["1", "i", "|"],
  o: ["0"],
  s: ["5", "$"],
  t: ["7", "+"],
  z: ["2"],
};

/**
 * Generate homoglyph variants of a name.
 *
 * For each character in the name that has confusable substitutions,
 * generates one variant per substitution. Does NOT generate all
 * combinations (exponential) — only single-character substitutions.
 *
 * @param {string} name - Lowercase name to generate variants for
 * @returns {string[]} Array of confusable forms (sorted, deduplicated)
 */
export function homoglyphVariants(name) {
  const lower = name.toLowerCase();
  const variants = new Set();

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    const subs = CONFUSABLE_MAP[ch];
    if (!subs) continue;

    for (const sub of subs) {
      const variant = lower.slice(0, i) + sub + lower.slice(i + 1);
      if (variant !== lower) {
        variants.add(variant);
      }
    }
  }

  return [...variants].sort();
}

/**
 * Check if two names are homoglyph-confusable.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function areConfusable(a, b) {
  if (a === b) return false;
  const lower_a = a.toLowerCase();
  const lower_b = b.toLowerCase();
  if (lower_a === lower_b) return true;

  const variants = homoglyphVariants(lower_a);
  return variants.includes(lower_b);
}

/**
 * Get the confusable substitution map (for reporting).
 * @returns {Readonly<Record<string, string[]>>}
 */
export function getConfusableMap() {
  return Object.freeze({ ...CONFUSABLE_MAP });
}
