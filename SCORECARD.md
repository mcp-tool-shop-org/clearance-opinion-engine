# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** clearance-opinion-engine
**Date:** 2026-02-27
**Type tags:** [npm] [cli]

## Pre-Remediation Assessment

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 7/10 | No SECURITY.md, but Safety section in README covers key points |
| B. Error Handling | 10/10 | 30+ namespaced error codes, structured hints, evidence redaction |
| C. Operator Docs | 9/10 | Excellent README, CHANGELOG, RUNBOOK, LIMITATIONS, ARCHITECTURE docs |
| D. Shipping Hygiene | 7/10 | CI exists, no verify script, pre-1.0 |
| E. Identity (soft) | 10/10 | Logo, translations, landing page, npm badge |
| **Overall** | **43/50** | |

## Key Gaps

1. No SECURITY.md — no formal vulnerability reporting process
2. No verify script
3. Version at 0.9.0 — needs promotion to 1.0.0

## Remediation Priority

| Priority | Item | Estimated effort |
|----------|------|-----------------|
| 1 | Create SECURITY.md + threat model in README | 5 min |
| 2 | Add verify script, bump to 1.0.0 | 5 min |
| 3 | Add SHIP_GATE.md + SCORECARD.md | 5 min |

## Post-Remediation

| Category | Before | After |
|----------|--------|-------|
| A. Security | 7/10 | 10/10 |
| B. Error Handling | 10/10 | 10/10 |
| C. Operator Docs | 9/10 | 10/10 |
| D. Shipping Hygiene | 7/10 | 10/10 |
| E. Identity (soft) | 10/10 | 10/10 |
| **Overall** | **43/50** | **50/50** |
