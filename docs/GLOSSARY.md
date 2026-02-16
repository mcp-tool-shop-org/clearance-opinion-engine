# Glossary

## intake
The input specification for a clearance run. Contains candidates, goods/services description, geographies, channels, and risk tolerance.

## candidate
A proposed name (word mark) to check for availability and clearance.

## channel
A distribution channel for the name (e.g., SaaS, GitHub, app-store, open-source).

## variant
An alternative form of a candidate name. Types include: normalized, tokenized, phonetic, and homoglyph.

## variantSet
All generated variant forms for a single candidate name, plus any warnings.

## namespaceCheck
The result of checking a specific namespace (GitHub org, npm package, PyPI package, domain) for name availability. Contains status (available/taken/unknown), authority level, and claimability.

## finding
A classified observation about a candidate name. Types:
- **exact_conflict**: Name is taken in a namespace
- **near_conflict**: Similar name exists
- **phonetic_conflict**: Name sounds similar to a taken name
- **confusable_risk**: Homoglyph variants could cause identity confusion
- **coverage_gap**: A namespace was not checked

## evidence
A recorded observation from an adapter. Contains source system, URL, SHA-256 hash, timestamp, and reproduction steps. Every finding traces back to evidence.

## opinion
The engine's assessment of name clearance. Tiers:
- **GREEN**: All namespaces available, no conflicts
- **YELLOW**: Some checks inconclusive or minor concerns
- **RED**: Direct conflicts or high-risk confusable variants

## scoreBreakdown
Explainable sub-scores that explain why a particular tier was assigned. Includes namespace availability, coverage completeness, conflict severity, and domain availability scores with weights. The overall score is a weighted average. Note: the tier is still rule-based (exact conflicts always produce RED regardless of score).

## manifest
A SHA-256 lockfile for run artifacts. Records file paths, sizes, and hashes for tamper detection and reproducibility.

## run
A single execution of the clearance engine. Contains a stable run ID, engine version, timestamp, and input hash.

## authority
How reliable a namespace check is:
- **authoritative**: Direct check against the canonical source (e.g., GitHub API 200/404, RDAP 200/404)
- **indicative**: Indirect or unreliable result (e.g., network error, third-party source)

## claimability
Whether a namespace can be immediately claimed:
- **claimable_now**: Available and can be registered immediately (e.g., domain available via RDAP)
- **not_claimable**: Currently registered or otherwise unavailable
- **unknown**: Cannot determine claimability

## RDAP
Registration Data Access Protocol (RFC 9083). The IETF-standard successor to WHOIS for domain registration data. Returns structured JSON, supports HTTPS, and requires no API key.

## attorney packet
A self-contained HTML report suitable for sharing with counsel. Includes the full opinion, score breakdown, namespace checks, findings, evidence chain, and recommended actions with links. Dark theme, zero external dependencies.

## replay
The `coe replay <dir>` command. Reads a `run.json`, verifies the manifest (if present), and regenerates all outputs to verify determinism.

## reservation hooks
Dry-run links populated on recommended actions. Point to registrar search pages, GitHub new-repo pages, or npm package pages. All are user-triggered — no auto-purchase.

## error codes
All errors use the prefix `COE.<CATEGORY>.<TYPE>`:
- `COE.INIT.*` — initialization/CLI errors
- `COE.ADAPTER.*` — adapter/network errors
- `COE.VARIANT.*` — variant generation errors
- `COE.OPINION.*` — scoring errors
- `COE.RENDER.*` — output rendering errors
- `COE.LOCK.*` — lockfile verification errors
- `COE.REPLAY.*` — replay verification errors
