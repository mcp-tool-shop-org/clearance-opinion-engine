/**
 * Similarity scoring engine for clearance-opinion-engine.
 *
 * Implements Jaro-Winkler string similarity for "looks like" analysis
 * and combines with Metaphone phonetic similarity for "sounds like"
 * analysis to produce trademark-style similarity assessments.
 *
 * No external dependencies. All algorithms are pure JS.
 */

import { normalize } from "../variants/normalize.mjs";
import { tokenize } from "../variants/tokenize.mjs";
import { phoneticSignature } from "../variants/phonetic.mjs";

/**
 * Compute Jaro similarity between two strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 0-1 similarity score
 */
function jaro(a, b) {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);

  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);

    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Compute Jaro-Winkler similarity between two strings.
 *
 * Extends Jaro with a prefix bonus: up to 4 common prefix characters
 * increase the score, weighted by scaling factor p=0.1.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 0-1 similarity score
 */
export function jaroWinkler(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return 0.0;

  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  const jaroScore = jaro(aLower, bLower);

  // Compute common prefix length (up to 4 chars)
  let prefix = 0;
  const maxPrefix = Math.min(4, aLower.length, bLower.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (aLower[i] === bLower[i]) {
      prefix++;
    } else {
      break;
    }
  }

  const p = 0.1; // Winkler scaling factor
  return jaroScore + prefix * p * (1 - jaroScore);
}

/**
 * Assign a similarity label based on a numeric score.
 *
 * @param {number} score - 0-1 similarity score
 * @returns {"very high"|"high"|"medium"|"low"}
 */
export function similarityLabel(score) {
  if (score >= 0.95) return "very high";
  if (score >= 0.85) return "high";
  if (score >= 0.70) return "medium";
  return "low";
}

/**
 * Compare a pair of marks for visual + phonetic similarity.
 *
 * @param {string} a - candidate mark
 * @param {string} b - known mark
 * @param {{ lookWeight?: number, soundWeight?: number }} [opts]
 * @returns {{
 *   a: string, b: string,
 *   looks: { score: number, label: string },
 *   sounds: { score: number, label: string },
 *   overall: number,
 *   why: string[]
 * }}
 */
export function comparePair(a, b, opts = {}) {
  const lookWeight = opts.lookWeight ?? 0.6;
  const soundWeight = opts.soundWeight ?? 0.4;

  // Appearance similarity: Jaro-Winkler on normalized forms
  const normA = normalize(a);
  const normB = normalize(b);
  const looksScore = jaroWinkler(normA, normB);
  const looksLabel = similarityLabel(looksScore);

  // Phonetic similarity: Jaro-Winkler on Metaphone signatures
  const tokensA = tokenize(normA);
  const tokensB = tokenize(normB);
  const sigA = phoneticSignature(tokensA);
  const sigB = phoneticSignature(tokensB);
  const soundsScore = sigA && sigB ? jaroWinkler(sigA, sigB) : 0.0;
  const soundsLabel = similarityLabel(soundsScore);

  // Weighted blend
  const totalWeight = lookWeight + soundWeight;
  const overall = totalWeight > 0
    ? Math.round(((lookWeight * looksScore + soundWeight * soundsScore) / totalWeight) * 1000) / 1000
    : 0;

  // Build explanation
  const why = [];
  why.push(`Looks like "${b}" (Jaro-Winkler: ${looksScore.toFixed(2)}, ${looksLabel})`);
  why.push(`Sounds like "${b}" (Metaphone: ${soundsScore.toFixed(2)}, ${soundsLabel})`);

  return {
    a,
    b,
    looks: { score: looksScore, label: looksLabel },
    sounds: { score: soundsScore, label: soundsLabel },
    overall,
    why,
  };
}

/**
 * Find marks in a list that exceed a similarity threshold.
 *
 * @param {string} candidate - candidate mark to compare against
 * @param {{ mark: string }[]} marks - array of known marks
 * @param {{ threshold?: number, lookWeight?: number, soundWeight?: number }} [opts]
 * @returns {Array<{ mark: string, comparison: ReturnType<typeof comparePair> }>}
 */
export function findSimilarMarks(candidate, marks, opts = {}) {
  const threshold = opts.threshold ?? 0.70;

  const results = [];
  for (const entry of marks) {
    const mark = typeof entry === "string" ? entry : entry.mark;
    if (!mark) continue;

    const comparison = comparePair(candidate, mark, opts);
    if (comparison.overall >= threshold) {
      results.push({ mark, comparison });
    }
  }

  // Sort descending by overall score (deterministic: tie-break by mark name)
  results.sort((x, y) => {
    const diff = y.comparison.overall - x.comparison.overall;
    if (diff !== 0) return diff;
    return x.mark.localeCompare(y.mark);
  });

  return results;
}
