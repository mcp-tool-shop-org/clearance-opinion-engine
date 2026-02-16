/**
 * Safer alternatives generator for clearance-opinion-engine.
 *
 * Deterministic alternative name suggestions using
 * prefix/suffix/separator/abbreviation/compound strategies.
 * No LLM text — all templates are static.
 */

import { normalize } from "../variants/normalize.mjs";
import { tokenize } from "../variants/tokenize.mjs";

/**
 * Strategy candidate pools, in priority order within each strategy.
 */
const STRATEGY_POOLS = {
  prefix: ["go-", "lib-", "my-"],
  suffix: ["-js", "-core", "-kit"],
  separator: ["-app", "-tool", "-dev"],
  compound: ["-hub", "-lab", "-io"],
};

/**
 * Generate safer alternative names using deterministic strategies.
 *
 * Always produces exactly 5 alternatives (one per strategy).
 *
 * @param {string} candidateName
 * @returns {Array<{ name: string, strategy: string, availability: { checked: boolean, summary: string } }>}
 */
export function generateAlternatives(candidateName) {
  const canonical = normalize(candidateName);
  const tokens = tokenize(candidateName);
  const alternatives = [];

  // 1. Prefix — prepend from pool
  for (const prefix of STRATEGY_POOLS.prefix) {
    const alt = `${prefix}${canonical}`;
    if (alt !== canonical) {
      alternatives.push(makeAlt(alt, "prefix"));
      break;
    }
  }

  // 2. Suffix — append from pool
  for (const suffix of STRATEGY_POOLS.suffix) {
    const alt = `${canonical}${suffix}`;
    if (alt !== canonical) {
      alternatives.push(makeAlt(alt, "suffix"));
      break;
    }
  }

  // 3. Separator — append from pool (different from suffix set)
  for (const sep of STRATEGY_POOLS.separator) {
    const alt = `${canonical}${sep}`;
    if (alt !== canonical) {
      alternatives.push(makeAlt(alt, "separator"));
      break;
    }
  }

  // 4. Abbreviation — first-letter-of-each-token if multi-word, else first3+last3
  const abbr = buildAbbreviation(tokens, canonical);
  alternatives.push(makeAlt(abbr, "abbreviation"));

  // 5. Compound — append from pool
  for (const comp of STRATEGY_POOLS.compound) {
    const alt = `${canonical}${comp}`;
    if (alt !== canonical) {
      alternatives.push(makeAlt(alt, "compound"));
      break;
    }
  }

  return alternatives;
}

/**
 * Re-check alternatives against registries.
 *
 * @param {Array<{ name: string, strategy: string, availability: object }>} alternatives
 * @param {Function} checkFn - async (name, opts) => { checks }
 * @param {{ channels?: string[], now?: string }} [opts]
 * @returns {Promise<Array<{ name: string, strategy: string, availability: { checked: boolean, summary: string } }>>}
 */
export async function recheckAlternatives(alternatives, checkFn, opts = {}) {
  const results = [];

  for (const alt of alternatives) {
    try {
      const result = await checkFn(alt.name, opts);
      const checks = result.checks || [];
      const available = checks.filter((c) => c.status === "available").length;
      const taken = checks.filter((c) => c.status === "taken").length;
      const total = checks.length;

      let summary;
      if (taken === 0 && total > 0) {
        summary = `All ${available} checked namespace(s) available`;
      } else if (taken > 0) {
        summary = `${taken} of ${total} namespace(s) taken`;
      } else {
        summary = "No namespaces checked";
      }

      results.push({
        name: alt.name,
        strategy: alt.strategy,
        availability: { checked: true, summary },
      });
    } catch {
      results.push({
        name: alt.name,
        strategy: alt.strategy,
        availability: { checked: false, summary: "Check failed" },
      });
    }
  }

  return results;
}

// ── Helpers ──────────────────────────────────────────────────────

function makeAlt(name, strategy) {
  return {
    name,
    strategy,
    availability: { checked: false, summary: "Not checked" },
  };
}

function buildAbbreviation(tokens, canonical) {
  if (tokens.length >= 2) {
    // First letter of each token
    return tokens.map((t) => t[0]).join("").toLowerCase();
  }
  // Single token: first 3 + last 3 (or full name if <=6 chars)
  if (canonical.length <= 6) return `${canonical}-x`;
  return `${canonical.slice(0, 3)}${canonical.slice(-3)}`;
}
