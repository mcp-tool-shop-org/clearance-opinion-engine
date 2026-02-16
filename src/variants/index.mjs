/**
 * Variant generation orchestrator for clearance-opinion-engine.
 *
 * Combines normalize, tokenize, phonetic, and homoglyph modules
 * into a single deterministic pipeline.
 */

import { normalize, stripAll } from "./normalize.mjs";
import { tokenize } from "./tokenize.mjs";
import { phoneticVariants, phoneticSignature } from "./phonetic.mjs";
import { homoglyphVariants } from "./homoglyphs.mjs";

/**
 * Generate all variant forms for a candidate name.
 *
 * Returns a variantSet object matching the schema:
 * - candidateMark: original name
 * - canonical: normalized form
 * - forms: array of { type, value } variant forms
 * - warnings: array of warnings (e.g., homoglyph risk)
 *
 * @param {string} candidateMark - The proposed name
 * @param {{ now?: string }} [opts] - Options (clock injection)
 * @returns {{ candidateMark: string, canonical: string, forms: Array<{type: string, value: string}>, warnings: Array<{code: string, message: string, severity: string}> }}
 */
export function generateVariants(candidateMark, opts = {}) {
  const normalized = normalize(candidateMark);
  const stripped = stripAll(candidateMark);
  const tokens = tokenize(candidateMark);
  const phonetic = phoneticVariants(tokens);
  const homoglyphs = homoglyphVariants(normalized);

  // Build forms array (stable order, deterministic)
  const forms = [
    { type: "original", value: candidateMark },
    { type: "lower", value: candidateMark.toLowerCase() },
    { type: "nospace", value: stripped },
    { type: "hyphenated", value: normalized },
    { type: "underscored", value: normalized.replace(/-/g, "_") },
    { type: "punct-stripped", value: stripped },
  ];

  // Add phonetic form
  if (phonetic.length > 0) {
    forms.push({
      type: "phonetic",
      value: phonetic.join(" "),
    });
  }

  // Add homoglyph-safe form (the normalized form IS the safe form)
  forms.push({
    type: "homoglyph-safe",
    value: normalized,
  });

  // Deduplicate by value (keep first occurrence of each type)
  const seen = new Set();
  const uniqueForms = [];
  for (const form of forms) {
    const key = `${form.type}:${form.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueForms.push(form);
    }
  }

  // Generate warnings
  const warnings = [];
  if (homoglyphs.length > 0) {
    warnings.push({
      code: "COE.HOMOGLYPH_RISK",
      message: `${homoglyphs.length} confusable variant(s) detected: ${homoglyphs.slice(0, 3).join(", ")}${homoglyphs.length > 3 ? "..." : ""}`,
      severity: homoglyphs.length >= 5 ? "high" : "warn",
    });
  }

  return {
    candidateMark,
    canonical: normalized,
    forms: uniqueForms,
    warnings,
  };
}

/**
 * Generate variants for multiple candidates.
 *
 * @param {string[]} candidates
 * @param {{ now?: string }} [opts]
 * @returns {{ generatedAt: string, items: Array }}
 */
export function generateAllVariants(candidates, opts = {}) {
  const now = opts.now || new Date().toISOString();
  return {
    generatedAt: now,
    items: candidates.map((c) => generateVariants(c, opts)),
  };
}

// Re-export sub-modules for direct access
export { normalize, stripAll } from "./normalize.mjs";
export { tokenize } from "./tokenize.mjs";
export { metaphone, phoneticVariants, phoneticSignature } from "./phonetic.mjs";
export { homoglyphVariants, areConfusable } from "./homoglyphs.mjs";
