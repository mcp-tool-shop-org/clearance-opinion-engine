/**
 * Opinion scoring engine for clearance-opinion-engine.
 *
 * Produces a conservative GREEN/YELLOW/RED opinion based on
 * namespace checks, findings, and variant analysis.
 *
 * Tiering rules:
 *   GREEN  — all checks available, zero exact/phonetic/confusable conflicts
 *   YELLOW — some checks unknown (network), or near_conflict/coverage_gap found
 *   RED    — any exact_conflict, phonetic_conflict on taken namespaces,
 *            or multiple confusable_risk findings
 */

import { computeScoreBreakdown } from "./weights.mjs";

/**
 * Build reservation links for a candidate name based on check results.
 *
 * All links are dry-run/search — no auto-purchase.
 *
 * @param {string} candidateName
 * @param {object[]} checks
 * @returns {{ claimLinks: string[], domainLinks: string[] }}
 */
function buildReservationLinks(candidateName, checks) {
  const claimLinks = [];
  const domainLinks = [];
  const encodedName = encodeURIComponent(candidateName);

  for (const c of checks) {
    if (c.status !== "available") continue;

    if (c.namespace === "npm") {
      claimLinks.push(`https://www.npmjs.com/package/${encodedName}`);
    } else if (c.namespace === "pypi") {
      claimLinks.push(`https://pypi.org/project/${encodedName}/`);
    } else if (c.namespace === "github_repo") {
      claimLinks.push("https://github.com/new");
    } else if (c.namespace === "github_org") {
      claimLinks.push("https://github.com/organizations/new");
    } else if (c.namespace === "domain") {
      const fqdn = c.query?.value || `${candidateName}.com`;
      domainLinks.push(`https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(fqdn)}`);
    }
  }

  return { claimLinks, domainLinks };
}

/**
 * Score an opinion from checks, findings, and variant data.
 *
 * @param {{ checks: object[], findings: object[], variants: object }} data
 * @param {{ riskTolerance?: string }} [opts]
 * @returns {{ tier: string, summary: string, reasons: string[], assumptions: string[], limitations: string[], recommendedActions: object[], closestConflicts: object[], scoreBreakdown: object }}
 */
export function scoreOpinion(data, opts = {}) {
  const { checks = [], findings = [], variants = {} } = data;
  const riskTolerance = opts.riskTolerance || "conservative";

  const reasons = [];
  const assumptions = [];
  const limitations = [];
  const recommendedActions = [];
  const closestConflicts = [];

  // Classify checks
  const taken = checks.filter((c) => c.status === "taken");
  const available = checks.filter((c) => c.status === "available");
  const unknown = checks.filter((c) => c.status === "unknown");

  // Classify findings by kind
  const exactConflicts = findings.filter((f) => f.kind === "exact_conflict");
  const phoneticConflicts = findings.filter((f) => f.kind === "phonetic_conflict");
  const confusableRisks = findings.filter((f) => f.kind === "confusable_risk");
  const nearConflicts = findings.filter((f) => f.kind === "near_conflict");
  const coverageGaps = findings.filter((f) => f.kind === "coverage_gap");

  // --- RED conditions ---
  if (exactConflicts.length > 0) {
    reasons.push(
      `Exact conflict: ${exactConflicts.length} namespace(s) already taken with this exact name`
    );
    for (const f of exactConflicts) {
      closestConflicts.push({
        mark: f.candidateMark,
        why: [`Exact name match in namespace: ${f.summary}`],
        severity: "high",
        evidenceRefs: f.evidenceRefs,
      });
    }
  }

  if (phoneticConflicts.length > 0) {
    reasons.push(
      `Phonetic conflict: ${phoneticConflicts.length} name(s) sound similar to existing taken names`
    );
    for (const f of phoneticConflicts) {
      closestConflicts.push({
        mark: f.candidateMark,
        why: [`Phonetic similarity: ${f.summary}`],
        severity: "high",
        evidenceRefs: f.evidenceRefs,
      });
    }
  }

  // Confusable risk is only RED when confusable variants overlap with TAKEN namespaces.
  // Self-generated homoglyphs (candidate's own variants) are informational (YELLOW at most)
  // unless a taken namespace exists with a confusable name.
  const confusableWithTaken = confusableRisks.filter((f) =>
    f.severity === "high" && taken.length > 0
  );
  const multipleConfusable = confusableWithTaken.length >= 2 ||
    (riskTolerance === "conservative" && confusableWithTaken.length >= 1);

  if (multipleConfusable) {
    reasons.push(
      `Confusable risk: ${confusableWithTaken.length} homoglyph/confusable variant(s) overlap with taken namespaces`
    );
  }

  const isRed = exactConflicts.length > 0 || phoneticConflicts.length > 0 || multipleConfusable;

  // --- YELLOW conditions ---
  if (unknown.length > 0) {
    reasons.push(
      `${unknown.length} namespace check(s) returned unknown (network issues)`
    );
  }

  if (nearConflicts.length > 0) {
    reasons.push(
      `Near conflict: ${nearConflicts.length} similar name(s) found`
    );
  }

  if (coverageGaps.length > 0) {
    reasons.push(
      `Coverage gap: ${coverageGaps.length} namespace(s) not checked`
    );
  }

  // Single confusable with warn severity in non-conservative mode → YELLOW not RED
  if (!multipleConfusable && confusableRisks.length > 0) {
    reasons.push(
      `Confusable risk: ${confusableRisks.length} minor homoglyph variant(s) detected`
    );
  }

  const isYellow =
    !isRed &&
    (unknown.length > 0 ||
      nearConflicts.length > 0 ||
      coverageGaps.length > 0 ||
      (!multipleConfusable && confusableRisks.length > 0));

  // --- GREEN conditions ---
  if (!isRed && !isYellow) {
    reasons.push(
      `All ${available.length} namespace check(s) returned available with no conflicts`
    );
  }

  const tier = isRed ? "red" : isYellow ? "yellow" : "green";

  // Get candidate name for reservation links
  const candidateName = variants.items?.[0]?.candidateMark || "unknown";

  // Build reservation links
  const { claimLinks, domainLinks } = buildReservationLinks(candidateName, checks);
  const hasDomainChecks = checks.some((c) => c.namespace === "domain");

  // Build recommended actions (with links)
  if (tier === "green") {
    recommendedActions.push({
      type: "claim_handles",
      label: "Claim namespace handles now",
      details: `All ${available.length} namespaces are available. Reserve them before someone else does.`,
      links: claimLinks,
    });
    if (!hasDomainChecks) {
      recommendedActions.push({
        type: "reserve_domain",
        label: "Consider reserving a domain",
        details: "Domain availability was not checked. Consider registering a matching domain.",
        links: [
          `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(candidateName)}.com`,
          `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(candidateName)}.dev`,
        ],
      });
    } else if (domainLinks.length > 0) {
      recommendedActions.push({
        type: "reserve_domain",
        label: "Reserve available domains",
        details: "Some domains are available for registration.",
        links: domainLinks,
      });
    }
  } else if (tier === "yellow") {
    if (unknown.length > 0) {
      recommendedActions.push({
        type: "expand_search_coverage",
        label: "Re-run checks for unavailable namespaces",
        details: `${unknown.length} check(s) failed. Re-run when network is available.`,
        links: [],
      });
    }
    recommendedActions.push({
      type: "consult_counsel",
      label: "Review near-conflicts with counsel",
      details: "Some potential conflicts were detected. A trademark professional can assess risk.",
      links: [],
    });
  } else {
    // RED
    recommendedActions.push({
      type: "pick_variant",
      label: "Consider alternative names",
      details: "The candidate name has direct conflicts. Evaluate variant forms or choose a different name.",
      links: [],
    });
    recommendedActions.push({
      type: "consult_counsel",
      label: "Consult trademark counsel before proceeding",
      details: "Strong conflicts detected. Professional legal review is strongly recommended.",
      links: [],
    });
  }

  // Standard assumptions
  assumptions.push(
    "Namespace availability is checked at a point in time and may change."
  );
  assumptions.push(
    "This opinion covers digital namespace availability only, not trademark registration."
  );

  // Standard limitations
  limitations.push(
    "This engine does not check trademark databases (USPTO, EUIPO, etc.)."
  );
  if (!hasDomainChecks) {
    limitations.push(
      "Domain name availability is not checked in this version."
    );
  }
  if (unknown.length > 0) {
    limitations.push(
      `${unknown.length} namespace(s) could not be checked due to network errors.`
    );
  }

  // Build summary
  const tierLabel = tier === "green" ? "GREEN" : tier === "yellow" ? "YELLOW" : "RED";
  const candidateNames = variants.items
    ? variants.items.map((v) => v.candidateMark).join(", ")
    : "unknown";
  const summary =
    tier === "green"
      ? `All namespaces available for "${candidateNames}". No conflicts detected. Safe to proceed with claims.`
      : tier === "yellow"
        ? `Some concerns found for "${candidateNames}". ${reasons.length} issue(s) need review before proceeding.`
        : `Conflicts detected for "${candidateNames}". ${reasons.length} blocking issue(s) found. Name change recommended.`;

  // Compute explainable score breakdown
  const scoreBreakdown = computeScoreBreakdown(data, opts);

  return {
    tier,
    summary,
    reasons,
    assumptions,
    limitations,
    recommendedActions,
    closestConflicts,
    scoreBreakdown,
  };
}

/**
 * Classify findings from checks and variants.
 *
 * Given namespace checks and variant data, produces finding objects
 * for any conflicts detected.
 *
 * @param {object[]} checks - Namespace check results
 * @param {object} variants - Variant generation output
 * @returns {object[]} Array of finding objects
 */
export function classifyFindings(checks, variants) {
  const findings = [];
  let findingIdx = 0;

  for (const check of checks) {
    if (check.status !== "taken") continue;

    const candidateMark = check.query?.candidateMark || "unknown";

    // Exact conflict: name is taken in this namespace
    findings.push({
      id: `fd.exact-conflict.${check.namespace}.${findingIdx}`,
      candidateMark,
      kind: "exact_conflict",
      summary: `Name "${check.query.value}" is taken in ${check.namespace}`,
      severity: "high",
      score: 100,
      why: [`${check.namespace} returned status "${check.status}" for "${check.query.value}"`],
      evidenceRefs: check.evidenceRef ? [check.evidenceRef] : [],
    });
    findingIdx++;
  }

  // Check variants for homoglyph warnings — only promote to findings
  // when taken namespaces exist (potential identity confusion with real entities).
  // When all namespaces are available, homoglyph variants are informational only
  // and remain as warnings in the variant data.
  const hasTaken = checks.some((c) => c.status === "taken");
  if (hasTaken && variants?.items) {
    for (const variantSet of variants.items) {
      for (const warning of variantSet.warnings || []) {
        if (warning.code === "COE.HOMOGLYPH_RISK") {
          findings.push({
            id: `fd.confusable-risk.${variantSet.canonical}.${findingIdx}`,
            candidateMark: variantSet.candidateMark,
            kind: "confusable_risk",
            summary: warning.message,
            severity: warning.severity === "high" ? "high" : "low",
            score: warning.severity === "high" ? 60 : 20,
            why: ["Homoglyph substitution variants exist that could cause confusion with taken names"],
            evidenceRefs: [],
          });
          findingIdx++;
        }
      }
    }
  }

  return findings;
}
