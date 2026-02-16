/**
 * Homoglyph / confusable character detection for clearance-opinion-engine.
 *
 * Covers common ASCII confusables plus high-risk Latin/Cyrillic/Greek
 * homoglyphs that are frequently used in typosquatting attacks.
 */

/**
 * Maximum total homoglyph variants to generate.
 * Prevents combinatorial explosion with the expanded confusable map.
 */
const MAX_HOMOGLYPH_VARIANTS = 50;

/**
 * Confusable substitution table.
 * Each entry maps a character to its common confusable(s):
 *   - ASCII confusables (digits, punctuation)
 *   - Cyrillic look-alikes (а, с, е, і, к, м, о, р, х, у)
 *   - Greek look-alikes (ο, τ, υ)
 */
const CONFUSABLE_MAP = {
  a: ["4", "@", "\u0430"],           // Cyrillic а
  b: ["8"],
  c: ["\u0441"],                      // Cyrillic с
  e: ["3", "\u0435"],                 // Cyrillic е
  g: ["9", "6"],
  h: ["\u04BB"],                      // Cyrillic һ
  i: ["1", "l", "!", "\u0456"],       // Cyrillic і
  k: ["\u043A"],                      // Cyrillic к
  l: ["1", "i", "|"],
  m: ["\u043C"],                      // Cyrillic м
  o: ["0", "\u043E", "\u03BF"],       // Cyrillic о + Greek ο
  p: ["\u0440"],                      // Cyrillic р
  s: ["5", "$"],
  t: ["7", "+", "\u03C4"],            // Greek τ
  u: ["\u03C5"],                      // Greek υ
  x: ["\u0445"],                      // Cyrillic х
  y: ["\u0443"],                      // Cyrillic у
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

  const sorted = [...variants].sort();
  return sorted.slice(0, MAX_HOMOGLYPH_VARIANTS);
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
