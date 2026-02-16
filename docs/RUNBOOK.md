# Runbook

Operational reference for clearance-opinion-engine. All error codes, troubleshooting steps, and operational patterns.

## Error Codes Reference

### COE.INIT.* — Initialization Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.INIT.NO_ARGS` | Missing required argument | Check usage: `coe check <name>` |
| `COE.INIT.BAD_CHANNEL` | Unknown channel name | Valid: `github`, `npm`, `pypi`, `domain`, `cratesio`, `dockerhub`, `huggingface`. Groups: `core`, `dev`, `ai`, `all` |

### COE.ADAPTER.* — Adapter / Network Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.ADAPTER.GITHUB_FAIL` | GitHub API unreachable | Check network; set `GITHUB_TOKEN` for higher rate limits |
| `COE.ADAPTER.NPM_FAIL` | npm registry unreachable | Check network; registry.npmjs.org may be down |
| `COE.ADAPTER.PYPI_FAIL` | PyPI API unreachable | Check network; pypi.org may be down |
| `COE.ADAPTER.DOMAIN_FAIL` | RDAP lookup failed | Check network; rdap.org may be down |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | RDAP rate limit (HTTP 429) | Wait 10+ seconds; reduce TLD count |

### COE.ADAPTER.* — Ecosystem Adapter Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.ADAPTER.CRATESIO_FAIL` | crates.io API unreachable | Check network; crates.io may be down. Ensure User-Agent is set |
| `COE.ADAPTER.DOCKERHUB_FAIL` | Docker Hub API unreachable | Check network; hub.docker.com may be down |
| `COE.ADAPTER.HF_FAIL` | Hugging Face API unreachable | Check network; huggingface.co may be down |

### COE.DOCKER.* — Docker Hub Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.DOCKER.NAMESPACE_REQUIRED` | Docker Hub channel enabled but `--dockerNamespace` not provided | Add `--dockerNamespace <ns>` flag or remove `dockerhub` from channels |

### COE.HF.* — Hugging Face Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.HF.OWNER_REQUIRED` | Hugging Face channel enabled but `--hfOwner` not provided | Add `--hfOwner <owner>` flag or remove `huggingface` from channels |

### COE.VARIANT.* — Variant Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.VARIANT.FUZZY_HIGH` | Fuzzy variant count exceeds threshold (informational) | No action needed; this is expected for longer names |

### COE.ADAPTER.RADAR_* — Collision Radar Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.ADAPTER.RADAR_GITHUB_FAIL` | GitHub Search API unreachable | Check network; set `GITHUB_TOKEN` for higher rate limits |
| `COE.ADAPTER.RADAR_NPM_FAIL` | npm Search API unreachable | Check network; registry.npmjs.org may be down |

### COE.ADAPTER.RADAR_* — Extended Collision Radar Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.ADAPTER.RADAR_CRATESIO_FAIL` | crates.io Search API unreachable | Check network; crates.io may be down |
| `COE.ADAPTER.RADAR_DOCKERHUB_FAIL` | Docker Hub Search API unreachable | Check network; hub.docker.com may be down |

### COE.CORPUS.* — Corpus Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.CORPUS.INVALID` | Corpus file has invalid format | Ensure JSON has `{ marks: [{ mark: "name" }] }` structure |
| `COE.CORPUS.NOT_FOUND` | Corpus file not found at specified path | Check the `--corpus` file path |
| `COE.CORPUS.EXISTS` | Corpus file already exists (during init) | Use a different path or delete the existing file |
| `COE.CORPUS.EMPTY_NAME` | Mark name is required but empty | Provide a non-empty `--name` value |

### COE.BATCH.* — Batch Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.BATCH.BAD_FORMAT` | Unsupported batch file format | Use `.txt` or `.json` extension |
| `COE.BATCH.READ_FAIL` | Cannot read batch file | Check file path and permissions |
| `COE.BATCH.EMPTY` | Batch file contains no names | Add at least one name to the file |
| `COE.BATCH.DUPLICATE` | Duplicate name in batch file | Remove duplicate entries |
| `COE.BATCH.TOO_MANY` | Batch file exceeds 500-name limit | Split into multiple batch files |
| `COE.BATCH.EMPTY_NAME` | An entry has an empty name | Remove empty entries from the file |
| `COE.BATCH.BAD_ENTRY` | Entry is not a string or valid object | Ensure each entry is `"name"` or `{ "name": "value" }` |
| `COE.BATCH.BAD_JSON` | Invalid JSON in batch file | Fix JSON syntax errors |

### COE.REFRESH.* — Refresh Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.REFRESH.NO_RUN` | No `run.json` in specified directory | Check the run directory path |
| `COE.REFRESH.INVALID_RUN` | Invalid `run.json` format | Ensure the file is valid JSON |

### COE.PUBLISH.* — Publish Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.PUBLISH.NOT_FOUND` | Run directory not found | Check the run directory path |
| `COE.PUBLISH.NO_FILES` | No publishable files in directory | Ensure directory contains `report.html` and/or `summary.json` |
| `COE.PUBLISH.SECRET_DETECTED` | Possible secret in clearance-index.json | Check evidence redaction; patterns: ghp_, npm_, Bearer, sk-, AKIA |

### COE.RENDER.* — Output Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.RENDER.WRITE_FAIL` | Could not write output file | Check directory permissions and disk space |

### COE.LOCK.* — Lockfile Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.LOCK.MISMATCH` | Lockfile hash does not match | Files may have been modified after generation |

### COE.REPLAY.* — Replay Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.REPLAY.NO_RUN` | No `run.json` in specified directory | Specify correct run output directory |
| `COE.REPLAY.HASH_MISMATCH` | File changed since manifest was created | Re-generate manifest with `gen-lock.mjs` |
| `COE.REPLAY.MD_DIFF` | Regenerated Markdown differs from original | Engine version may have changed; expected after upgrades |

## Troubleshooting

### Offline Mode

The engine degrades gracefully when network is unavailable. All adapters catch network errors and return `{ status: "unknown", authority: "indicative" }`. The opinion tier will be YELLOW (not GREEN) when checks cannot complete.

To run fully offline, use pre-recorded fixtures or the `coe replay` command.

### Rate Limiting

**RDAP rate limits** vary by registry (typically 10 req/10 sec). The engine uses exponential backoff with 2 retries by default. If you hit persistent rate limits:

1. Reduce the number of TLDs checked
2. Wait between runs (30+ seconds)
3. Use `--channels github,npm,pypi` to skip domain checks

**GitHub rate limits**: Unauthenticated requests are limited to 60/hour. Set `GITHUB_TOKEN` for 5,000/hour.

### Replay Verification

Use `coe replay <dir>` to verify determinism:

1. Reads `run.json` from the specified directory
2. Checks `manifest.json` hashes (if present)
3. Regenerates all outputs into a `replay/` subdirectory
4. Compares regenerated Markdown with original
5. Warns on any differences

Expected workflow:
```bash
# Run a check
coe check my-tool --output reports

# Generate manifest
node scripts/gen-lock.mjs reports/2026-02-15

# Later: verify nothing changed
coe replay reports/2026-02-15
```

### Cache Troubleshooting

The disk cache is opt-in via `--cache-dir`. Common issues:

1. **Stale results**: Cache TTL defaults to 24 hours. Use `--max-age-hours 1` for shorter TTL
2. **Corrupted entries**: The cache silently ignores corrupted JSON (returns null, refetches)
3. **Disk full**: Cache writes are atomic (temp file + rename), so partial writes don't corrupt
4. **Cache location**: Use an absolute path for `--cache-dir` to avoid confusion with working directories
5. **Environment variable**: Set `COE_CACHE_DIR` for persistent config (CLI `--cache-dir` flag takes precedence)

To clear the cache:
```bash
rm -rf .coe-cache
```

### Collision Radar Rate Limits

- **GitHub Search API**: 10 requests/minute unauthenticated, 30/minute with `GITHUB_TOKEN`
- **npm Search API**: No documented rate limit, but excessive use may trigger 429s
- Collision radar uses `Promise.allSettled()` — if one source fails, the other still returns results
- Use `--cache-dir` to avoid repeated API calls during development

### Doctor Command

Use `coe doctor` to diagnose environment issues:

1. **Node.js version**: Requires >= 20. Upgrade Node if failing.
2. **GITHUB_TOKEN**: Warn if not set. Set to increase GitHub API rate limit from 60 to 5,000 requests/hour.
3. **Network reachability**: Tests connectivity to npm registry. If failing, check internet connection or proxy settings.
4. **Engine version**: Informational -- shows current version.

### Evidence Redaction

Evidence objects are automatically sanitized before writing to disk:

- URL query parameters (`token`, `access_token`, `api_key`, `key`, `secret`, `password`) are replaced with `[REDACTED]`
- `Authorization: Bearer/token` headers in reproduction steps are replaced with `[REDACTED]`
- Evidence notes exceeding 50KB are truncated with `[TRUNCATED]` marker

This is applied automatically by the pipeline. No user action required.

### Friendly Error Messages

The CLI maps common system errors to user-friendly messages:

| Code | Trigger | Message |
|------|---------|---------|
| `COE.NET.DNS_FAIL` | `ENOTFOUND` / `EAI_AGAIN` | DNS lookup failed — are you online? |
| `COE.NET.CONN_REFUSED` | `ECONNREFUSED` | Connection refused by remote server |
| `COE.NET.TIMEOUT` | `ETIMEDOUT` | Request timed out |
| `COE.NET.RATE_LIMITED` | HTTP 429 / "rate limit" | Rate limited — wait and retry |
| `COE.FS.PERMISSION` | `EACCES` / `EPERM` | Permission denied writing to disk |

Unrecognized errors fall through to `COE.MAIN.FATAL` with the raw error message.

### Secret Scanning

`coe publish` scans the generated `clearance-index.json` for leaked secrets before writing. Detected patterns:

- `ghp_` / `github_pat_` / `gho_` / `ghs_` — GitHub tokens
- `npm_` — npm tokens
- `Bearer` — Authorization headers
- `sk-` — OpenAI-style API keys
- `AKIA` — AWS access key IDs

Detection emits `COE.PUBLISH.SECRET_DETECTED` as a warning (non-fatal). The most likely cause is un-redacted evidence. Check the evidence redaction pipeline if triggered.

### Batch Mode

Common batch scenarios:

1. **Large batch hangs**: Reduce `--concurrency` (default: 4). Higher concurrency means more simultaneous network calls
2. **One name fails**: Batch continues — failed names appear in `errors[]`, not in `results[]`
3. **Cache shared across batch**: Use `--cache-dir` so all names benefit from shared caching
4. **Input format**: `.txt` is one name per line (use `#` for comments). `.json` accepts `["name"]` or `[{ "name": "x", "riskTolerance": "aggressive" }]`
5. **Safety cap**: Maximum 500 names per batch file

### Refresh Command

Use `coe refresh <dir>` to update stale evidence:

1. Reads `run.json` from the specified directory
2. Identifies checks older than `--max-age-hours` (default: 24)
3. Re-runs only stale adapter calls
4. Writes refreshed run to `<dir>-refresh/`
5. Original directory is never modified

### Batch Resume

Use `--resume <dir>` to continue from a previous incomplete batch:

```bash
# Initial batch (interrupted or failed on some names)
coe batch names.txt --output reports

# Resume — skips completed names
coe batch names.txt --resume reports/batch-2026-02-15 --output reports
```

Common issues:

1. **Wrong resume directory**: The `--resume` path must point to the batch output directory (the one containing `batch/results.json`), not the input file
2. **All names already done**: If every name is already in the previous results, the batch completes instantly with 0 new checks
3. **Different options**: Resume uses the current command's options (channels, risk, etc.) for new names — it does NOT inherit from the previous batch
4. **Cost stats**: Cost stats in the resumed batch cover only the new names. Previous batch stats are not merged

### Adaptive Backoff

The engine uses per-host adaptive backoff in batch mode to avoid overwhelming registries:

- **429 responses**: Delay doubles (min 1000ms, max 30000ms)
- **5xx responses**: Delay increases by 50%
- **Success**: Delay halves (floor 0)
- **Retry-After header**: Respected if present (uses max of header value and current backoff)

Adaptive backoff is automatic in batch mode and requires no configuration. It composes with the standard retry logic — retry handles immediate transient failures, adaptive backoff handles sustained pressure.

To monitor backoff behavior, check `costStats.backoffEvents` in the batch `results.json`.

### npm Publish Checklist

Before publishing a new version:

```bash
# 1. All tests pass
npm run test:all

# 2. Version is correct in package.json, src/index.mjs, src/pipeline.mjs
grep '"version"' package.json
grep 'VERSION' src/index.mjs src/pipeline.mjs

# 3. Tarball contains expected files
npm pack --dry-run

# 4. Verify README, LICENSE, src/, schema/ in tarball
# 5. Create GitHub release (triggers publish workflow)
```

### Output Files

Each run produces four files in the output directory:

| File | Format | Purpose |
|------|--------|---------|
| `run.json` | JSON | Complete run data (per schema) |
| `run.md` | Markdown | Human-readable report |
| `report.html` | HTML | Self-contained attorney packet (dark theme) |
| `summary.json` | JSON | Condensed summary for integrations |
