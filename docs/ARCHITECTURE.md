# Architecture

## Module dependency graph

```
src/index.mjs (CLI entry — check, batch, refresh, corpus, publish, report, replay, doctor)
├── src/doctor.mjs              (runDoctor — environment diagnostics)
├── src/pipeline.mjs           (runCheck, withCache — extracted check pipeline)
├── src/lib/errors.mjs         (fail, warn, makeError)
├── src/lib/hash.mjs           (hashString, hashObject, hashFile)
├── src/lib/retry.mjs          (withRetry, retryFetch, defaultSleep)
├── src/lib/cache.mjs          (createCache — time-windowed disk cache)
├── src/lib/concurrency.mjs    (createPool, createRateLimiter — batch primitives)
├── src/lib/freshness.mjs      (checkFreshness, findStaleAdapters — staleness detection)
├── src/lib/redact.mjs          (redactUrl, redactEvidence, redactAllEvidence — evidence sanitization)
├── src/lib/adaptive-backoff.mjs (createAdaptiveBackoff — per-host adaptive fetch throttling)
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
├── src/batch/
│   ├── runner.mjs             (runBatch — concurrent batch execution)
│   ├── input.mjs              (parseBatchInput — .txt/.json parser)
│   └── writer.mjs             (writeBatchOutput — batch disk writer)
├── src/corpus/
│   └── cli.mjs                (corpusInit, corpusAdd — corpus management)
├── src/refresh.mjs            (refreshRun — stale check re-runner)
├── src/publish.mjs            (publishRun — artifact export for websites)
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
│   ├── similarity.mjs         (jaroWinkler, comparePair, findSimilarMarks)
│   └── alternatives.mjs       (generateAlternatives, recheckAlternatives — safer name suggestions)
└── src/renderers/
    ├── report.mjs             (writeRun, renderRunMd + freshness banners)
    ├── packet.mjs             (renderPacketHtml, renderSummaryJson + freshness banners)
    ├── batch.mjs              (renderBatchResultsJson, renderBatchSummaryCsv, renderBatchDashboardHtml)
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
Build next actions (coaching prose based on tier + findings)
  ↓
Compute coverage score + disclaimer
  ↓
[Optional] Generate safer alternatives (--suggest) → opinion.saferAlternatives
  ↓
Redact evidence (strip tokens, Authorization headers, truncate oversized notes)
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

## DuPont-Lite analysis

The scoring engine computes DuPont-inspired trademark analysis factors (`src/scoring/weights.mjs`):

- **Similarity of marks**: Maximum similarity score from radar/corpus findings
- **Channel overlap**: Ratio of channels with conflicts to total channels
- **Fame proxy**: Fires when >3 radar results exceed 85% similarity (suggests established mark)
- **Intent proxy**: Fires when edit-distance=1 variants are taken (typosquatting pattern)

Each factor produces a 0-100 score with a deterministic rationale string. These are metadata for explainability -- they do NOT override the rule-based tier logic.

> **Note**: DuPont-Lite is inspired by the multi-factor test from *In re E. I. du Pont de Nemours & Co.* but is NOT legal advice. It uses only publicly available data and algorithmic heuristics.

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
- `searchCratesIo(name)` — crates.io search (`/api/v1/crates?q=`)
- `searchDockerHub(name)` — Docker Hub search (`/v2/search/repositories?query=`)
- `scanAll(name)` — runs enabled channels in parallel via `Promise.allSettled()` (channel-gated)

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

## Evidence redaction

The redaction module (`src/lib/redact.mjs`) strips sensitive data from evidence before writing:

- `redactUrl(url)` — strips `token`, `access_token`, `api_key`, `key`, `secret`, `password` query params
- `redactEvidence(evidence)` — strips tokens from `source.url`, replaces `Authorization: Bearer/token` in `repro[]`, truncates notes exceeding 50KB
- `redactAllEvidence(evidenceArray)` — applies to all evidence objects

Called automatically in `pipeline.mjs` before building the return object.

## Attorney packet

The HTML packet is a self-contained report:
- Dark theme, inline CSS, zero external resources
- All user strings HTML-escaped via `escapeHtml()` (security boundary)
- Includes score breakdown table, namespace checks, findings, evidence, and links
- Deterministic: same run object produces identical HTML

## Pipeline extraction

The check pipeline (`src/pipeline.mjs`) was extracted from the CLI entry point so batch mode, refresh, and publish can invoke it programmatically. `runCheck(candidateName, opts)` is a pure function that returns a complete run object without writing to disk.

## Batch mode

The batch system (`src/batch/`) checks N names in one command with shared caching and concurrency control:

- `parseBatchInput(filePath)` — parses `.txt` (one per line, `#` comments) or `.json` (string array or object array with per-name config). Safety cap: 500 names.
- `runBatch(names, opts)` — runs `runCheck()` for each name through a concurrency pool. Per-name errors are captured, not thrown. Results sorted by name for deterministic output.
- `writeBatchOutput(batchResult, outputDir)` — writes batch-level files (`results.json`, `summary.csv`, `index.html`) plus per-name subdirectories with full run artifacts.

Output structure:
```
<outputDir>/
  batch/
    results.json
    summary.csv
    index.html       (dark-theme dashboard)
  <name-1>/
    run.json, run.md, report.html, summary.json
  <name-2>/
    ...
```

## Concurrency primitives

The concurrency module (`src/lib/concurrency.mjs`) provides batch-mode primitives:

- `createPool(concurrency)` — Promise-based semaphore pool. `run(fn)` enqueues, `drain()` waits for all.
- `createRateLimiter(maxPerSecond, opts)` — Token-bucket rate limiter with injectable clock/sleep.

## Freshness detection

The freshness module (`src/lib/freshness.mjs`) detects stale evidence:

- `checkFreshness(run, { maxAgeHours, now })` — compares `check.observedAt` timestamps against threshold. Returns `{ isStale, staleChecks[], banner }`.
- `findStaleAdapters(run, { maxAgeHours, now })` — identifies which adapter checks need refreshing.

Freshness banners appear automatically in Markdown and HTML renderers when evidence is older than 24 hours.

## Refresh command

The refresh module (`src/refresh.mjs`) re-runs stale adapter checks:

1. Reads `run.json` from an existing run directory
2. Identifies stale checks via `findStaleAdapters()`
3. Re-runs only the stale adapter calls
4. Merges fresh results into the existing run
5. Re-classifies findings and re-scores opinion
6. Returns a new run object (original directory is never modified)

## Corpus CLI

The corpus CLI (`src/corpus/cli.mjs`) manages user-provided mark databases:

- `corpusInit(outputPath)` — creates a `corpus.json` template
- `corpusAdd(corpusPath, entry)` — appends a mark with deterministic ID, deduplicates case-insensitively, writes atomically

These are management tools for the corpus comparison engine already in `src/adapters/corpus.mjs`.

## Publish command

The publish module (`src/publish.mjs`) copies run artifacts for website consumption:

- Copies `report.html`, `summary.json`, `manifest.json` to an output directory
- Generates `index.html` listing when multiple sibling runs are published
- Read-only against the source run directory

## Adaptive backoff

The adaptive backoff module (`src/lib/adaptive-backoff.mjs`) wraps a fetch function with per-host rate throttling:

- Tracks `consecutiveFailures`, `backoffMs`, `lastFailureAt` per host
- On 429: doubles `backoffMs` (min 1000ms, max 30000ms)
- On 5xx: increases `backoffMs` by 50%
- On success: halves `backoffMs` (floor 0), resets failure count
- Respects `Retry-After` header (seconds or HTTP date)
- Injectable `sleepFn` and `clockFn` for deterministic testing
- `.getStats()` returns per-host backoff state

Composes with `retryFetch()` — different responsibilities. Retry handles transient failures (immediate retry with jitter); adaptive backoff handles sustained pressure (progressive delay).

Used automatically in batch mode to prevent overwhelming registries.

## Batch resume

The batch runner supports resuming from a previous incomplete batch:

- `--resume <dir>` reads `batch/results.json` from a previous output directory
- Builds a `Set` of already-completed names from previous results
- Skips completed names (logged as "Skipping {name} — already completed")
- Final results = previous results + new results, sorted by name
- Output includes `resumedFrom` metadata in `results.json`

This handles interrupted batches without re-checking names that already succeeded.

## Cost tracking

The pipeline supports cost tracking via an injectable callback:

```javascript
costTracker(adapterName, { cached: boolean })
```

In batch mode, this counts total API calls and cache hits per adapter. Results appear in `batchResult.costStats`:

- `totalApiCalls`: total adapter calls made
- `cachedCalls`: how many were served from cache
- `adapterBreakdown`: per-adapter call/cache counts
- `backoffEvents`: count of adaptive backoff delays triggered

Cost stats render as a table in the batch dashboard HTML.

## Doctor command

The doctor module (`src/doctor.mjs`) runs environment diagnostics:

- Node.js version >= 20
- `GITHUB_TOKEN` presence (affects rate limits)
- Network reachability (HEAD to npm registry)
- Engine version display

Run via `coe doctor`. Uses injectable `fetchFn` for testability.
