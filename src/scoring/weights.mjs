/**
 * Explainable scoring weights for clearance-opinion-engine.
 *
 * Provides weight profiles per risk tolerance level and
 * sub-score computation for the "Why this tier?" breakdown.
 *
 * NOTE: The tier is still determined by rule-based logic in opinion.mjs
 * (exact conflicts always = RED regardless of score). The score breakdown
 * is additive metadata for explainability — it does NOT replace tier logic.
 */

/**
 * Weight profiles per risk tolerance level.
 * Each weight represents relative importance (must sum to 100).
 *
 * @type {Record<string, { namespaceAvailability: number, coverageCompleteness: number, conflictSeverity: number, domainAvailability: number }>}
 */
export const WEIGHT_PROFILES = {
  conservative: {
    namespaceAvailability: 40,
    coverageCompleteness: 25,
    conflictSeverity: 25,
    domainAvailability: 10,
  },
  balanced: {
    namespaceAvailability: 45,
    coverageCompleteness: 20,
    conflictSeverity: 25,
    domainAvailability: 10,
  },
  aggressive: {
    namespaceAvailability: 50,
    coverageCompleteness: 15,
    conflictSeverity: 20,
    domainAvailability: 15,
  },
};

/**
 * Tier thresholds per risk tolerance.
 * @type {Record<string, { green: number, yellow: number }>}
 */
export const TIER_THRESHOLDS = {
  conservative: { green: 80, yellow: 50 },
  balanced: { green: 70, yellow: 40 },
  aggressive: { green: 60, yellow: 30 },
};

/**
 * Get the weight profile for a given risk tolerance.
 *
 * @param {string} riskTolerance - "conservative", "balanced", or "aggressive"
 * @returns {{ namespaceAvailability: number, coverageCompleteness: number, conflictSeverity: number, domainAvailability: number }}
 */
export function getWeightProfile(riskTolerance) {
  return WEIGHT_PROFILES[riskTolerance] || WEIGHT_PROFILES.conservative;
}

/**
 * Compute score breakdown with sub-scores and weighted overall score.
 *
 * @param {{ checks: object[], findings: object[], variants: object }} data
 * @param {{ riskTolerance?: string }} [opts]
 * @returns {{ namespaceAvailability: { score: number, weight: number, details: string }, coverageCompleteness: { score: number, weight: number, details: string }, conflictSeverity: { score: number, weight: number, details: string }, domainAvailability: { score: number, weight: number, details: string }, overallScore: number, tierThresholds: { green: number, yellow: number } }}
 */
export function computeScoreBreakdown(data, opts = {}) {
  const { checks = [], findings = [] } = data;
  const riskTolerance = opts.riskTolerance || "conservative";
  const weights = getWeightProfile(riskTolerance);
  const thresholds = TIER_THRESHOLDS[riskTolerance] || TIER_THRESHOLDS.conservative;

  // --- Namespace Availability (0-100) ---
  // Non-domain checks only (domain has its own sub-score)
  const nsChecks = checks.filter((c) => c.namespace !== "domain");
  const nsAvailable = nsChecks.filter((c) => c.status === "available");
  const nsAvailabilityScore = nsChecks.length > 0
    ? Math.round((nsAvailable.length / nsChecks.length) * 100)
    : 100;
  const nsDetails = `${nsAvailable.length}/${nsChecks.length} namespace${nsChecks.length === 1 ? "" : "s"} available`;

  // --- Coverage Completeness (0-100) ---
  // Possible namespaces: github_repo, npm, pypi, domain
  const possibleNamespaces = ["github_repo", "npm", "pypi", "domain"];
  const checkedNamespaces = new Set(checks.map((c) => c.namespace));
  const checkedCount = possibleNamespaces.filter((ns) => checkedNamespaces.has(ns)).length;
  const coverageScore = Math.round((checkedCount / possibleNamespaces.length) * 100);
  const unchecked = possibleNamespaces.filter((ns) => !checkedNamespaces.has(ns));
  const coverageDetails = unchecked.length === 0
    ? `${checkedCount}/${possibleNamespaces.length} channels checked`
    : `${checkedCount}/${possibleNamespaces.length} channels checked (${unchecked.join(", ")} not checked)`;

  // --- Conflict Severity (0-100) ---
  // Starts at 100, deductions per finding type
  let conflictScore = 100;
  for (const f of findings) {
    if (f.kind === "exact_conflict") conflictScore -= 30;
    else if (f.kind === "phonetic_conflict") conflictScore -= 20;
    else if (f.kind === "confusable_risk") conflictScore -= 10;
    else if (f.kind === "near_conflict") conflictScore -= 5;
  }
  conflictScore = Math.max(0, conflictScore);
  const conflictDetails = findings.length === 0
    ? "No conflicts detected"
    : `${findings.length} finding${findings.length === 1 ? "" : "s"} detected (score deducted)`;

  // --- Domain Availability (0-100) ---
  const domainChecks = checks.filter((c) => c.namespace === "domain");
  let domainScore;
  let domainDetails;
  if (domainChecks.length === 0) {
    domainScore = 50; // Unknown — not checked
    domainDetails = "Domain not checked";
  } else {
    const domainAvailable = domainChecks.filter((c) => c.status === "available");
    const domainTaken = domainChecks.filter((c) => c.status === "taken");
    domainScore = Math.round((domainAvailable.length / domainChecks.length) * 100);
    domainDetails = `${domainAvailable.length}/${domainChecks.length} domain${domainChecks.length === 1 ? "" : "s"} available`;
    if (domainTaken.length > 0) {
      domainDetails += ` (${domainTaken.length} taken)`;
    }
  }

  // --- Overall Score (weighted average) ---
  const scores = {
    namespaceAvailability: nsAvailabilityScore,
    coverageCompleteness: coverageScore,
    conflictSeverity: conflictScore,
    domainAvailability: domainScore,
  };

  const totalWeight = weights.namespaceAvailability + weights.coverageCompleteness +
    weights.conflictSeverity + weights.domainAvailability;

  const weightedSum =
    scores.namespaceAvailability * weights.namespaceAvailability +
    scores.coverageCompleteness * weights.coverageCompleteness +
    scores.conflictSeverity * weights.conflictSeverity +
    scores.domainAvailability * weights.domainAvailability;

  const overallScore = Math.round(weightedSum / totalWeight);

  return {
    namespaceAvailability: {
      score: nsAvailabilityScore,
      weight: weights.namespaceAvailability,
      details: nsDetails,
    },
    coverageCompleteness: {
      score: coverageScore,
      weight: weights.coverageCompleteness,
      details: coverageDetails,
    },
    conflictSeverity: {
      score: conflictScore,
      weight: weights.conflictSeverity,
      details: conflictDetails,
    },
    domainAvailability: {
      score: domainScore,
      weight: weights.domainAvailability,
      details: domainDetails,
    },
    overallScore,
    tierThresholds: thresholds,
  };
}
