# Runbook

Operational reference for clearance-opinion-engine. All error codes, troubleshooting steps, and operational patterns.

## Error Codes Reference

### COE.INIT.* — Initialization Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.INIT.NO_ARGS` | Missing required argument | Check usage: `coe check <name>` |
| `COE.INIT.BAD_CHANNEL` | Unknown channel name | Valid: `github`, `npm`, `pypi`, `domain` |

### COE.ADAPTER.* — Adapter / Network Errors

| Code | Meaning | Fix |
|------|---------|-----|
| `COE.ADAPTER.GITHUB_FAIL` | GitHub API unreachable | Check network; set `GITHUB_TOKEN` for higher rate limits |
| `COE.ADAPTER.NPM_FAIL` | npm registry unreachable | Check network; registry.npmjs.org may be down |
| `COE.ADAPTER.PYPI_FAIL` | PyPI API unreachable | Check network; pypi.org may be down |
| `COE.ADAPTER.DOMAIN_FAIL` | RDAP lookup failed | Check network; rdap.org may be down |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | RDAP rate limit (HTTP 429) | Wait 10+ seconds; reduce TLD count |

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

### Output Files

Each run produces four files in the output directory:

| File | Format | Purpose |
|------|--------|---------|
| `run.json` | JSON | Complete run data (per schema) |
| `run.md` | Markdown | Human-readable report |
| `report.html` | HTML | Self-contained attorney packet (dark theme) |
| `summary.json` | JSON | Condensed summary for integrations |
