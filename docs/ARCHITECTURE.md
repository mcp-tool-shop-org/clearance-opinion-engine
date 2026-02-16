# Architecture

## Module dependency graph

```
src/index.mjs (CLI entry)
├── src/lib/errors.mjs         (fail, warn, makeError)
├── src/lib/hash.mjs           (hashString, hashObject, hashFile)
├── src/lib/retry.mjs          (withRetry, retryFetch, defaultSleep)
├── src/adapters/
│   ├── github.mjs             (createGitHubAdapter)
│   ├── npm.mjs                (createNpmAdapter)
│   ├── pypi.mjs               (createPyPIAdapter)
│   └── domain.mjs             (createDomainAdapter — RDAP protocol)
├── src/variants/
│   ├── index.mjs              (generateVariants, generateAllVariants)
│   ├── normalize.mjs          (normalize, stripAll)
│   ├── tokenize.mjs           (tokenize)
│   ├── phonetic.mjs           (metaphone, phoneticVariants, phoneticSignature)
│   └── homoglyphs.mjs         (homoglyphVariants, areConfusable)
├── src/scoring/
│   ├── opinion.mjs            (scoreOpinion, classifyFindings)
│   └── weights.mjs            (computeScoreBreakdown, WEIGHT_PROFILES)
└── src/renderers/
    ├── report.mjs             (writeRun, renderRunMd)
    ├── packet.mjs             (renderPacketHtml, renderSummaryJson)
    └── html-escape.mjs        (escapeHtml, escapeAttr)
```

## Data flow

```
CLI args
  ↓
Build intake object
  ↓
Create retry-wrapped fetch (withRetry → retryFetch)
  ↓
Generate variants (normalize → tokenize → phonetic → homoglyphs)
  ↓
Run namespace checks (GitHub, npm, PyPI, Domain/RDAP) via adapters
  ↓
Classify findings (exact_conflict, confusable_risk, etc.)
  ↓
Score opinion (GREEN / YELLOW / RED) + compute score breakdown
  ↓
Build reservation links (dry-run URLs for available namespaces)
  ↓
Write run output (JSON + Markdown + HTML packet + Summary JSON)
```

## Adapter pattern

Each adapter exports a factory function:

```javascript
export function createGitHubAdapter(fetchFn = globalThis.fetch, opts = {}) {
  return {
    async checkOrg(name, checkOpts) { ... },
    async checkRepo(owner, name, checkOpts) { ... }
  };
}
```

The `fetchFn` parameter allows tests to inject fixture responses without network calls. Every adapter method returns `{ check, evidence }` — the check object for the opinion engine and the evidence object for the evidence chain.

Adapter methods never throw. Network errors produce `{ status: "unknown", authority: "indicative" }` checks with error details.

## Retry pattern

All adapter fetch calls are wrapped with `retryFetch()`:

```javascript
const fetchWithRetry = retryFetch(globalThis.fetch, { maxRetries: 2, baseDelayMs: 500 });
const gh = createGitHubAdapter(fetchWithRetry);
```

This wraps the raw `fetch` function with exponential backoff. Adapters see normal responses (retry is transparent). The `sleepFn` is injectable for zero-delay testing.

## Explainable scoring

The opinion engine produces both a rule-based tier (GREEN/YELLOW/RED) and a numerical score breakdown:

- **Tier**: Deterministic, rule-based. Exact conflicts always produce RED regardless of score.
- **Score breakdown**: Weighted sub-scores for explainability. Does NOT override tier logic.
- **Weight profiles**: Conservative, balanced, and aggressive profiles change relative importance.

## Determinism contract

Same inputs + same adapter responses = byte-identical output.

Guaranteed by:
1. **Canonical JSON**: `hashObject()` sorts keys recursively before hashing
2. **Clock injection**: Functions accept `now` parameter for deterministic timestamps
3. **Stable IDs**: `checkId()`, `evidenceId()`, `findingId()` are computed from inputs
4. **No randomness**: No UUIDs, no `Math.random()`, no `Date.now()` without injection
5. **Sorted output**: All arrays that could vary in order are sorted deterministically

## Evidence chain

Every namespace check produces an evidence object with:
- Source system, URL, HTTP method
- SHA-256 hash of the response body
- Timestamp of observation
- Reproduction steps (curl command)

This allows any finding to be traced back to its source and re-verified.

## Attorney packet

The HTML packet is a self-contained report:
- Dark theme, inline CSS, zero external resources
- All user strings HTML-escaped via `escapeHtml()` (security boundary)
- Includes score breakdown table, namespace checks, findings, evidence, and links
- Deterministic: same run object produces identical HTML
