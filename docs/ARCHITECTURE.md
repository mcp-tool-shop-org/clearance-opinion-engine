# Architecture

## Module dependency graph

```
src/index.mjs (CLI entry)
├── src/lib/errors.mjs         (fail, warn, makeError)
├── src/lib/hash.mjs           (hashString, hashObject, hashFile)
├── src/lib/retry.mjs          (withRetry, retryFetch, defaultSleep)
├── src/lib/cache.mjs          (createCache — time-windowed disk cache)
├── src/adapters/
│   ├── github.mjs             (createGitHubAdapter)
│   ├── npm.mjs                (createNpmAdapter)
│   ├── pypi.mjs               (createPyPIAdapter)
│   ├── domain.mjs             (createDomainAdapter — RDAP protocol)
│   ├── collision-radar.mjs    (createCollisionRadarAdapter — GitHub + npm search)
│   ├── cratesio.mjs           (createCratesIoAdapter — crates.io registry)
│   ├── dockerhub.mjs          (createDockerHubAdapter — Docker Hub)
│   ├── huggingface.mjs        (createHuggingFaceAdapter — Hugging Face models + spaces)
│   └── corpus.mjs             (loadCorpus, compareAgainstCorpus)
├── src/variants/
│   ├── index.mjs              (generateVariants, generateAllVariants)
│   ├── normalize.mjs          (normalize, stripAll)
│   ├── tokenize.mjs           (tokenize)
│   ├── phonetic.mjs           (metaphone, phoneticVariants, phoneticSignature)
│   ├── homoglyphs.mjs         (homoglyphVariants, areConfusable — ASCII + Cyrillic + Greek)
│   └── fuzzy.mjs              (fuzzyVariants, selectTopN — edit-distance=1)
├── src/scoring/
│   ├── opinion.mjs            (scoreOpinion, classifyFindings)
│   ├── weights.mjs            (computeScoreBreakdown, WEIGHT_PROFILES)
│   └── similarity.mjs         (jaroWinkler, comparePair, findSimilarMarks)
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
Generate variants (normalize → tokenize → phonetic → homoglyphs → fuzzy)
  ↓
Parse channel groups (core, dev, ai, all, additive +prefixes)
  ↓
Run namespace checks (GitHub, npm, PyPI, Domain, crates.io, Docker Hub, HF) via adapters
  ↓
[Optional] Collision radar scan (GitHub Search + npm Search) → indicative checks
  ↓
[Optional] Fuzzy variant registry queries (npm, PyPI, crates.io) → variant_taken findings
  ↓
Classify findings (exact_conflict, confusable_risk, near_conflict, variant_taken, etc.)
  ↓
[Optional] Corpus comparison (user-provided known marks) → additional findings
  ↓
Score opinion (GREEN / YELLOW / RED) + compute score breakdown
  ↓
Build reservation links (dry-run URLs for available namespaces)
  ↓
Write run output (JSON + Markdown + HTML packet + Summary JSON)
```

## Channel groups

Channels are organized into groups for convenience:

- **core** (default): `github`, `npm`, `pypi`, `domain`
- **dev**: `cratesio`, `dockerhub`
- **ai**: `huggingface`
- **all**: every channel

The `parseChannels()` function supports three modes: group aliases (`--channels all`), additive prefixes (`--channels +cratesio,+dockerhub` adds to default), and explicit lists (`--channels github,npm`).

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

## Similarity engine

The similarity engine (`src/scoring/similarity.mjs`) provides Jaro-Winkler string similarity combined with Metaphone phonetic analysis:

- `jaroWinkler(a, b)` — pure JS implementation, returns 0-1 score
- `comparePair(a, b)` — produces `{ looks: {score, label}, sounds: {score, label}, overall, why[] }`
  - `looks` uses Jaro-Winkler on normalized forms
  - `sounds` uses Jaro-Winkler on phonetic signatures (Metaphone)
  - `overall` is a weighted blend (default: 60% looks, 40% sounds)
- `findSimilarMarks(candidate, marks[], opts)` — filters and sorts by similarity above threshold

Used by the collision radar adapter and corpus comparison module.

## Ecosystem adapters

### crates.io (`src/adapters/cratesio.mjs`)

Checks Rust crate name availability via the crates.io API. Requires a `User-Agent` header (crates.io policy). Extracts `crateName`, `crateCreatedAt`, and `crateDownloads` metadata when a crate is taken.

### Docker Hub (`src/adapters/dockerhub.mjs`)

Checks Docker repository name availability. Requires a namespace (user or org) via `--dockerNamespace`. Without the namespace, the check is skipped with `COE.DOCKER.NAMESPACE_REQUIRED` and `evidence.type: "skipped"`. Extracts `repoName`, `starCount`, and `pullCount` when taken.

### Hugging Face (`src/adapters/huggingface.mjs`)

Checks Hugging Face model and space name availability. Requires an owner via `--hfOwner`. Produces two namespace checks: `huggingface_model` and `huggingface_space`. Without the owner, both are skipped with `COE.HF.OWNER_REQUIRED`. Extracts `resourceId`, `downloads`, and `likes` when taken.

## Fuzzy variants

The fuzzy variant module (`src/variants/fuzzy.mjs`) generates all edit-distance=1 variants of a candidate name:

- **Deletions**: remove one character at each position
- **Substitutions**: replace one character with each of `[a-z, 0-9, -]`
- **Insertions**: insert one character from `[a-z, 0-9, -]` at each position

Variants are sorted by a stable tuple `(operationType, position, replacementChar, value)`, deduplicated, and capped at `maxVariants` (default: 30). `selectTopN(variants, n)` returns the first N items for registry querying.

Registry queries are performed against npm, PyPI, and crates.io only. Results with `query.isVariant === true` and `status === "taken"` produce `variant_taken` findings, which always result in a YELLOW opinion tier.

## Collision radar

The collision radar adapter (`src/adapters/collision-radar.mjs`) searches for similar names in public registries:

- `searchGitHub(name)` — GitHub Search API (`/search/repositories`)
- `searchNpm(name)` — npm registry search (`/-/v1/search`)
- `scanAll(name)` — runs both in parallel via `Promise.allSettled()`

Results use `namespace: "custom"` and `authority: "indicative"`. These are market-usage signals, not authoritative trademark searches. The similarity engine scores each result, and only results above the configured threshold (default: 0.70) are included.

## Corpus comparison

The corpus module (`src/adapters/corpus.mjs`) compares a candidate against user-provided known marks:

- `loadCorpus(path)` — reads and validates a JSON corpus file
- `compareAgainstCorpus(candidate, corpus, opts)` — runs `findSimilarMarks()` and produces findings

This enables offline, deterministic comparison without network calls.

## Caching

The cache module (`src/lib/cache.mjs`) provides opt-in, time-windowed disk caching:

- Content-addressed keys (SHA-256 of adapter + query + version)
- Atomic writes (temp file + `renameSync`)
- Configurable TTL via `maxAgeHours` (default: 24)
- Clock-injectable for deterministic testing
- Corrupted entries return `null` (no throw)

Enabled via `--cache-dir <path>`. Reduces API calls on repeated runs.

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
