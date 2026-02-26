<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

決定論的な「名前の可用性＋審査意見」エンジン。

候補となる名前が与えられた場合、実際の名前空間の可用性をチェックします（GitHubの組織/リポジトリ、npm、PyPI、RDAP経由のドメイン、crates.io、Docker Hub、Hugging Face）。また、言語的なバリエーションを生成します（正規化、トークン化、発音記号、同形文字、ファジー編集距離=1）。類似の名前を「衝突レーダー」で検索します（GitHub + npmの検索）。登録リポジトリに対してファジーなバリエーションの競合を問い合わせ、ユーザーが提供した既知の商標と比較し、説明可能なスコアの内訳、概要、カバレッジマトリックス、および完全な証拠チェーンを含む、保守的な審査意見（緑/黄/赤）を出力します。

---

## 真実の契約

- **同じ入力 + 同じアダプターの応答 = バイト単位で同一の出力。**
- すべてのチェックは、SHA-256、タイムスタンプ、および再現手順を含む`evidence`オブジェクトを生成します。
- 審査意見は保守的です。すべての名前空間チェックが問題なく、かつ発音記号/同形文字の競合が存在しない場合にのみ「緑」と判断されます。
- このエンジンは、何も送信、公開、または変更しません。読み取りとレポートのみを行います。
- スコアの内訳は、あるティアが割り当てられた理由を説明しますが、ルールベースのティアロジックを上書きすることはありません。

---

## チェック項目

| チャンネル | 名前空間 | メソッド |
| --------- | ----------- | -------- |
| GitHub | 組織名 | `GET /orgs/{name}` → 404 = 利用可能 |
| GitHub | リポジトリ名 | `GET /repos/{owner}/{name}` → 404 = 利用可能 |
| npm | パッケージ | `GET https://registry.npmjs.org/{name}` → 404 = 利用可能 |
| PyPI | パッケージ | `GET https://pypi.org/pypi/{name}/json` → 404 = 利用可能 |
| ドメイン | `.com`, `.dev` | RDAP (RFC 9083) via `rdap.org` → 404 = 利用可能 |
| crates.io | クレート | `GET https://crates.io/api/v1/crates/{name}` → 404 = 利用可能 |
| Docker Hub | リポジトリ | `GET https://hub.docker.com/v2/repositories/{ns}/{name}` → 404 = 利用可能 |
| Hugging Face | モデル | `GET https://huggingface.co/api/models/{owner}/{name}` → 404 = 利用可能 |
| Hugging Face | スペース | `GET https://huggingface.co/api/spaces/{owner}/{name}` → 404 = 利用可能 |

### チャンネルグループ

| グループ | チャンネル |
| ------- | ---------- |
| `core` (デフォルト) | github, npm, pypi, domain |
| `dev` | cratesio, dockerhub |
| `ai` | huggingface |
| `all` | すべてのチャンネル |

プリセットには`--channels <group>`を使用するか、追加構文（デフォルトに追加）の場合は`--channels +cratesio,+dockerhub`を使用します。

### 示唆的な信号（オプション）

| ソース | 検索対象 | メソッド |
| -------- | ----------------- | -------- |
| 衝突レーダー | GitHubリポジトリ | `GET /search/repositories?q={name}` → 類似度スコアリング |
| 衝突レーダー | npmパッケージ | `GET /-/v1/search?text={name}` → 類似度スコアリング |
| 衝突レーダー | crates.io クレート | `GET https://crates.io/api/v1/crates?q={name}` → 類似度スコアリング |
| 衝突レーダー | Docker Hub リポジトリ | `GET https://hub.docker.com/v2/search/repositories?query={name}` → 類似度スコアリング |
| コーパス | ユーザーが提供した商標 | オフラインのJaro-Winkler + Metaphone比較 |

すべてのアダプターの呼び出しは、指数関数的なバックオフ再試行（2回、基本遅延500ms）を使用します。 オプトインのディスクキャッシュにより、API呼び出しの繰り返しを減らすことができます。

---

## 生成されるもの

### バリエーション

| タイプ | 入力例 | 出力例 |
| ------ | --------------- | ---------------- |
| 正規化 | `My Cool Tool` | `my-cool-tool` |
| トークン化 | `my-cool-tool` | `["my", "cool", "tool"]` |
| 発音（Metaphone） | `["my", "cool", "tool"]` | `["M", "KL", "TL"]` |
| 同形文字 | `my-cool-tool` | `["my-c00l-tool", "my-co0l-t00l"]` (ASCII + キリル文字 + ギリシャ文字) |
| 類似度（編集距離=1） | `my-cool-tool` | `["my-cool-too", "my-cool-tools", ...]` |

### 評価レベル

| レベル | 意味 |
| ------ | --------- |
| 🟢 GREEN (緑) | すべての名前空間が利用可能で、発音/同形文字の競合がない |
| 🟡 YELLOW (黄) | 一部のチェックで結果が不明確（ネットワーク）、または競合の可能性があり、または類似のバリエーションが採用された |
| 🔴 RED (赤) | 正確な競合、発音の衝突、または高い混同リスクがある |

### スコアの内訳

各評価には、説明のために重み付けされたスコアの内訳が含まれます。

| サブスコア | 何を測定しているか |
| ----------- | ----------------- |
| 名前空間の可用性 | チェックされた名前空間のうち、利用可能なものの割合 |
| カバレッジの完全性 | チェックされた名前空間のタイプ数（4種類のうち） |
| 競合の深刻度 | 正確な競合、発音の競合、混同の可能性、類似の競合、および採用されたバリエーションに対するペナルティ |
| ドメインの可用性 | チェックされたTLDのうち、利用可能なドメインの割合 |

リスクプロファイル（`--risk`フラグ）：**conservative**（デフォルト）、**balanced**、**aggressive**。 リスク許容度が高いほど、GREEN/YELLOWのレベルの閾値が下がり、名前空間の可用性への重みが大きくなります。

> **注意**: レベルは常にルールベースで決定されます。正確な競合が発生した場合、数値スコアに関わらずREDになります。内訳は説明のための追加情報です。

### 評価エンジン v2 の改善点

評価エンジンは、追加の分析結果を生成します（v0.6.0以降）。

| 機能 | 説明 |
| --------- | ------------- |
| 主要な要因 | レベルの決定に最も重要な3〜5つの要因と、その重み付け |
| リスクに関する説明 | 何も行わなかった場合に発生するリスクをまとめた説明文 |
| DuPont-Lite分析 | 商標の類似性、チャネルの重複、知名度指標、および意図指標のスコア |
| より安全な代替案 | 接頭辞/接尾辞/区切り文字/略語/複合などの戦略を使用した、5つの代替の名前の提案 |

主要な要因とリスクに関する説明は、テンプレートカタログを使用しており、決定論的であり、LLMによるテキスト生成は行われません。 DuPont-Liteの要因は、DuPontの商標分析フレームワークに触発されていますが、法的助言ではありません。

### コーチング出力（v0.7.0以降）

| 機能 | 説明 |
| --------- | ------------- |
| 次のアクション | レベルと検出結果に基づいて提案される、2〜4つの次のステップ |
| カバレッジスコア | 要求された名前空間のうち、正常にチェックされたものの割合を示す0〜100%の指標 |
| 未チェックの名前空間 | ステータスが不明な名前空間のリスト |
| 免責事項 | レポートの内容と範囲を説明する法的免責事項 |
| 競合カード | 各競合タイプに関する決定論的な説明カード | `collisionCards[]` に関する意見 |

次のアクションは、予約リンクである `recommendedActions` とは異なります。これらは、ガイダンスとなるテキストを提供します。「今すぐ申請」「--radar オプションで再実行」「商標弁護士にご相談ください」など。

---

## 出力形式

実行ごとに、以下の4つのファイルが生成されます。

```
reports/<date>/
├── run.json           # Complete run object (per schema)
├── run.md             # Human-readable clearance report with score table
├── report.html        # Self-contained attorney packet (dark theme)
├── summary.json       # Condensed summary for integrations
└── manifest.json      # SHA-256 lockfile for tamper detection (via gen-lock)
```

### 弁護士向けレポート (`report.html`)

弁護士との共有に適した、自己完結型のHTMLレポート。完全な意見、スコアの内訳表、名前空間チェック、調査結果、証拠の連鎖、およびクリック可能な予約リンクを含む推奨アクションが含まれます。ダークテーマで、外部依存はありません。

### 概要JSON (`summary.json`)

連携のための簡潔な出力。ティア、総合スコア、名前空間の状態、調査結果の概要、類似名前の検出数、照合されたデータセットの数、類似バリアントの数、および推奨アクションが含まれます。

---

## 1.0の基準

エンジンがv1.0.0に到達する前に、以下の条件が満たされている必要があります。

- [x] アーティファクトスキーマが公開され、CIで検証済み (`summary.schema.json`, `index-entry.schema.json`)
- [ ] アダプターの信頼性が文書化されている（稼働時間、レート制限、各チャネルのフォールバック動作）
- [x] 互換性ポリシーが明記され、適用されている (`docs/VERSIONING.md`)
- [x] ウェブサイトの利用状況が安定していることが確認されている (`nameops` + マーケティングサイトからの `summary.json` の取得 → `/lab/clearance/`)
- [x] ゴールデン・スナップショットテストが、すべてのティアの結果（GREEN、YELLOW、RED）をカバーしている
- [ ] 類似名前検出機能が、実際の実行結果に対して検証されている

---

## インストール

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

## 使用方法

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

組み込みのスキーマに対して、JSONアーティファクト (`run.json`, `summary.json`, `runs.json`) を検証します。各ファイルに対して、合格/不合格のインジケーターを表示します。すべてのファイルが有効な場合は0、そうでない場合は1を返します。

### バッチモード

`coe batch <file>` は、`.txt` または `.json` ファイルから候補となる名前を読み込み、共有キャッシュと並行制御を使用して各名前をチェックし、各名前ごとの実行アーティファクトと、バッチレベルの概要を生成します。

**テキスト形式** (`.txt`): 1行に1つの名前。空白行と `#` で始まるコメントは無視されます。

**JSON形式** (`.json`): 文字列の配列 `["name1", "name2"]` または、`{"name": "name1", "riskTolerance": "aggressive"}` のようなオブジェクトの配列。

出力構造:
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

### リプレイコマンド

`coe replay <dir>` は、指定されたディレクトリから `run.json` を読み込み、マニフェストが存在する場合はそれを検証し、すべての出力を `replay/` サブディレクトリに再生成します。その後、再生成されたMarkdownと元のものを比較して、再現性を検証します。

```bash
# Run a check
node src/index.mjs check my-cool-tool --output reports

# Generate manifest (SHA-256 lockfile)
node scripts/gen-lock.mjs reports/2026-02-15

# Later: verify nothing changed
node src/index.mjs replay reports/2026-02-15
```

---

## 設定

設定ファイルは不要です。すべてのオプションは、コマンドラインフラグで指定します。

| フラグ | デフォルト値 | 説明 |
| ------ | --------- | ------------- |
| `--channels` | `github,npm,pypi,domain` | チェックするチャンネル。明示的なリスト、グループ名 (`core`, `dev`, `ai`, `all`)、または追加 (`+cratesio,+dockerhub`) を指定できます。 |
| `--org` | _(なし)_ | 組織名が利用可能かどうかをチェックするGitHub組織 |
| `--risk` | `conservative` | リスク許容度: `conservative` (保守的), `balanced` (バランス), `aggressive` (積極的) |
| `--output` | `reports/` | 実行アーティファクトの出力ディレクトリ |
| `--radar` | _(無効)_ | 類似名前検出機能を有効にする (GitHub + npm + crates.io + Docker Hub で類似の名前を検索) |
| `--suggest` | _(無効)_ | 意見の中で、より安全な代替の名前の提案を生成する |
| `--corpus` | _(なし)_ | 比較対象の既知の商標のJSONコーパスへのパス |
| `--cache-dir` | _(無効)_ | アダプターの応答をキャッシュするディレクトリ (または `COE_CACHE_DIR` を設定) |
| `--max-age-hours` | `24` | キャッシュの有効期間 (時間) ( `--cache-dir` が必要) |
| `--dockerNamespace` | _(なし)_ | Docker Hubのネームスペース (ユーザー/組織) — `dockerhub` チャンネルを有効にする場合に必要 |
| `--hfOwner` | _(なし)_ | Hugging Faceの所有者（ユーザー/組織） — `huggingface`チャンネルを有効にすると必須 |
| `--fuzzyQueryMode` | `registries` | あいまい検索モード: `off`、`registries`、`all` |
| `--concurrency` | `4` | バッチモードでの同時チェックの最大数 |
| `--resume` | _(なし)_ | 以前の出力ディレクトリからバッチを再開します（完了した名前はスキップされます）。 |
| `--variantBudget` | `12` | レジストリごとのあいまい検索の最大件数（最大：30）。 |

### 環境変数

| 変数 | 効果 |
| ---------- | -------- |
| `GITHUB_TOKEN` | GitHub APIのレート制限を、1時間あたり60回から5,000回に引き上げます。 |
| `COE_CACHE_DIR` | デフォルトのキャッシュディレクトリ（CLIの`--cache-dir`フラグが優先されます）。 |

---

## スキーマ

標準データモデルは、`schema/clearance.schema.json`（JSON Schema 2020-12）で定義されています。

キーの種類: `run`、`intake`、`candidate`、`channel`、`variants`、`namespaceCheck`、`finding`、`evidence`、`opinion`、`scoreBreakdown`、`manifest`。

---

## テスト

```bash
npm test            # unit tests
npm run test:e2e    # integration tests with golden snapshots
npm run test:all    # all tests
```

すべてのテストは、アダプターを注入して行われます（ネットワーク接続は不要）。ゴールデン・スナップショットは、バイト単位での完全一致を保証します。

---

## エラーコード

| コード | 意味 |
| ------ | --------- |
| `COE.INIT.NO_ARGS` | 候補名が提供されていません。 |
| `COE.INIT.BAD_CHANNEL` | `--channels`に不明なチャンネルが含まれています。 |
| `COE.ADAPTER.GITHUB_FAIL` | GitHub APIから予期しないエラーが返されました。 |
| `COE.ADAPTER.NPM_FAIL` | npmレジストリから予期しないエラーが返されました。 |
| `COE.ADAPTER.PYPI_FAIL` | PyPI APIから予期しないエラーが返されました。 |
| `COE.ADAPTER.DOMAIN_FAIL` | RDAPルックアップに失敗しました。 |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | RDAPのレート制限を超えました（HTTP 429）。 |
| `COE.ADAPTER.CRATESIO_FAIL` | crates.io APIから予期しないエラーが返されました。 |
| `COE.ADAPTER.DOCKERHUB_FAIL` | Docker Hub APIから予期しないエラーが返されました。 |
| `COE.ADAPTER.HF_FAIL` | Hugging Face APIから予期しないエラーが返されました。 |
| `COE.ADAPTER.RADAR_GITHUB_FAIL` | GitHub Search APIにアクセスできません。 |
| `COE.ADAPTER.RADAR_NPM_FAIL` | npm Search APIにアクセスできません。 |
| `COE.ADAPTER.RADAR_CRATESIO_FAIL` | crates.io Search APIにアクセスできません。 |
| `COE.ADAPTER.RADAR_DOCKERHUB_FAIL` | Docker Hub Search APIにアクセスできません。 |
| `COE.DOCTOR.FATAL` | `doctor`コマンドが失敗しました。 |
| `COE.DOCKER.NAMESPACE_REQUIRED` | Docker Hubチャンネルが、`--dockerNamespace`なしで有効になっています。 |
| `COE.HF.OWNER_REQUIRED` | Hugging Faceチャンネルが、`--hfOwner`なしで有効になっています。 |
| `COE.VARIANT.FUZZY_HIGH` | あいまい検索の件数が閾値を超えています（情報）。 |
| `COE.CORPUS.INVALID` | コーパスファイルの形式が不正です。 |
| `COE.CORPUS.NOT_FOUND` | 指定されたパスにコーパスファイルが見つかりません。 |
| `COE.RENDER.WRITE_FAIL` | 出力ファイルを書き込めませんでした。 |
| `COE.LOCK.MISMATCH` | ロックファイルの検証に失敗しました（改ざんされています）。 |
| `COE.REPLAY.NO_RUN` | リプレイディレクトリに`run.json`が存在しません。 |
| `COE.REPLAY.HASH_MISMATCH` | リプレイ中にマニフェストのハッシュが一致しません。 |
| `COE.REPLAY.MD_DIFF` | 再生成されたMarkdownが元のものと異なります。 |
| `COE.BATCH.BAD_FORMAT` | サポートされていないバッチファイル形式です。 |
| `COE.BATCH.EMPTY` | バッチファイルに名前がありません。 |
| `COE.BATCH.DUPLICATE` | バッチファイルに重複した名前があります。 |
| `COE.BATCH.TOO_MANY` | バッチファイルが500件の制限を超えています。 |
| `COE.REFRESH.NO_RUN` | リフレッシュディレクトリに`run.json`が存在しません。 |
| `COE.PUBLISH.NOT_FOUND` | 公開用の実行ディレクトリが見つかりません。 |
| `COE.PUBLISH.NO_FILES` | 公開可能なファイルがディレクトリにありません。 |
| `COE.PUBLISH.SECRET_DETECTED` | 公開出力に機密情報が含まれている可能性があります（警告）。 |
| `COE.NET.DNS_FAIL` | DNSルックアップに失敗しました。ネットワーク接続を確認してください。 |
| `COE.NET.CONN_REFUSED` | リモートサーバーからの接続を拒否されました。 |
| `COE.NET.TIMEOUT` | リクエストのタイムアウトが発生しました。 |
| `COE.NET.RATE_LIMITED` | レート制限されています。しばらく待ってから再試行してください。 |
| `COE.FS.PERMISSION` | ディスクへの書き込み権限がありません。 |
| `COE.CORPUS.EXISTS` | コーパスファイルがすでに存在します（初期化時）。 |
| `COE.CORPUS.EMPTY_NAME` | 名前は必須ですが、空です。 |
| `COE.VALIDATE.*` | アーティファクトの検証エラーが発生しました。 |

完全なエラー参照とトラブルシューティングガイドについては、[docs/RUNBOOK.md](docs/RUNBOOK.md) を参照してください。

---

## 安全

- **読み取り専用**: どの名前空間、レジストリ、またはリポジトリも変更しません。
- **決定論的**: 同じ入力からは常に同じ出力が得られます。
- **証拠に基づく**: すべての意見は、SHA-256 ハッシュによる特定のチェックに由来します。
- **保守的**: 不確実な場合は、デフォルトで「黄色」または「赤色」と判断します。
- **出力に機密情報を含まない**: API トークンはレポートに表示されません。
- **XSS 対策済み**: ユーザーが入力した文字列は、アトネーパケット内で HTML エスケープされます。
- **機密情報のマスキング**: トークン、API キー、および Authorization ヘッダーは、書き込み前に削除されます。
- **機密情報スキャン**: `coe publish` コマンドは、書き込み前に出力に漏洩したトークンがないかスキャンします。

---

## 制限事項

- 法的な助言ではありません。商標調査や専門家のアドバイスの代わりにはなりません。
- 商標データベースのチェックはありません（USPTO、EUIPO、WIPO）。
- コリジョンレーダーは、市場での利用状況を示す指標であり、正式な商標調査ではありません。
- コーパス比較は、ユーザーが提供した商標のみを対象とし、網羅的なデータベースではありません。
- ドメインチェックは、`.com` と `.dev` のみに対応しています。
- Docker Hub を使用する場合は、`--dockerNamespace` オプションが必要です。Hugging Face を使用する場合は、`--hfOwner` オプションが必要です。
- フジィマッチングは、編集距離が 1 の場合にのみ適用されます。検索対象は npm、PyPI、crates.io に限定されます。
- 音声分析は、主に英語を対象としています（Metaphone アルゴリズム）。
- ホモグリフ検出は、ASCII、キリル文字、およびギリシャ文字に対応しています（すべての Unicode スクリプトではありません）。
- ソーシャルメディアのハンドルチェックはありません。
- すべてのチェックは、特定の時点でのスナップショットです。
- バッチモードでは、ファイルあたり最大 500 の名前まで処理できます。
- 新しさの検出は、情報提供のみを目的としており、評価レベルは変更しません。

詳細については、[docs/LIMITATIONS.md](docs/LIMITATIONS.md) を参照してください。

---

## ライセンス

MIT

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> が作成しました。
