<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/clearance-opinion-engine/readme.png" width="400" alt="Clearance Opinion Engine" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/clearance-opinion-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/clearance-opinion-engine/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/clearance-opinion-engine"><img src="https://img.shields.io/npm/v/@mcptoolshop/clearance-opinion-engine" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" /></a>
  <a href="https://mcp-tool-shop-org.github.io/clearance-opinion-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page" /></a>
</p>

Deterministic "name availability + clearance opinion" engine.

Given a candidate name, it checks real namespace availability (GitHub org/repo, npm, PyPI, domain via RDAP, crates.io, Docker Hub, Hugging Face), generates linguistic variants (normalized, tokenized, phonetic, homoglyph, fuzzy edit-distance=1), scans for similar names via collision radar (GitHub + npm search), queries registries for fuzzy variant conflicts, compares against user-provided known marks, and produces a conservative clearance opinion (GREEN / YELLOW / RED) with an explainable score breakdown, executive summary, coverage matrix, and full evidence chain.

---

## Truth contract

- **Same inputs + same adapter responses = byte-identical output.**
- Every check produces an `evidence` object with SHA-256, timestamp, and reproduction steps.
- Opinions are conservative: GREEN only when _all_ namespace checks are clean _and_ no phonetic/homoglyph collisions exist.
- The engine never sends, publishes, or modifies anything. It only reads and reports.
- Score breakdowns explain _why_ a tier was assigned but never override the rule-based tier logic.

---

## What it checks

| Channel | Namespace | Method |
|---------|-----------|--------|
| GitHub  | Org name  | `GET /orgs/{name}` → 404 = available |
| GitHub  | Repo name | `GET /repos/{owner}/{name}` → 404 = available |
| npm     | Package   | `GET https://registry.npmjs.org/{name}` → 404 = available |
| PyPI    | Package   | `GET https://pypi.org/pypi/{name}/json` → 404 = available |
| Domain  | `.com`, `.dev` | RDAP (RFC 9083) via `rdap.org` → 404 = available |
| crates.io | Crate   | `GET https://crates.io/api/v1/crates/{name}` → 404 = available |
| Docker Hub | Repo   | `GET https://hub.docker.com/v2/repositories/{ns}/{name}` → 404 = available |
| Hugging Face | Model | `GET https://huggingface.co/api/models/{owner}/{name}` → 404 = available |
| Hugging Face | Space | `GET https://huggingface.co/api/spaces/{owner}/{name}` → 404 = available |

### Channel groups

| Group | Channels |
|-------|----------|
| `core` (default) | github, npm, pypi, domain |
| `dev` | cratesio, dockerhub |
| `ai` | huggingface |
| `all` | all channels |

Use `--channels <group>` for presets, or `--channels +cratesio,+dockerhub` for additive syntax (adds to default).

### Indicative signals (opt-in)

| Source | What it searches | Method |
|--------|-----------------|--------|
| Collision Radar | GitHub repos | `GET /search/repositories?q={name}` → similarity scoring |
| Collision Radar | npm packages | `GET /-/v1/search?text={name}` → similarity scoring |
| Collision Radar | crates.io crates | `GET https://crates.io/api/v1/crates?q={name}` → similarity scoring |
| Collision Radar | Docker Hub repos | `GET https://hub.docker.com/v2/search/repositories?query={name}` → similarity scoring |
| Corpus | User-provided marks | Offline Jaro-Winkler + Metaphone comparison |

All adapter calls use exponential backoff retry (2 retries, 500ms base delay). Opt-in disk caching reduces repeated API calls.

---

## What it generates

### Variants

| Type | Example input | Example output |
|------|---------------|----------------|
| Normalized | `My Cool Tool` | `my-cool-tool` |
| Tokenized | `my-cool-tool` | `["my", "cool", "tool"]` |
| Phonetic (Metaphone) | `["my", "cool", "tool"]` | `["M", "KL", "TL"]` |
| Homoglyphs | `my-cool-tool` | `["my-c00l-tool", "my-co0l-t00l"]` (ASCII + Cyrillic + Greek) |
| Fuzzy (edit-distance=1) | `my-cool-tool` | `["my-cool-too", "my-cool-tools", ...]` |

### Opinion tiers

| Tier | Meaning |
|------|---------|
| 🟢 GREEN | All namespaces available, no phonetic/homoglyph conflicts |
| 🟡 YELLOW | Some checks inconclusive (network), near-conflicts, or fuzzy variant taken |
| 🔴 RED | Exact conflict, phonetic collision, or high confusable risk |

### Score breakdown

Each opinion includes a weighted score breakdown for explainability:

| Sub-score | What it measures |
|-----------|-----------------|
| Namespace Availability | Fraction of checked namespaces that are available |
| Coverage Completeness | How many namespace types were checked (out of 4) |
| Conflict Severity | Penalty for exact, phonetic, confusable, near, and variant-taken conflicts |
| Domain Availability | Fraction of checked TLDs with available domains |

Weight profiles (`--risk` flag): **conservative** (default), **balanced**, **aggressive**. Higher risk tolerance lowers the thresholds for GREEN/YELLOW tiers and shifts weight toward namespace availability.

> **Note**: The tier is always rule-based — exact conflicts produce RED regardless of the numerical score. The breakdown is additive metadata for explainability only.

### Opinion v2 enhancements

The opinion engine produces additional analysis (v0.6.0+):

| Feature | Description |
|---------|-------------|
| Top Factors | 3-5 most important factors driving the tier decision, with weight classification |
| Risk Narrative | A deterministic "If you do nothing..." paragraph summarizing the risk |
| DuPont-Lite Analysis | Similarity of marks, channel overlap, fame proxy, and intent proxy scores |
| Safer Alternatives | 5 deterministic alternative name suggestions using prefix/suffix/separator/abbreviation/compound strategies |

Top factors and risk narratives use template catalogs — deterministic, no LLM text. DuPont-Lite factors are inspired by the DuPont trademark analysis framework but are NOT legal advice.

### Coaching output (v0.7.0+)

| Feature | Description |
|---------|-------------|
| Next Actions | 2-4 coaching steps ("what to do next") based on tier + findings |
| Coverage Score | 0-100% measure of how many requested namespaces were successfully checked |
| Unchecked Namespaces | List of namespaces that returned unknown status |
| Disclaimer | Legal-clarity footer stating what the report is and is not |
| Collision cards | Deterministic explanation cards for each conflict type | `collisionCards[]` in opinion |

Next actions are distinct from `recommendedActions` (which are reservation links). They provide coaching prose: "Claim now", "Re-run with --radar", "Consult a trademark attorney", etc.

---

## Output format

Every run produces four files:

```
reports/<date>/
├── run.json           # Complete run object (per schema)
├── run.md             # Human-readable clearance report with score table
├── report.html        # Self-contained attorney packet (dark theme)
├── summary.json       # Condensed summary for integrations
└── manifest.json      # SHA-256 lockfile for tamper detection (via gen-lock)
```

### Attorney packet (`report.html`)

A self-contained HTML report suitable for sharing with counsel. Includes the full opinion, score breakdown table, namespace checks, findings, evidence chain, and recommended actions with clickable reservation links. Dark theme, zero external dependencies.

### Summary JSON (`summary.json`)

A condensed output for integrations: tier, overall score, namespace statuses, findings summary, collision radar count, corpus match count, fuzzy variants taken count, and recommended actions.

---

## 1.0 Criteria

Before the engine reaches v1.0.0, the following must be true:

- [x] Artifact schemas published and validated in CI (`summary.schema.json`, `index-entry.schema.json`)
- [ ] Adapter reliability documented (uptime, rate limits, fallback behavior for each channel)
- [x] Compatibility policy stated and enforced (`docs/VERSIONING.md`)
- [x] Website consumption proven stable (`nameops` + marketing site ingest `summary.json` → `/lab/clearance/`)
- [x] Golden snapshot tests cover all tier outcomes (GREEN, YELLOW, RED)
- [ ] Collision cards validated against real-world runs

---

## Installation

```bash
# Install globally from npm
npm i -g @mcptoolshop/clearance-opinion-engine

# Or run directly with npx
npx @mcptoolshop/clearance-opinion-engine check my-cool-tool

# Or clone and run locally
git clone https://github.com/mcp-tool-shop-org/clearance-opinion-engine.git
cd clearance-opinion-engine
node src/index.mjs check my-cool-tool
```

---

## Usage

```bash
# Check a name across default channels (github, npm, pypi, domain)
coe check my-cool-tool

# Or if running from source:
node src/index.mjs check my-cool-tool

# Check specific channels only
node src/index.mjs check my-cool-tool --channels github,npm

# Skip domain checks
node src/index.mjs check my-cool-tool --channels github,npm,pypi

# Add crates.io to default channels
node src/index.mjs check my-cool-tool --channels +cratesio

# Add multiple ecosystem channels
node src/index.mjs check my-cool-tool --channels +cratesio,+dockerhub --dockerNamespace myorg

# Check all channels (requires --dockerNamespace and --hfOwner for full coverage)
node src/index.mjs check my-cool-tool --channels all --dockerNamespace myorg --hfOwner myuser

# Use channel group presets
node src/index.mjs check my-cool-tool --channels dev    # cratesio + dockerhub
node src/index.mjs check my-cool-tool --channels ai     # huggingface

# Check within a specific GitHub org
node src/index.mjs check my-cool-tool --org mcp-tool-shop-org

# Use aggressive risk tolerance
node src/index.mjs check my-cool-tool --risk aggressive

# Re-render an existing run as Markdown
node src/index.mjs report reports/2026-02-15/run.json

# Verify determinism: replay a previous run
node src/index.mjs replay reports/2026-02-15

# Specify output directory
node src/index.mjs check my-cool-tool --output ./my-reports

# Enable collision radar (GitHub + npm search for similar names)
node src/index.mjs check my-cool-tool --radar

# Generate safer alternative name suggestions
node src/index.mjs check my-cool-tool --suggest

# Run environment diagnostics
node src/index.mjs doctor

# Compare against a corpus of known marks
node src/index.mjs check my-cool-tool --corpus marks.json

# Enable caching (reduces API calls on repeated runs)
node src/index.mjs check my-cool-tool --cache-dir .coe-cache

# Disable fuzzy variant registry queries
node src/index.mjs check my-cool-tool --fuzzyQueryMode off

# Full pipeline: all channels + radar + corpus + cache
node src/index.mjs check my-cool-tool --channels all --dockerNamespace myorg --hfOwner myuser --radar --corpus marks.json --cache-dir .coe-cache

# ── Batch mode ──────────────────────────────────────────────

# Check multiple names from a text file
node src/index.mjs batch names.txt --channels github,npm --output reports

# Check multiple names from a JSON file with per-name config
node src/index.mjs batch names.json --concurrency 4 --cache-dir .coe-cache

# Resume a previous batch (skips already-completed names)
node src/index.mjs batch names.txt --resume reports/batch-2026-02-15 --output reports

# ── Refresh ─────────────────────────────────────────────────

# Re-run stale checks on an existing run (default: 24h threshold)
node src/index.mjs refresh reports/2026-02-15

# Custom freshness threshold
node src/index.mjs refresh reports/2026-02-15 --max-age-hours 12

# ── Corpus management ──────────────────────────────────────

# Create a new corpus template
node src/index.mjs corpus init --output marks.json

# Add marks to the corpus
node src/index.mjs corpus add --name "React" --class 9 --registrant "Meta" --corpus marks.json
node src/index.mjs corpus add --name "Vue" --class 9 --registrant "Evan You" --corpus marks.json

# ── Publish ─────────────────────────────────────────────────

# Export run artifacts for website consumption
node src/index.mjs publish reports/2026-02-15 --out dist/clearance/run1

# Publish and update a shared runs index
node src/index.mjs publish reports/2026-02-15 --out dist/clearance/run1 --index dist/clearance/runs.json

# ── Validate artifacts ────────────────────────────────────

# Validate JSON artifacts against built-in schemas
node src/index.mjs validate-artifacts reports/2026-02-16
```

### `coe validate-artifacts <dir>`

Validate JSON artifacts (`run.json`, `summary.json`, `runs.json`) against built-in schemas. Prints a pass/fail indicator per file. Exits 0 if all valid, 1 otherwise.

### Batch mode

`coe batch <file>` reads candidate names from a `.txt` or `.json` file, checks each one with shared caching and concurrency control, and produces per-name run artifacts plus batch-level summaries.

**Text format** (`.txt`): One name per line. Blank lines and `#` comments are ignored.

**JSON format** (`.json`): Array of strings `["name1", "name2"]` or objects `[{ "name": "name1", "riskTolerance": "aggressive" }]`.

Output structure:
```
batch-2026-02-15/
  batch/
    results.json
    summary.csv
    index.html       (dashboard)
  name-1/
    run.json, run.md, report.html, summary.json
  name-2/
    ...
```

### Replay command

`coe replay <dir>` reads a `run.json` from the specified directory, verifies the manifest (if present), and regenerates all outputs into a `replay/` subdirectory. It then compares the regenerated Markdown with the original to verify determinism.

```bash
# Run a check
node src/index.mjs check my-cool-tool --output reports

# Generate manifest (SHA-256 lockfile)
node scripts/gen-lock.mjs reports/2026-02-15

# Later: verify nothing changed
node src/index.mjs replay reports/2026-02-15
```

---

## Configuration

No config file required. All options are CLI flags:

| Flag | Default | Description |
|------|---------|-------------|
| `--channels` | `github,npm,pypi,domain` | Channels to check. Accepts explicit list, group name (`core`, `dev`, `ai`, `all`), or additive (`+cratesio,+dockerhub`) |
| `--org` | _(none)_ | GitHub org to check for org-name availability |
| `--risk` | `conservative` | Risk tolerance: `conservative`, `balanced`, `aggressive` |
| `--output` | `reports/` | Output directory for run artifacts |
| `--radar` | _(off)_ | Enable collision radar (GitHub + npm + crates.io + Docker Hub search for similar names) |
| `--suggest` | _(off)_ | Generate safer alternative name suggestions in the opinion |
| `--corpus` | _(none)_ | Path to JSON corpus of known marks to compare against |
| `--cache-dir` | _(off)_ | Directory for caching adapter responses (or set `COE_CACHE_DIR`) |
| `--max-age-hours` | `24` | Cache TTL in hours (requires `--cache-dir`) |
| `--dockerNamespace` | _(none)_ | Docker Hub namespace (user/org) — required when `dockerhub` channel is enabled |
| `--hfOwner` | _(none)_ | Hugging Face owner (user/org) — required when `huggingface` channel is enabled |
| `--fuzzyQueryMode` | `registries` | Fuzzy variant query mode: `off`, `registries`, `all` |
| `--concurrency` | `4` | Max simultaneous checks in batch mode |
| `--resume` | _(none)_ | Resume batch from a previous output directory (skips completed names) |
| `--variantBudget` | `12` | Max fuzzy variants to query per registry (max: 30) |

### Environment variables

| Variable | Effect |
|----------|--------|
| `GITHUB_TOKEN` | Raises GitHub API rate limit from 60/hr to 5,000/hr |
| `COE_CACHE_DIR` | Default cache directory (CLI `--cache-dir` flag takes precedence) |

---

## Schema

The canonical data model is defined in `schema/clearance.schema.json` (JSON Schema 2020-12).

Key types: `run`, `intake`, `candidate`, `channel`, `variants`, `namespaceCheck`, `finding`, `evidence`, `opinion`, `scoreBreakdown`, `manifest`.

---

## Testing

```bash
npm test            # unit tests
npm run test:e2e    # integration tests with golden snapshots
npm run test:all    # all tests
```

All tests use fixture-injected adapters (zero network calls). Golden snapshots enforce byte-identical determinism.

---

## Error codes

| Code | Meaning |
|------|---------|
| `COE.INIT.NO_ARGS` | No candidate name provided |
| `COE.INIT.BAD_CHANNEL` | Unknown channel in `--channels` |
| `COE.ADAPTER.GITHUB_FAIL` | GitHub API returned unexpected error |
| `COE.ADAPTER.NPM_FAIL` | npm registry returned unexpected error |
| `COE.ADAPTER.PYPI_FAIL` | PyPI API returned unexpected error |
| `COE.ADAPTER.DOMAIN_FAIL` | RDAP lookup failed |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | RDAP rate limit exceeded (HTTP 429) |
| `COE.ADAPTER.CRATESIO_FAIL` | crates.io API returned unexpected error |
| `COE.ADAPTER.DOCKERHUB_FAIL` | Docker Hub API returned unexpected error |
| `COE.ADAPTER.HF_FAIL` | Hugging Face API returned unexpected error |
| `COE.ADAPTER.RADAR_GITHUB_FAIL` | GitHub Search API unreachable |
| `COE.ADAPTER.RADAR_NPM_FAIL` | npm Search API unreachable |
| `COE.ADAPTER.RADAR_CRATESIO_FAIL` | crates.io Search API unreachable |
| `COE.ADAPTER.RADAR_DOCKERHUB_FAIL` | Docker Hub Search API unreachable |
| `COE.DOCTOR.FATAL` | Doctor command failed |
| `COE.DOCKER.NAMESPACE_REQUIRED` | Docker Hub channel enabled without `--dockerNamespace` |
| `COE.HF.OWNER_REQUIRED` | Hugging Face channel enabled without `--hfOwner` |
| `COE.VARIANT.FUZZY_HIGH` | Fuzzy variant count exceeds threshold (informational) |
| `COE.CORPUS.INVALID` | Corpus file has invalid format |
| `COE.CORPUS.NOT_FOUND` | Corpus file not found at specified path |
| `COE.RENDER.WRITE_FAIL` | Could not write output files |
| `COE.LOCK.MISMATCH` | Lockfile verification failed (tampered) |
| `COE.REPLAY.NO_RUN` | No `run.json` in replay directory |
| `COE.REPLAY.HASH_MISMATCH` | Manifest hash mismatch during replay |
| `COE.REPLAY.MD_DIFF` | Regenerated Markdown differs from original |
| `COE.BATCH.BAD_FORMAT` | Unsupported batch file format |
| `COE.BATCH.EMPTY` | Batch file contains no names |
| `COE.BATCH.DUPLICATE` | Duplicate name in batch file |
| `COE.BATCH.TOO_MANY` | Batch exceeds 500-name safety cap |
| `COE.REFRESH.NO_RUN` | No `run.json` in refresh directory |
| `COE.PUBLISH.NOT_FOUND` | Run directory not found for publish |
| `COE.PUBLISH.NO_FILES` | No publishable files in directory |
| `COE.PUBLISH.SECRET_DETECTED` | Possible secret detected in publish output (warning) |
| `COE.NET.DNS_FAIL` | DNS lookup failed — check network connection |
| `COE.NET.CONN_REFUSED` | Connection refused by remote server |
| `COE.NET.TIMEOUT` | Request timed out |
| `COE.NET.RATE_LIMITED` | Rate limited — wait and retry |
| `COE.FS.PERMISSION` | Permission denied writing to disk |
| `COE.CORPUS.EXISTS` | Corpus file already exists (during init) |
| `COE.CORPUS.EMPTY_NAME` | Mark name is required but empty |
| `COE.VALIDATE.*` | Artifact validation errors |

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for the complete error reference and troubleshooting guide.

---

## Safety

- **Read-only**: never modifies any namespace, registry, or repository
- **Deterministic**: same inputs produce identical outputs
- **Evidence-backed**: every opinion traces to specific checks with SHA-256 hashes
- **Conservative**: defaults to YELLOW/RED when uncertain
- **No secrets in output**: API tokens never appear in reports
- **XSS-safe**: all user strings are HTML-escaped in the attorney packet
- **Evidence redaction**: tokens, API keys, and Authorization headers are stripped before writing
- **Secret scan**: `coe publish` scans output for leaked tokens before writing

---

## Limitations

- Not legal advice — not a trademark search or substitute for professional counsel
- No trademark database checks (USPTO, EUIPO, WIPO)
- Collision radar is indicative (market-usage signals), not authoritative trademark searching
- Corpus comparison is against user-provided marks only, not an exhaustive database
- Domain checks cover `.com` and `.dev` only
- Docker Hub requires `--dockerNamespace`; Hugging Face requires `--hfOwner`
- Fuzzy variants are edit-distance=1 only; queries limited to npm, PyPI, crates.io
- Phonetic analysis is English-centric (Metaphone algorithm)
- Homoglyph detection covers ASCII + Cyrillic + Greek (not all Unicode scripts)
- No social media handle checks
- All checks are point-in-time snapshots
- Batch mode capped at 500 names per file
- Freshness detection is informational only (does not change opinion tier)

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for the full list.

---

## License

MIT

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
