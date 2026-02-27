# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-02-27

### Added
- SECURITY.md with vulnerability reporting and data scope
- SHIP_GATE.md quality gates (all hard gates pass)
- SCORECARD.md with pre/post remediation scores
- Security & Data Scope section in README
- `verify` script in package.json
- CHANGELOG.md to npm package files

### Changed
- Promoted from v0.9.0 to v1.0.0 (stable release)

## [0.9.0] - 2026-02-16

### Added
- Artifact schemas: `schema/summary.schema.json` and `schema/index-entry.schema.json`
- `coe validate-artifacts <dir>` command for offline artifact validation
- `schemaVersion` and `formatVersion` fields on `summary.json` output
- `schemaVersion` field on index entries in `runs.json`
- Collision explanation cards (`collisionCards[]`) on opinion output
- Collision cards rendered in summary.json, Markdown reports, and HTML attorney packet
- `CHANGELOG.md` (this file)
- `docs/VERSIONING.md` with artifact compatibility policy

### Changed
- Opinion object now includes `collisionCards` array (empty for GREEN, populated for YELLOW/RED)
- `clearance.schema.json` updated with `collisionCard` and `collisionEvidence` definitions

## [0.8.0] - 2026-02-16

### Added
- `coe publish --index <path>` flag for automatic runs.json index management
- `COE_CACHE_DIR` environment variable fallback for `--cache-dir`
- `scanForSecrets()` defense-in-depth check before writing clearance-index.json
- Friendly error messages mapping system errors to user-friendly hints
- `run.json` added to publishable files list

### Changed
- `nextActions` for GREEN tier now include `url` field linking to reservation pages

## [0.7.0] - 2026-02-15

### Added
- Next actions coaching output (2-4 steps per tier)
- Coverage score (0-100%) and unchecked namespaces tracking
- Legal disclaimer on every opinion
- Reservation links on recommended actions

## [0.6.0] - 2026-02-14

### Added
- Top factors extraction (3-5 weighted factors per opinion)
- Risk narrative generation (deterministic template-based)
- DuPont-Lite analysis (similarity, channel overlap, fame proxy, intent proxy)
- Safer alternative name suggestions (5 strategies)

## [0.5.0] - 2026-02-13

### Added
- Batch mode with concurrency control and cost tracking
- Freshness detection and `coe refresh` command
- Batch resume via `--resume` flag
- Corpus CLI (`coe corpus init`, `coe corpus add`)
- `coe publish` command for website consumption
- Adaptive backoff for rate-limited registries
- Fuzzy edit-distance=1 variant generation and registry querying

## [0.4.0] - 2026-02-12

### Added
- crates.io, Docker Hub, and Hugging Face adapters
- Channel groups (core, dev, ai, all) and additive syntax

## [0.3.0] - 2026-02-11

### Added
- Collision radar (GitHub + npm search for similar names)
- Corpus comparison against user-provided known marks
- Disk caching for adapter responses

## [0.2.0] - 2026-02-10

### Added
- Domain RDAP checks (.com, .dev)
- Explainable score breakdown with weighted sub-scores
- HTML attorney packet with evidence chain
- `coe replay` command for determinism verification

## [0.1.0] - 2026-02-09

### Added
- Initial release
- GitHub org/repo, npm, and PyPI namespace checks
- Variant generation (normalized, tokenized, phonetic, homoglyph)
- Opinion scoring (GREEN/YELLOW/RED tiers)
- Markdown and JSON output formats
