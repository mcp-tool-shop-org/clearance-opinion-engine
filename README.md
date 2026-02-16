# clearance.opinion.engine

Deterministic "name availability + clearance opinion" engine.

Given a candidate name, it checks real namespace availability (GitHub org/repo, npm, PyPI, domain via RDAP), generates linguistic variants (normalized, tokenized, phonetic, homoglyph), and produces a conservative clearance opinion (GREEN / YELLOW / RED) with an explainable score breakdown and full evidence chain.

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

All adapter calls use exponential backoff retry (2 retries, 500ms base delay).

---

## What it generates

### Variants

| Type | Example input | Example output |
|------|---------------|----------------|
| Normalized | `My Cool Tool` | `my-cool-tool` |
| Tokenized | `my-cool-tool` | `["my", "cool", "tool"]` |
| Phonetic (Metaphone) | `["my", "cool", "tool"]` | `["M", "KL", "TL"]` |
| Homoglyphs | `my-cool-tool` | `["my-c00l-tool", "my-co0l-t00l"]` |

### Opinion tiers

| Tier | Meaning |
|------|---------|
| 🟢 GREEN | All namespaces available, no phonetic/homoglyph conflicts |
| 🟡 YELLOW | Some checks inconclusive (network) or near-conflicts found |
| 🔴 RED | Exact conflict, phonetic collision, or high confusable risk |

### Score breakdown

Each opinion includes a weighted score breakdown for explainability:

| Sub-score | What it measures |
|-----------|-----------------|
| Namespace Availability | Fraction of checked namespaces that are available |
| Coverage Completeness | How many namespace types were checked (out of 4) |
| Conflict Severity | Penalty for exact, phonetic, confusable, and near conflicts |
| Domain Availability | Fraction of checked TLDs with available domains |

Weight profiles (`--risk` flag): **conservative** (default), **balanced**, **aggressive**. Higher risk tolerance lowers the thresholds for GREEN/YELLOW tiers and shifts weight toward namespace availability.

> **Note**: The tier is always rule-based — exact conflicts produce RED regardless of the numerical score. The breakdown is additive metadata for explainability only.

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

A condensed output for integrations: tier, overall score, namespace statuses, findings summary, and recommended actions.

---

## Usage

```bash
# Check a name across all channels (github, npm, pypi, domain)
node src/index.mjs check my-cool-tool

# Check specific channels only
node src/index.mjs check my-cool-tool --channels github,npm

# Skip domain checks
node src/index.mjs check my-cool-tool --channels github,npm,pypi

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
| `--channels` | `github,npm,pypi,domain` | Comma-separated list of channels to check |
| `--org` | _(none)_ | GitHub org to check for org-name availability |
| `--risk` | `conservative` | Risk tolerance: `conservative`, `balanced`, `aggressive` |
| `--output` | `reports/` | Output directory for run artifacts |

### Environment variables

| Variable | Effect |
|----------|--------|
| `GITHUB_TOKEN` | Raises GitHub API rate limit from 60/hr to 5,000/hr |

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
| `COE.RENDER.WRITE_FAIL` | Could not write output files |
| `COE.LOCK.MISMATCH` | Lockfile verification failed (tampered) |
| `COE.REPLAY.NO_RUN` | No `run.json` in replay directory |
| `COE.REPLAY.HASH_MISMATCH` | Manifest hash mismatch during replay |
| `COE.REPLAY.MD_DIFF` | Regenerated Markdown differs from original |

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for the complete error reference and troubleshooting guide.

---

## Safety

- **Read-only**: never modifies any namespace, registry, or repository
- **Deterministic**: same inputs produce identical outputs
- **Evidence-backed**: every opinion traces to specific checks with SHA-256 hashes
- **Conservative**: defaults to YELLOW/RED when uncertain
- **No secrets in output**: API tokens never appear in reports
- **XSS-safe**: all user strings are HTML-escaped in the attorney packet

---

## Limitations

- Not legal advice — not a trademark search or substitute for professional counsel
- No trademark database checks (USPTO, EUIPO, WIPO)
- Domain checks cover `.com` and `.dev` only
- Phonetic analysis is English-centric (Metaphone algorithm)
- No social media handle checks
- All checks are point-in-time snapshots

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for the full list.

---

## License

MIT
