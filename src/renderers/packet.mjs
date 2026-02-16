/**
 * Attorney-packet renderer for clearance-opinion-engine.
 *
 * Produces a self-contained HTML report and a summary JSON
 * from a run object. The HTML is fully inline (no external deps).
 *
 * Security: All user-provided strings are HTML-escaped.
 */

import { escapeHtml, escapeAttr } from "./html-escape.mjs";
import { checkFreshness } from "../lib/freshness.mjs";

// ── CSS ────────────────────────────────────────────────────────

const INLINE_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  line-height: 1.6;
  padding: 2rem;
  max-width: 960px;
  margin: 0 auto;
}
h1 { font-size: 1.6rem; margin-bottom: 0.5rem; color: #fff; }
h2 { font-size: 1.3rem; margin: 1.5rem 0 0.75rem; color: #ccc; border-bottom: 1px solid #333; padding-bottom: 0.3rem; }
.meta { font-size: 0.85rem; color: #888; margin-bottom: 1.5rem; }
.opinion-banner {
  padding: 1.2rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}
.opinion-banner.green { background: #2d6a4f; }
.opinion-banner.yellow { background: #b5651d; }
.opinion-banner.red { background: #9d0208; }
.opinion-banner h2 { color: #fff; border: none; margin: 0 0 0.5rem; padding: 0; font-size: 1.4rem; }
.opinion-banner p { color: #f0f0f0; margin: 0; }
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
th, td {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border: 1px solid #333;
}
th { background: #16213e; color: #ccc; }
tr:nth-child(even) { background: #1e1e3a; }
tr:nth-child(odd) { background: #1a1a2e; }
.finding-card {
  background: #16213e;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}
.finding-card .severity { font-weight: bold; }
.finding-card .severity.high { color: #ff6b6b; }
.finding-card .severity.medium { color: #ffd93d; }
.finding-card .severity.low { color: #6bcb77; }
.action-card {
  background: #16213e;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}
.action-card a { color: #64b5f6; text-decoration: none; }
.action-card a:hover { text-decoration: underline; }
.overall-score {
  font-size: 1.2rem;
  font-weight: bold;
  margin: 0.75rem 0;
  color: #fff;
}
code, .mono { font-family: "Cascadia Code", "Fira Code", monospace; font-size: 0.85rem; color: #aaa; }
footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #333;
  font-size: 0.8rem;
  color: #666;
}
ul { list-style: disc; margin-left: 1.5rem; margin-bottom: 0.75rem; }
li { margin-bottom: 0.25rem; }
`.trim();

// ── Helpers ────────────────────────────────────────────────────

function tierEmoji(tier) {
  if (tier === "green") return "\u{1F7E2}";
  if (tier === "yellow") return "\u{1F7E1}";
  return "\u{1F534}";
}

function statusIcon(status) {
  if (status === "available") return "\u2705";
  if (status === "taken") return "\u274C";
  return "\u2753";
}

function severityLabel(severity) {
  if (severity === "high") return "\u{1F534} HIGH";
  if (severity === "medium") return "\u{1F7E1} MEDIUM";
  return "\u{1F7E2} LOW";
}

// ── HTML Renderer ──────────────────────────────────────────────

/**
 * Render a complete attorney-packet HTML page from a run object.
 *
 * @param {object} run - Complete run object
 * @returns {string} Complete HTML document string
 */
export function renderPacketHtml(run) {
  const opinion = run.opinion || {};
  const tier = opinion.tier || "unknown";
  const candidateNames = run.intake?.candidates?.map((c) => c.mark).join(", ") || "unknown";
  const breakdown = opinion.scoreBreakdown || {};

  const lines = [];
  lines.push("<!DOCTYPE html>");
  lines.push('<html lang="en">');
  lines.push("<head>");
  lines.push('<meta charset="UTF-8">');
  lines.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`<title>Clearance Report: ${escapeHtml(candidateNames)}</title>`);
  lines.push(`<style>${INLINE_CSS}</style>`);
  lines.push("</head>");
  lines.push("<body>");

  // Header
  lines.push("<header>");
  lines.push(`<h1>Clearance Opinion Report</h1>`);
  lines.push(`<div class="meta">Engine v${escapeHtml(run.run?.engineVersion || "unknown")} | Run <code>${escapeHtml(run.run?.runId || "unknown")}</code> | ${escapeHtml(run.run?.createdAt || "unknown")}</div>`);
  lines.push("</header>");

  // Opinion banner
  lines.push(`<section class="opinion-banner ${escapeAttr(tier)}">`);
  lines.push(`<h2>${tierEmoji(tier)} ${escapeHtml(tier.toUpperCase())} &mdash; ${escapeHtml(candidateNames)}</h2>`);
  lines.push(`<p>${escapeHtml(opinion.summary || "")}</p>`);
  lines.push("</section>");

  // Freshness warning banner (conditional)
  {
    const freshness = checkFreshness(run, { maxAgeHours: 24 });
    if (freshness.isStale) {
      lines.push('<section class="opinion-banner yellow">');
      lines.push(`<h2>\u26A0\uFE0F Freshness Warning</h2>`);
      lines.push(`<p>${escapeHtml(freshness.banner)}</p>`);
      lines.push("</section>");
    }
  }

  // Executive Summary
  {
    const availableCount = (run.checks || []).filter((c) => c.status === "available").length;
    const takenCount = (run.checks || []).filter((c) => c.status === "taken").length;
    const unknownCount = (run.checks || []).filter((c) => c.status === "unknown").length;
    const totalChecks = (run.checks || []).length;
    const findingsCount = (run.findings || []).length;

    lines.push('<section class="executive-summary">');
    lines.push("<h2>Executive Summary</h2>");
    lines.push("<table>");
    lines.push("<tr><th>Metric</th><th>Value</th></tr>");
    lines.push(`<tr><td>Tier</td><td>${tierEmoji(tier)} ${escapeHtml(tier.toUpperCase())}</td></tr>`);
    if (breakdown.overallScore !== undefined) {
      lines.push(`<tr><td>Overall Score</td><td>${breakdown.overallScore}/100</td></tr>`);
    }
    lines.push(`<tr><td>Namespaces Checked</td><td>${totalChecks}</td></tr>`);
    lines.push(`<tr><td>Available</td><td>${availableCount}</td></tr>`);
    lines.push(`<tr><td>Taken</td><td>${takenCount}</td></tr>`);
    lines.push(`<tr><td>Unknown</td><td>${unknownCount}</td></tr>`);
    lines.push(`<tr><td>Findings</td><td>${findingsCount}</td></tr>`);
    lines.push("</table>");

    if (opinion.recommendedActions?.length > 0) {
      lines.push(`<p><strong>Top Action:</strong> ${escapeHtml(opinion.recommendedActions[0].label)}</p>`);
    }
    if (opinion.closestConflicts?.length > 0) {
      const topConflicts = opinion.closestConflicts.slice(0, 2);
      lines.push("<p><strong>Top Conflicts:</strong></p>");
      lines.push("<ul>");
      for (const cc of topConflicts) {
        lines.push(`<li>${escapeHtml(cc.mark)} (${escapeHtml(cc.severity)})</li>`);
      }
      lines.push("</ul>");
    }
    lines.push("</section>");
  }

  // Coverage Matrix
  {
    lines.push('<section class="coverage-matrix">');
    lines.push("<h2>Coverage Matrix</h2>");
    lines.push("<table>");
    lines.push("<tr><th>Source</th><th>Namespace</th><th>Status</th><th>Authority</th></tr>");
    if (run.checks?.length > 0) {
      for (const c of run.checks) {
        const source = c.details?.source || c.namespace;
        const cacheTag = c.cacheHit ? " (cached)" : "";
        lines.push(`<tr><td>${escapeHtml(source)}</td><td>${escapeHtml(c.namespace)}</td><td>${statusIcon(c.status)} ${escapeHtml(c.status)}${cacheTag}</td><td>${escapeHtml(c.authority)}</td></tr>`);
      }
    }
    lines.push("</table>");
    lines.push("</section>");
  }

  // Score Breakdown ("Why This Tier?")
  if (breakdown.overallScore !== undefined) {
    lines.push('<section class="score-breakdown">');
    lines.push("<h2>Why This Tier?</h2>");
    lines.push("<table>");
    lines.push("<tr><th>Factor</th><th>Score</th><th>Weight</th><th>Details</th></tr>");

    const factors = [
      ["Namespace Availability", breakdown.namespaceAvailability],
      ["Coverage Completeness", breakdown.coverageCompleteness],
      ["Conflict Severity", breakdown.conflictSeverity],
      ["Domain Availability", breakdown.domainAvailability],
    ];

    for (const [label, sub] of factors) {
      if (sub) {
        lines.push(`<tr><td>${escapeHtml(label)}</td><td>${sub.score}/100</td><td>${sub.weight}%</td><td>${escapeHtml(sub.details)}</td></tr>`);
      }
    }
    lines.push("</table>");
    lines.push(`<div class="overall-score">Overall Score: ${breakdown.overallScore}/100`);
    if (breakdown.tierThresholds) {
      lines.push(` (Green &ge; ${breakdown.tierThresholds.green}, Yellow &ge; ${breakdown.tierThresholds.yellow})`);
    }
    lines.push("</div>");
    lines.push("</section>");
  }

  // Reasons
  if (opinion.reasons?.length > 0) {
    lines.push("<section>");
    lines.push("<h2>Reasons</h2>");
    lines.push("<ul>");
    for (const r of opinion.reasons) {
      lines.push(`<li>${escapeHtml(r)}</li>`);
    }
    lines.push("</ul>");
    lines.push("</section>");
  }

  // Namespace Checks
  if (run.checks?.length > 0) {
    lines.push('<section class="namespace-checks">');
    lines.push("<h2>Namespace Checks</h2>");
    lines.push("<table>");
    lines.push("<tr><th>Namespace</th><th>Name</th><th>Status</th><th>Authority</th></tr>");
    for (const c of run.checks) {
      lines.push(`<tr><td>${escapeHtml(c.namespace)}</td><td><code>${escapeHtml(c.query?.value || "")}</code></td><td>${statusIcon(c.status)} ${escapeHtml(c.status)}</td><td>${escapeHtml(c.authority)}</td></tr>`);
    }
    lines.push("</table>");
    lines.push("</section>");
  }

  // Findings
  if (run.findings?.length > 0) {
    lines.push('<section class="findings">');
    lines.push("<h2>Findings</h2>");
    for (const f of run.findings) {
      lines.push('<div class="finding-card">');
      lines.push(`<div><span class="severity ${escapeAttr(f.severity)}">${severityLabel(f.severity)}</span> &mdash; <strong>${escapeHtml(f.kind)}</strong></div>`);
      lines.push(`<div>${escapeHtml(f.summary)}</div>`);
      if (f.why?.length > 0) {
        lines.push("<ul>");
        for (const w of f.why) {
          lines.push(`<li>${escapeHtml(w)}</li>`);
        }
        lines.push("</ul>");
      }
      lines.push("</div>");
    }
    lines.push("</section>");
  }

  // Collision Radar Signals (conditional)
  {
    const radarChecks = (run.checks || []).filter(
      (c) => c.namespace === "custom" && (c.details?.source === "github_search" || c.details?.source === "npm_search")
    );
    if (radarChecks.length > 0) {
      lines.push('<section class="collision-radar">');
      lines.push("<h2>Collision Radar Signals</h2>");
      lines.push("<p><em>Indicative market-usage signals &mdash; not authoritative trademark searches.</em></p>");
      lines.push("<table>");
      lines.push("<tr><th>Source</th><th>Name</th><th>Similarity</th><th>Looks</th><th>Sounds</th></tr>");
      for (const c of radarChecks) {
        const sim = c.details?.similarity;
        const simScore = sim?.overall !== undefined ? `${(sim.overall * 100).toFixed(0)}%` : "-";
        const source = escapeHtml(c.details?.source || "unknown");
        const name = escapeHtml(c.query?.value || "");
        const looksLabel = escapeHtml(sim?.looks?.label || "-");
        const soundsLabel = escapeHtml(sim?.sounds?.label || "-");
        lines.push(`<tr><td>${source}</td><td><code>${name}</code></td><td>${simScore}</td><td>${looksLabel}</td><td>${soundsLabel}</td></tr>`);
      }
      lines.push("</table>");
      lines.push("</section>");
    }
  }

  // Corpus Comparison (conditional)
  {
    const corpusEvidence = (run.evidence || []).filter(
      (e) => e.source?.system === "user_corpus"
    );
    const corpusFindings = (run.findings || []).filter(
      (f) => f.why?.some((w) => w.includes("Commercial impression"))
    );
    if (corpusEvidence.length > 0 || corpusFindings.length > 0) {
      lines.push('<section class="corpus-comparison">');
      lines.push("<h2>Corpus Comparison</h2>");
      lines.push("<p><em>Comparison against user-provided known marks.</em></p>");
      if (corpusFindings.length > 0) {
        for (const f of corpusFindings) {
          lines.push('<div class="finding-card">');
          lines.push(`<div><span class="severity ${escapeAttr(f.severity)}">${severityLabel(f.severity)}</span> &mdash; <strong>${escapeHtml(f.kind)}</strong></div>`);
          lines.push(`<div>${escapeHtml(f.summary)}</div>`);
          if (f.why?.length > 0) {
            lines.push("<ul>");
            for (const w of f.why) {
              lines.push(`<li>${escapeHtml(w)}</li>`);
            }
            lines.push("</ul>");
          }
          lines.push("</div>");
        }
      } else {
        lines.push("<p>No similar marks found in the provided corpus.</p>");
      }
      lines.push("</section>");
    }
  }

  // Fuzzy Variants Checked (conditional)
  {
    const fuzzyChecks = (run.checks || []).filter((c) => c.query?.isVariant);
    if (fuzzyChecks.length > 0) {
      lines.push('<section class="fuzzy-variants">');
      lines.push("<h2>Fuzzy Variants Checked</h2>");
      lines.push("<p><em>Edit-distance=1 variants queried against registries for typosquatting risk.</em></p>");
      lines.push("<table>");
      lines.push("<tr><th>Variant</th><th>Registry</th><th>Status</th></tr>");
      for (const c of fuzzyChecks) {
        lines.push(`<tr><td><code>${escapeHtml(c.query?.value || "")}</code></td><td>${escapeHtml(c.namespace)}</td><td>${statusIcon(c.status)} ${escapeHtml(c.status)}</td></tr>`);
      }
      lines.push("</table>");
      lines.push("</section>");
    }
  }

  // Evidence Chain
  if (run.evidence?.length > 0) {
    lines.push('<section class="evidence">');
    lines.push("<h2>Evidence Chain</h2>");
    lines.push("<table>");
    lines.push("<tr><th>ID</th><th>Type</th><th>System</th><th>URL</th><th>SHA-256</th></tr>");
    for (const e of run.evidence) {
      const url = e.source?.url || "-";
      const sha = e.sha256 ? `${e.sha256.slice(0, 12)}...` : "-";
      lines.push(`<tr><td><code>${escapeHtml(e.id)}</code></td><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.source?.system || "-")}</td><td><code>${escapeHtml(url)}</code></td><td><code>${escapeHtml(sha)}</code></td></tr>`);
    }
    lines.push("</table>");
    lines.push("</section>");
  }

  // Recommended Actions
  if (opinion.recommendedActions?.length > 0) {
    lines.push('<section class="recommended-actions">');
    lines.push("<h2>Recommended Actions</h2>");
    for (const a of opinion.recommendedActions) {
      lines.push('<div class="action-card">');
      lines.push(`<div><strong>${escapeHtml(a.label)}</strong> (<code>${escapeHtml(a.type)}</code>)</div>`);
      if (a.details) {
        lines.push(`<div>${escapeHtml(a.details)}</div>`);
      }
      if (a.links?.length > 0) {
        lines.push("<ul>");
        for (const link of a.links) {
          lines.push(`<li><a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a></li>`);
        }
        lines.push("</ul>");
      }
      lines.push("</div>");
    }
    lines.push("</section>");
  }

  // Variants
  if (run.variants?.items?.length > 0) {
    lines.push("<section>");
    lines.push("<h2>Variants Checked</h2>");
    for (const vs of run.variants.items) {
      lines.push(`<h3><code>${escapeHtml(vs.candidateMark)}</code> (canonical: <code>${escapeHtml(vs.canonical)}</code>)</h3>`);
      lines.push("<table>");
      lines.push("<tr><th>Type</th><th>Value</th></tr>");
      for (const f of vs.forms) {
        lines.push(`<tr><td>${escapeHtml(f.type)}</td><td><code>${escapeHtml(f.value)}</code></td></tr>`);
      }
      lines.push("</table>");
    }
    lines.push("</section>");
  }

  // Assumptions & Limitations
  if (opinion.assumptions?.length > 0) {
    lines.push("<section>");
    lines.push("<h2>Assumptions</h2>");
    lines.push("<ul>");
    for (const a of opinion.assumptions) {
      lines.push(`<li>${escapeHtml(a)}</li>`);
    }
    lines.push("</ul>");
    lines.push("</section>");
  }

  if (opinion.limitations?.length > 0) {
    lines.push("<section>");
    lines.push("<h2>Limitations</h2>");
    lines.push("<ul>");
    for (const l of opinion.limitations) {
      lines.push(`<li>${escapeHtml(l)}</li>`);
    }
    lines.push("</ul>");
    lines.push("</section>");
  }

  // Footer
  lines.push("<footer>");
  lines.push("<p>This report is an automated opinion based on namespace availability checks. It is not legal advice.</p>");
  lines.push(`<p>Inputs SHA-256: <code>${escapeHtml(run.run?.inputsSha256 || "unknown")}</code></p>`);
  lines.push("</footer>");

  lines.push("</body>");
  lines.push("</html>");

  return lines.join("\n");
}

// ── Summary JSON Renderer ──────────────────────────────────────

/**
 * Render a summary JSON for the attorney packet.
 *
 * @param {object} run - Complete run object
 * @returns {object} Summary object (not stringified)
 */
export function renderSummaryJson(run) {
  const opinion = run.opinion || {};
  const candidateNames = run.intake?.candidates?.map((c) => c.mark) || [];

  // Build findings summary
  const findingsSummary = { total: 0, byKind: {} };
  if (run.findings) {
    findingsSummary.total = run.findings.length;
    for (const f of run.findings) {
      findingsSummary.byKind[f.kind] = (findingsSummary.byKind[f.kind] || 0) + 1;
    }
  }

  // Build namespace status table
  const namespaces = (run.checks || []).map((c) => ({
    namespace: c.namespace,
    query: c.query?.value || "",
    status: c.status,
    authority: c.authority,
  }));

  // Count collision radar signals (custom namespace checks from github_search or npm_search)
  const collisionRadarCount = (run.checks || []).filter(
    (c) => c.namespace === "custom" && (c.details?.source === "github_search" || c.details?.source === "npm_search")
  ).length;

  // Count corpus matches (findings with "Commercial impression" in why[])
  const corpusMatchCount = (run.findings || []).filter(
    (f) => f.why?.some((w) => w.includes("Commercial impression"))
  ).length;

  // Count fuzzy variants that are taken
  const fuzzyVariantsTaken = (run.findings || []).filter(
    (f) => f.kind === "variant_taken"
  ).length;

  return {
    generatedAt: run.run?.createdAt || new Date().toISOString(),
    engineVersion: run.run?.engineVersion || "unknown",
    runId: run.run?.runId || "unknown",
    candidates: candidateNames,
    tier: opinion.tier || "unknown",
    overallScore: opinion.scoreBreakdown?.overallScore ?? null,
    scoreBreakdown: opinion.scoreBreakdown || null,
    namespaces,
    findingsSummary,
    collisionRadarCount,
    corpusMatchCount,
    fuzzyVariantsTaken,
    recommendedActions: opinion.recommendedActions || [],
    inputsSha256: run.run?.inputsSha256 || "unknown",
  };
}
