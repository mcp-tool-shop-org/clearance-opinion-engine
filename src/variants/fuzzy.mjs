/**
 * Fuzzy edit-distance=1 variant generation for clearance-opinion-engine.
 *
 * Generates all single-edit variants (deletions, substitutions, insertions)
 * of a candidate name. These variants represent typosquatting risk — names
 * that differ by exactly one keystroke.
 *
 * Variants are sorted by a stable tuple (operationType, position, replacement,
 * variantString) for deterministic output.
 */

/**
 * Characters used for substitutions and insertions.
 * Lowercase alphanumeric + hyphen (valid package name characters).
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789-".split("");

/**
 * Generate all edit-distance=1 variants of a name.
 *
 * Operations:
 *   1. Deletions: remove one character at each position
 *   2. Substitutions: replace one character with each alternative
 *   3. Insertions: insert one character at each position
 *
 * @param {string} name - Lowercase name to generate variants for
 * @param {{ maxVariants?: number }} [opts] - Options
 * @returns {string[]} Sorted, deduplicated, capped array of fuzzy variants
 */
export function fuzzyVariants(name, opts = {}) {
  const maxVariants = opts.maxVariants || 30;
  const lower = name.toLowerCase();

  // Collect all variants with metadata for stable sorting
  /** @type {{ op: string, pos: number, repl: string, value: string }[]} */
  const raw = [];

  // 1. Deletions
  for (let i = 0; i < lower.length; i++) {
    const variant = lower.slice(0, i) + lower.slice(i + 1);
    if (variant.length > 0 && variant !== lower) {
      raw.push({ op: "del", pos: i, repl: "", value: variant });
    }
  }

  // 2. Substitutions
  for (let i = 0; i < lower.length; i++) {
    for (const ch of ALPHABET) {
      if (ch === lower[i]) continue;
      const variant = lower.slice(0, i) + ch + lower.slice(i + 1);
      if (variant !== lower) {
        raw.push({ op: "sub", pos: i, repl: ch, value: variant });
      }
    }
  }

  // 3. Insertions
  for (let i = 0; i <= lower.length; i++) {
    for (const ch of ALPHABET) {
      const variant = lower.slice(0, i) + ch + lower.slice(i);
      if (variant !== lower) {
        raw.push({ op: "ins", pos: i, repl: ch, value: variant });
      }
    }
  }

  // Sort by stable tuple: (op, pos, repl, value)
  raw.sort((a, b) => {
    if (a.op !== b.op) return a.op.localeCompare(b.op);
    if (a.pos !== b.pos) return a.pos - b.pos;
    if (a.repl !== b.repl) return a.repl.localeCompare(b.repl);
    return a.value.localeCompare(b.value);
  });

  // Deduplicate by value (keep first occurrence)
  const seen = new Set();
  const unique = [];
  for (const entry of raw) {
    if (!seen.has(entry.value)) {
      seen.add(entry.value);
      unique.push(entry.value);
    }
  }

  return unique.slice(0, maxVariants);
}

/**
 * Select the top N variants from a sorted list.
 * Used to limit the number of registry queries.
 *
 * @param {string[]} variants - Pre-sorted array from fuzzyVariants()
 * @param {number} [n] - Maximum to select (default: 12)
 * @returns {string[]}
 */
export function selectTopN(variants, n = 12) {
  return variants.slice(0, n);
}
