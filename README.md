# clearance.opinion.engine

Deterministic "name availability + clearance opinion" engine.

Given a candidate name, it checks real namespace availability (GitHub org/repo, npm, PyPI), generates linguistic variants (normalized, tokenized, phonetic, homoglyph), and produces a conservative clearance opinion (GREEN / YELLOW / RED) with a full evidence chain.

---

## Truth contract

- **Same inputs + same adapter responses = byte-identical output.**
- Every check produces an `evidence` object with SHA-256, timestamp, and reproduction steps.
- Opinions are conservative: GREEN only when _all_ namespace checks are clean _and_ no phonetic/homoglyph collisions exist.
- The engine never sends, publishes, or modifies anything. It only reads and reports.

---

## What it checks

| Channel | Namespace | Method |
|---------|-----------|--------|
| GitHub  | Org name  | `GET /orgs/{name}` → 404 = available |
| GitHub  | Repo name | `GET /repos/{owner}/{name}` → 404 = available |
| npm     | Package   | `GET https://registry.npmjs.org/{name}` → 404 = available |
| PyPI    | Package   | `GET https://pypi.org/pypi/{name}/json` → 404 = available |

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

---

## Output format

Every run produces:

```
reports/<date>/
├── run.json           # Complete run object (per schema)
├── run.md             # Human-readable clearance report
└── manifest.json      # SHA-256 lockfile for tamper detection
```

---

## Usage

```bash
# Check a name across all channels
node src/index.mjs check my-cool-tool

# Check specific channels only
node src/index.mjs check my-cool-tool --channels github,npm

# Check within a specific GitHub org
node src/index.mjs check my-cool-tool --org mcp-tool-shop-org

# Re-render an existing run as Markdown
node src/index.mjs report reports/2026-02-15/run.json

# Specify output directory
node src/index.mjs check my-cool-tool --output ./my-reports
```

---

## Configuration

No config file required. All options are CLI flags:

| Flag | Default | Description |
|------|---------|-------------|
| `--channels` | `github,npm,pypi` | Comma-separated list of channels to check |
| `--org` | _(none)_ | GitHub org to check for org-name availability |
| `--output` | `reports/` | Output directory for run artifacts |

---

## Schema

The canonical data model is defined in `schema/clearance.schema.json` (JSON Schema 2020-12).

Key types: `run`, `intake`, `candidate`, `channel`, `variants`, `namespaceCheck`, `finding`, `evidence`, `opinion`, `manifest`.

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
| `COE.RENDER.WRITE_FAIL` | Could not write output files |
| `COE.LOCK.MISMATCH` | Lockfile verification failed (tampered) |

---

## Safety

- **Read-only**: never modifies any namespace, registry, or repository
- **Deterministic**: same inputs produce identical outputs
- **Evidence-backed**: every opinion traces to specific checks with SHA-256 hashes
- **Conservative**: defaults to YELLOW/RED when uncertain
- **No secrets in output**: API tokens never appear in reports

---

## License

MIT
