# Architecture

## Module dependency graph

```
src/index.mjs (CLI entry)
├── src/lib/errors.mjs        (fail, warn, makeError)
├── src/lib/hash.mjs           (hashString, hashObject, hashFile)
├── src/adapters/
│   ├── github.mjs             (createGitHubAdapter)
│   ├── npm.mjs                (createNpmAdapter)
│   └── pypi.mjs               (createPyPIAdapter)
├── src/variants/
│   ├── index.mjs              (generateVariants, generateAllVariants)
│   ├── normalize.mjs          (normalize, stripAll)
│   ├── tokenize.mjs           (tokenize)
│   ├── phonetic.mjs           (metaphone, phoneticVariants, phoneticSignature)
│   └── homoglyphs.mjs         (homoglyphVariants, areConfusable)
├── src/scoring/
│   └── opinion.mjs            (scoreOpinion, classifyFindings)
└── src/renderers/
    └── report.mjs             (writeRun, renderRunMd)
```

## Data flow

```
CLI args
  ↓
Build intake object
  ↓
Generate variants (normalize → tokenize → phonetic → homoglyphs)
  ↓
Run namespace checks (GitHub, npm, PyPI) via adapters
  ↓
Classify findings (exact_conflict, confusable_risk, etc.)
  ↓
Score opinion (GREEN / YELLOW / RED)
  ↓
Write run output (JSON + Markdown)
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
