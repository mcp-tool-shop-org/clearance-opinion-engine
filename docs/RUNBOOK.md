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

To clear the cache:
```bash
rm -rf .coe-cache
```

### Collision Radar Rate Limits

- **GitHub Search API**: 10 requests/minute unauthenticated, 30/minute with `GITHUB_TOKEN`
- **npm Search API**: No documented rate limit, but excessive use may trigger 429s
- Collision radar uses `Promise.allSettled()` — if one source fails, the other still returns results
- Use `--cache-dir` to avoid repeated API calls during development

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

### Output Files

Each run produces four files in the output directory:

| File | Format | Purpose |
|------|--------|---------|
| `run.json` | JSON | Complete run data (per schema) |
| `run.md` | Markdown | Human-readable report |
| `report.html` | HTML | Self-contained attorney packet (dark theme) |
| `summary.json` | JSON | Condensed summary for integrations |
