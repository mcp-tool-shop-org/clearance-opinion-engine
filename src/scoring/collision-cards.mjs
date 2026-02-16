/**
 * Collision explanation cards.
 *
 * Builds a deterministic array of user-facing "collision cards"
 * from typed findings. Each card explains one collision type
 * with a title, why-it-matters sentence, and evidence links.
 *
 * All text is from static templates — no LLM, no external text.
 */

const SEVERITY_ORDER = { critical: 0, major: 1, moderate: 2, minor: 3 };
const MAX_CARDS = 6;

const CARD_TEMPLATES = {
  variant_taken: {
    title: (ctx) => `Fuzzy variant "${ctx.name}" is taken on ${ctx.namespace}`,
    whyItMatters: "Users who mistype the name will land on an existing package, creating confusion and typosquatting risk.",
  },
  looks_like: {
    title: (ctx) => `Visually similar to "${ctx.name}"`,
    whyItMatters: "At a glance, users may confuse the two names. Marketing materials, URLs, and package listings become ambiguous.",
  },
  sounds_like: {
    title: (ctx) => `Sounds like "${ctx.name}"`,
    whyItMatters: "Verbal recommendations become unreliable. Listeners may install the wrong package.",
  },
  confusable_chars: {
    title: (ctx) => `Confusable characters overlap with "${ctx.name}"`,
    whyItMatters: "Homoglyph substitution makes visual identification unreliable and enables impersonation attacks.",
  },
  market_signal: {
    title: (ctx) => `Market-usage signal: "${ctx.name}" on ${ctx.source}`,
    whyItMatters: "An existing project uses a similar name. While not an authoritative registry claim, it signals namespace crowding.",
  },
};

const KIND_MAP = {
  variant_taken: "variant_taken",
  near_conflict: "looks_like",
  phonetic_conflict: "sounds_like",
  confusable_risk: "confusable_chars",
};

function mapSeverity(findingSeverity) {
  if (findingSeverity === "high") return "critical";
  if (findingSeverity === "medium") return "major";
  return "moderate";
}

function extractConflictName(finding) {
  const match = finding.summary?.match(/"([^"]+)"/);
  return match?.[1] || finding.candidateMark || "unknown";
}

function extractNamespace(finding, checks) {
  if (finding.evidenceRefs?.[0]) {
    const check = checks.find((c) => c.evidenceRef === finding.evidenceRefs[0]);
    if (check) return check.namespace;
  }
  const match = finding.summary?.match(/(?:in|on) (\S+)$/);
  return match?.[1] || "unknown";
}

function extractSource(finding, checks) {
  if (finding.evidenceRefs?.[0]) {
    const check = checks.find((c) => c.evidenceRef === finding.evidenceRefs[0]);
    if (check?.details?.source) return check.details.source;
  }
  return "unknown";
}

/**
 * Build collision explanation cards from findings and checks.
 *
 * @param {object[]} findings - Classified findings from classifyFindings()
 * @param {object[]} checks - Namespace check results
 * @returns {Array<{ kind: string, title: string, whyItMatters: string, evidence: object[], severity: string }>}
 */
export function buildCollisionCards(findings, checks) {
  const cards = [];
  const seen = new Set();

  for (const f of findings) {
    if (f.kind === "exact_conflict" || f.kind === "coverage_gap") continue;

    let cardKind = KIND_MAP[f.kind];

    // Distinguish market_signal from looks_like for near_conflict
    if (f.kind === "near_conflict") {
      const isMarket = f.why?.some((w) => w.includes("Market usage signal"));
      if (isMarket) cardKind = "market_signal";
    }

    if (!cardKind || !CARD_TEMPLATES[cardKind]) continue;

    const name = extractConflictName(f);
    const namespace = extractNamespace(f, checks);
    const source = extractSource(f, checks);

    const dedupKey = `${cardKind}:${name}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    // Build evidence from finding's evidenceRefs
    const evidenceItems = [];
    for (const ref of f.evidenceRefs || []) {
      const check = checks.find((c) => c.evidenceRef === ref);
      if (check) {
        evidenceItems.push({
          namespace: check.namespace,
          name: check.query?.value || name,
          ...(check.details?.url ? { url: check.details.url } : {}),
        });
      }
    }
    if (evidenceItems.length === 0) {
      evidenceItems.push({ namespace, name });
    }

    const template = CARD_TEMPLATES[cardKind];
    const ctx = { name, namespace, source };

    cards.push({
      kind: cardKind,
      title: template.title(ctx),
      whyItMatters: template.whyItMatters,
      evidence: evidenceItems,
      severity: mapSeverity(f.severity),
    });
  }

  // Sort: severity first, then stable key
  cards.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99;
    const sb = SEVERITY_ORDER[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    const ka = `${a.kind}:${a.evidence[0]?.name || ""}`;
    const kb = `${b.kind}:${b.evidence[0]?.name || ""}`;
    return ka.localeCompare(kb);
  });

  return cards.slice(0, MAX_CARDS);
}
