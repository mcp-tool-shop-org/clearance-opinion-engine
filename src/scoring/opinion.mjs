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

// ── Top Factors template catalog ─────────────────────────────────
const FACTOR_TEMPLATES = {
  namespace_collision: {
    weight: "critical",
    category: "exact_conflict",
    template: (ctx) =>
      `The name '${ctx.name}' is already claimed in ${ctx.namespace}`,
  },
  phonetic_overlap: {
    weight: "critical",
    category: "phonetic_conflict",
    template: (ctx) =>
      `The name sounds like '${ctx.conflictMark}' (${ctx.pct}% phonetic match)`,
  },
  confusable_variants: {
    weight: "major",
    category: "confusable_risk",
    template: (ctx) =>
      `${ctx.count} homoglyph variant(s) overlap with taken namespaces`,
  },
  fuzzy_squatting_risk: {
    weight: "moderate",
    category: "variant_taken",
    template: (ctx) =>
      `Edit-distance=1 variant '${ctx.variant}' is taken in ${ctx.namespace}`,
  },
  near_miss: {
    weight: "moderate",
    category: "near_conflict",
    template: (ctx) =>
      `Similar name '${ctx.mark}' found (${ctx.pct}% match)`,
  },
  coverage_gap: {
    weight: "moderate",
    category: "coverage_gap",
    template: (ctx) =>
      `${ctx.count} namespace check(s) could not be completed`,
  },
  all_clear: {
    weight: "minor",
    category: "all_clear",
    template: (ctx) =>
      `All ${ctx.count} namespaces available with no conflicts`,
  },
};

const WEIGHT_ORDER = { critical: 0, major: 1, moderate: 2, minor: 3 };

/**
 * Extract the top 3-5 factors that drove the tier decision.
 * Uses template strings — deterministic, no LLM text.
 *
 * @param {{ checks: object[], findings: object[] }} data
 * @param {{ tier: string, candidateName: string }} context
 * @returns {Array<{ factor: string, statement: string, weight: string, category: string }>}
 */
export function extractTopFactors(data, context) {
  const { checks = [], findings = [] } = data;
  const { tier, candidateName } = context;
  const factors = [];

  // Exact conflicts
  const exactConflicts = findings.filter((f) => f.kind === "exact_conflict");
  for (const f of exactConflicts) {
    const ns = f.summary?.match(/in (\S+)$/)?.[1] || "a namespace";
    factors.push({
      factor: "namespace_collision",
      statement: FACTOR_TEMPLATES.namespace_collision.template({
        name: candidateName,
        namespace: ns,
      }),
      weight: "critical",
      category: "exact_conflict",
    });
  }

  // Phonetic conflicts
  const phoneticConflicts = findings.filter((f) => f.kind === "phonetic_conflict");
  for (const f of phoneticConflicts) {
    const pct = f.score || 0;
    const mark = f.summary?.match(/Name "([^"]+)"/)?.[1] || "unknown";
    factors.push({
      factor: "phonetic_overlap",
      statement: FACTOR_TEMPLATES.phonetic_overlap.template({
        conflictMark: mark,
        pct,
      }),
      weight: "critical",
      category: "phonetic_conflict",
    });
  }

  // Confusable risk
  const confusableRisks = findings.filter((f) => f.kind === "confusable_risk");
  if (confusableRisks.length > 0) {
    factors.push({
      factor: "confusable_variants",
      statement: FACTOR_TEMPLATES.confusable_variants.template({
        count: confusableRisks.length,
      }),
      weight: "major",
      category: "confusable_risk",
    });
  }

  // Variant taken (fuzzy squatting)
  const variantTaken = findings.filter((f) => f.kind === "variant_taken");
  for (const f of variantTaken) {
    const variant = f.summary?.match(/variant "([^"]+)"/)?.[1] || "unknown";
    const ns = f.summary?.match(/in (\S+)$/)?.[1] || "a namespace";
    factors.push({
      factor: "fuzzy_squatting_risk",
      statement: FACTOR_TEMPLATES.fuzzy_squatting_risk.template({
        variant,
        namespace: ns,
      }),
      weight: "moderate",
      category: "variant_taken",
    });
  }

  // Near conflicts
  const nearConflicts = findings.filter((f) => f.kind === "near_conflict");
  for (const f of nearConflicts) {
    const pct = f.score || 0;
    const mark = f.summary?.match(/Name "([^"]+)"/)?.[1] || "unknown";
    factors.push({
      factor: "near_miss",
      statement: FACTOR_TEMPLATES.near_miss.template({ mark, pct }),
      weight: "moderate",
      category: "near_conflict",
    });
  }

  // Coverage gaps
  const unknownChecks = checks.filter((c) => c.status === "unknown");
  if (unknownChecks.length > 0) {
    factors.push({
      factor: "coverage_gap",
      statement: FACTOR_TEMPLATES.coverage_gap.template({
        count: unknownChecks.length,
      }),
      weight: "moderate",
      category: "coverage_gap",
    });
  }

  // All clear (GREEN only)
  if (tier === "green" && factors.length === 0) {
    const availCount = checks.filter((c) => c.status === "available").length;
    factors.push({
      factor: "all_clear",
      statement: FACTOR_TEMPLATES.all_clear.template({ count: availCount }),
      weight: "minor",
      category: "all_clear",
    });
  }

  // Sort by weight priority, then by factor name for determinism
  factors.sort((a, b) => {
    const wa = WEIGHT_ORDER[a.weight] ?? 99;
    const wb = WEIGHT_ORDER[b.weight] ?? 99;
    if (wa !== wb) return wa - wb;
    return a.factor.localeCompare(b.factor);
  });

  // Clamp to 3-5
  if (factors.length > 5) return factors.slice(0, 5);
  // If fewer than 3 and GREEN, pad with all_clear
  if (factors.length < 3 && tier === "green") {
    while (factors.length < 3) {
      factors.push({
        factor: "all_clear",
        statement: `No additional conflicts detected`,
        weight: "minor",
        category: "all_clear",
      });
    }
  }

  return factors;
}

// ── Risk Narrative templates ──────────────────────────────────────
const NARRATIVE_TEMPLATES = {
  red_exact: (ctx) =>
    `If you proceed with '${ctx.name}', you will collide with an existing registered name in at least one namespace. ` +
    `Users searching for your project may land on the existing package instead. ` +
    `This creates immediate brand confusion and potential takedown risk.`,
  red_phonetic: (ctx) =>
    `If you proceed with '${ctx.name}', users who hear the name may confuse it with '${ctx.conflictMark}'. ` +
    `Verbal recommendations and word-of-mouth discovery will be unreliable. ` +
    `Consider choosing a phonetically distinct name.`,
  red_confusable: (ctx) =>
    `If you proceed with '${ctx.name}', homoglyph variants create visual confusion with existing names. ` +
    `This enables typosquatting attacks and makes visual identification unreliable. ` +
    `Consider choosing a name with fewer confusable characters.`,
  yellow_near: (ctx) =>
    `Proceeding with '${ctx.name}' carries moderate risk. ` +
    `Similar names exist in the ecosystem that could cause confusion. ` +
    `Monitor these names and consider establishing your brand early.`,
  yellow_coverage: (ctx) =>
    `Some namespaces could not be checked for '${ctx.name}'. ` +
    `The name may appear safe but unverified channels could harbor conflicts. ` +
    `Re-run checks when all services are reachable.`,
  yellow_variant: (ctx) =>
    `Edit-distance=1 variants of '${ctx.name}' are already taken in some registries. ` +
    `This suggests the name space is crowded, increasing the risk of confusion or typosquatting. ` +
    `Consider a more distinctive name.`,
  green: (ctx) =>
    `No conflicts detected for '${ctx.name}'. ` +
    `The name appears safe to use across all checked namespaces. ` +
    `Claim handles promptly as namespace availability changes over time.`,
};

/**
 * Generate a deterministic risk narrative.
 * Template-selected by tier + dominant factor category.
 *
 * @param {{ tier: string, topFactors: object[], candidateName: string }} context
 * @returns {string} 2-4 sentence narrative
 */
export function generateRiskNarrative(context) {
  const { tier, topFactors = [], candidateName } = context;
  const dominant = topFactors[0]?.category || "all_clear";
  const conflictMark = topFactors[0]?.statement?.match(/'([^']+)'/)?.[1] || "unknown";

  const ctx = { name: candidateName, conflictMark };

  if (tier === "green") {
    return NARRATIVE_TEMPLATES.green(ctx);
  }

  if (tier === "red") {
    if (dominant === "exact_conflict") return NARRATIVE_TEMPLATES.red_exact(ctx);
    if (dominant === "phonetic_conflict") return NARRATIVE_TEMPLATES.red_phonetic(ctx);
    if (dominant === "confusable_risk") return NARRATIVE_TEMPLATES.red_confusable(ctx);
    return NARRATIVE_TEMPLATES.red_exact(ctx); // fallback
  }

  // yellow
  if (dominant === "near_conflict") return NARRATIVE_TEMPLATES.yellow_near(ctx);
  if (dominant === "coverage_gap") return NARRATIVE_TEMPLATES.yellow_coverage(ctx);
  if (dominant === "variant_taken") return NARRATIVE_TEMPLATES.yellow_variant(ctx);
  return NARRATIVE_TEMPLATES.yellow_near(ctx); // fallback
}

// ── Next Actions template catalog ─────────────────────────────────
const ACTION_TEMPLATES = {
  green: {
    claim_now: {
      urgency: "high",
      label: (ctx) => `Claim '${ctx.name}' now`,
      reason: (ctx) => `All ${ctx.availableCount} namespace(s) are available — claim on ${ctx.availableNamespaces} before someone else does.`,
    },
    register_domain: {
      urgency: "medium",
      label: () => "Register matching domains",
      reason: (ctx) => `Register ${ctx.availableDomains} while available.`,
    },
  },
  yellow: {
    recheck_soon: {
      urgency: "medium",
      label: () => "Re-run with broader coverage",
      reason: () => "Re-run with --radar to check for market-usage conflicts and improve coverage.",
    },
    try_alternative: {
      urgency: "medium",
      label: () => "Consider safer alternatives",
      reason: (ctx) => `Consider safer alternatives: ${ctx.top2alternatives}.`,
    },
    consult_counsel: {
      urgency: "low",
      label: () => "Consult a trademark attorney",
      reason: () => "If this name is business-critical, consult a trademark attorney before committing.",
    },
  },
  red: {
    try_alternative: {
      urgency: "high",
      label: () => "Choose a different name",
      reason: (ctx) => `Choose a different name. Suggested: ${ctx.top2alternatives}.`,
    },
    consult_counsel: {
      urgency: "high",
      label: () => "Consult a trademark attorney",
      reason: () => "Consult a trademark attorney before proceeding — direct conflicts exist.",
    },
  },
};

/**
 * Build coaching-oriented next actions based on tier + findings.
 * Distinct from recommendedActions (which are reservation links).
 *
 * @param {{ checks: object[], findings: object[] }} data
 * @param {{ tier: string, candidateName: string, saferAlternatives?: object[], claimLinks?: string[], domainLinks?: string[] }} context
 * @returns {Array<{ type: string, label: string, reason: string, urgency: string, url?: string }>}
 */
export function buildNextActions(data, context) {
  const { checks = [] } = data;
  const { tier, candidateName, saferAlternatives = [], claimLinks = [], domainLinks = [] } = context;
  const actions = [];

  const available = checks.filter((c) => c.status === "available" && !c.query?.isVariant);
  const top2 = saferAlternatives.slice(0, 2).map((a) => a.name).join(", ") || "none generated";

  if (tier === "green") {
    // Claim now
    const availNamespaces = [...new Set(available.map((c) => c.namespace))].join(", ");
    const claimAction = {
      type: "claim_now",
      ...buildAction(ACTION_TEMPLATES.green.claim_now, {
        name: candidateName,
        availableCount: available.length,
        availableNamespaces: availNamespaces || "available namespaces",
      }),
    };
    if (claimLinks.length > 0) {
      claimAction.url = claimLinks[0];
    }
    actions.push(claimAction);

    // Register domain (only if domain channel was checked and domains available)
    const availDomains = available.filter((c) => c.namespace === "domain");
    if (availDomains.length > 0) {
      const domainList = availDomains.map((c) => c.query?.value || "").filter(Boolean).join(", ");
      const domainAction = {
        type: "register_domain",
        ...buildAction(ACTION_TEMPLATES.green.register_domain, {
          availableDomains: domainList || "available domains",
        }),
      };
      if (domainLinks.length > 0) {
        domainAction.url = domainLinks[0];
      }
      actions.push(domainAction);
    }
  } else if (tier === "yellow") {
    // Recheck
    actions.push({
      type: "recheck_soon",
      ...buildAction(ACTION_TEMPLATES.yellow.recheck_soon, {}),
    });

    // Try alternative (only if saferAlternatives present)
    if (saferAlternatives.length > 0) {
      actions.push({
        type: "try_alternative",
        ...buildAction(ACTION_TEMPLATES.yellow.try_alternative, {
          top2alternatives: top2,
        }),
      });
    }

    // Consult counsel
    actions.push({
      type: "consult_counsel",
      ...buildAction(ACTION_TEMPLATES.yellow.consult_counsel, {}),
    });
  } else {
    // RED
    actions.push({
      type: "try_alternative",
      ...buildAction(ACTION_TEMPLATES.red.try_alternative, {
        top2alternatives: top2,
      }),
    });
    actions.push({
      type: "consult_counsel",
      ...buildAction(ACTION_TEMPLATES.red.consult_counsel, {}),
    });
  }

  return actions;
}

function buildAction(template, ctx) {
  return {
    label: template.label(ctx),
    reason: template.reason(ctx),
    urgency: template.urgency,
  };
}

/**
 * Compute coverage score and disclaimer.
 *
 * @param {object[]} checks - All namespace checks
 * @param {string[]} channels - Channels that were requested
 * @returns {{ coverageScore: number, uncheckedNamespaces: string[], disclaimer: string }}
 */
export function computeCoverage(checks, channels) {
  // Filter to non-variant checks only
  const primaryChecks = checks.filter((c) => !c.query?.isVariant);

  const totalPossible = primaryChecks.length || 1;
  const successful = primaryChecks.filter((c) => c.status !== "unknown").length;
  const coverageScore = Math.round((successful / totalPossible) * 100);

  // Unchecked = namespaces where status is unknown
  const uncheckedNamespaces = primaryChecks
    .filter((c) => c.status === "unknown")
    .map((c) => c.namespace)
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .sort();

  const channelList = channels.join(", ");
  const disclaimer =
    `This report checks public namespace availability across ${channelList}. ` +
    `It does not check trademark databases, common-law marks, or pending applications. ` +
    `This is not: a trademark search, a legal opinion, a freedom-to-operate analysis, or a guarantee of rights. ` +
    `Coverage: ${coverageScore}% of requested channels. ` +
    `Consult a trademark attorney for authoritative guidance.`;

  return { coverageScore, uncheckedNamespaces, disclaimer };
}

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
    } else if (c.namespace === "cratesio") {
      claimLinks.push(`https://crates.io/crates/${encodedName}`);
    } else if (c.namespace === "dockerhub") {
      claimLinks.push("https://hub.docker.com/");
    } else if (c.namespace === "huggingface_model" || c.namespace === "huggingface_space") {
      claimLinks.push("https://huggingface.co/new");
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
  const variantTaken = findings.filter((f) => f.kind === "variant_taken");

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

  // Variant-taken: fuzzy edit-distance=1 variant is taken → YELLOW (never RED by itself)
  if (variantTaken.length > 0) {
    reasons.push(
      `Variant taken: ${variantTaken.length} fuzzy variant(s) found in registries`
    );
  }

  const isYellow =
    !isRed &&
    (unknown.length > 0 ||
      nearConflicts.length > 0 ||
      coverageGaps.length > 0 ||
      variantTaken.length > 0 ||
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

  // Collision radar + corpus limitations
  const hasCollisionRadar = checks.some((c) => c.namespace === "custom" && c.details?.source);
  const hasCorpus = data.evidence?.some?.((e) => e.source?.system === "user_corpus");

  if (hasCollisionRadar) {
    limitations.push(
      "Collision radar results are indicative market-usage signals, not trademark searches."
    );
  }
  if (hasCorpus) {
    limitations.push(
      "Corpus comparison is against user-provided marks only, not an exhaustive trademark database."
    );
  }
  if (!hasCollisionRadar && !hasCorpus) {
    limitations.push(
      "No market-usage signal search was performed. Use --radar to enable."
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

  // Extract top factors
  const topFactors = extractTopFactors(data, { tier, candidateName });

  // Generate risk narrative
  const riskNarrative = generateRiskNarrative({ tier, topFactors, candidateName });

  // Build next actions (coaching-oriented, with URLs from reservation links)
  const nextActions = buildNextActions(data, { tier, candidateName, claimLinks, domainLinks });

  // Compute coverage score + disclaimer
  const intakeChannels = data.intake?.channels
    ? checks.map((c) => c.namespace).filter((v, i, a) => a.indexOf(v) === i && !checks.find((cc) => cc.namespace === v && cc.query?.isVariant))
    : [];
  const requestedChannels = data.intake?.riskTolerance
    ? (opts.channels || ["github", "npm", "pypi", "domain"])
    : ["github", "npm", "pypi", "domain"];
  const coverage = computeCoverage(checks, requestedChannels);

  return {
    tier,
    summary,
    reasons,
    assumptions,
    limitations,
    recommendedActions,
    closestConflicts,
    scoreBreakdown,
    topFactors,
    riskNarrative,
    nextActions,
    coverageScore: coverage.coverageScore,
    uncheckedNamespaces: coverage.uncheckedNamespaces,
    disclaimer: coverage.disclaimer,
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

    // Collision radar checks (custom namespace with similarity details):
    // Produce near_conflict or phonetic_conflict based on similarity scores.
    // These are NOT exact conflicts — they are indicative market-usage signals.
    if (check.namespace === "custom" && check.details?.similarity) {
      const comparison = check.details.similarity;
      const source = check.details.source || "unknown";

      let kind = "near_conflict";
      let severity = "medium";

      if (comparison.sounds?.score >= 0.85) {
        kind = "phonetic_conflict";
        severity = "high";
      } else if (comparison.overall >= 0.85) {
        kind = "near_conflict";
        severity = "high";
      }

      findings.push({
        id: `fd.${kind.replace(/_/g, "-")}.${check.namespace}.${findingIdx}`,
        candidateMark,
        kind,
        summary: `Name "${check.query.value}" is in use (${source}), similarity: ${comparison.overall?.toFixed(2) || "?"}`,
        severity,
        score: Math.round((comparison.overall || 0) * 100),
        why: [
          ...(comparison.why || []),
          `Market usage signal from ${source}`,
        ],
        evidenceRefs: check.evidenceRef ? [check.evidenceRef] : [],
      });
      findingIdx++;
      continue;
    }

    // Exact conflict: name is taken in this namespace (authoritative checks)
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

  // Variant-taken: base name available but fuzzy edit-distance=1 variant is taken.
  // These come from checks where query.isVariant === true.
  const variantTakenChecks = checks.filter(
    (c) => c.query?.isVariant && c.status === "taken"
  );
  for (const c of variantTakenChecks) {
    findings.push({
      id: `fd.variant-taken.${c.namespace}.${findingIdx}`,
      candidateMark: c.query.originalCandidate || c.query.candidateMark,
      kind: "variant_taken",
      summary: `Fuzzy variant "${c.query.value}" is taken in ${c.namespace}`,
      severity: "medium",
      score: 60,
      why: [
        `Edit-distance=1 variant "${c.query.value}" exists in ${c.namespace}`,
        "Typosquatting or confusion risk",
      ],
      evidenceRefs: c.evidenceRef ? [c.evidenceRef] : [],
    });
    findingIdx++;
  }

  return findings;
}
