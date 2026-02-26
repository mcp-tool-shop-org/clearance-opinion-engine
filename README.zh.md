<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

确定性的“名称可用性 + 审查意见”引擎。

给定一个候选名称，它会检查实际命名空间的可用性（GitHub 组织/仓库、npm、PyPI、通过 RDAP 的域名、crates.io、Docker Hub、Hugging Face），生成语言变体（标准化、分词、音译、同形字、模糊编辑距离=1），通过“碰撞雷达”扫描相似名称（GitHub + npm 搜索），查询注册表以查找模糊变体的冲突，与用户提供的已知标识进行比较，并生成一个保守的审查意见（绿色/黄色/红色），并提供可解释的评分细分、执行摘要、覆盖矩阵和完整的证据链。

---

## 信任协议

- **相同的输入 + 相同的适配器响应 = 字节完全相同的输出。**
- 每次检查都会生成一个包含 SHA-256 值、时间戳和重现步骤的 `evidence` 对象。
- 审查意见是保守的：只有当 _所有_ 命名空间检查都通过 _并且_ 没有音译/同形字冲突时，才会显示为绿色。
- 该引擎绝不发送、发布或修改任何内容。它只读取和报告。
- 评分细分解释了为什么会分配某个等级，但不会覆盖基于规则的等级逻辑。

---

## 它会检查的内容

| 频道 | 命名空间 | 方法 |
| --------- | ----------- | -------- |
| GitHub | 组织名称 | `GET /orgs/{name}` → 404 = 可用 |
| GitHub | 仓库名称 | `GET /repos/{owner}/{name}` → 404 = 可用 |
| npm | 包 | `GET https://registry.npmjs.org/{name}` → 404 = 可用 |
| PyPI | 包 | `GET https://pypi.org/pypi/{name}/json` → 404 = 可用 |
| 域名 | `.com`, `.dev` | RDAP (RFC 9083) 通过 `rdap.org` → 404 = 可用 |
| crates.io | Crate | `GET https://crates.io/api/v1/crates/{name}` → 404 = 可用 |
| Docker Hub | 仓库 | `GET https://hub.docker.com/v2/repositories/{ns}/{name}` → 404 = 可用 |
| Hugging Face | 模型 | `GET https://huggingface.co/api/models/{owner}/{name}` → 404 = 可用 |
| Hugging Face | 空间 | `GET https://huggingface.co/api/spaces/{owner}/{name}` → 404 = 可用 |

### 频道组

| 组 | 频道 |
| ------- | ---------- |
| `core` (默认) | github, npm, pypi, domain |
| `dev` | cratesio, dockerhub |
| `ai` | huggingface |
| `all` | 所有频道 |

使用 `--channels <group>` 设置预设，或使用 `--channels +cratesio,+dockerhub` 进行增量配置（添加到默认配置）。

### 指示性信号（可选）

| 来源 | 它会搜索的内容 | 方法 |
| -------- | ----------------- | -------- |
| 碰撞雷达 | GitHub 仓库 | `GET /search/repositories?q={name}` → 相似度评分 |
| 碰撞雷达 | npm 包 | `GET /-/v1/search?text={name}` → 相似度评分 |
| 碰撞雷达 | crates.io crate | `GET https://crates.io/api/v1/crates?q={name}` → 相似度评分 |
| 碰撞雷达 | Docker Hub 仓库 | `GET https://hub.docker.com/v2/search/repositories?query={name}` → 相似度评分 |
| 语料库 | 用户提供的标识 | 离线 Jaro-Winkler + Metaphone 比较 |

所有适配器调用都使用指数退避重试机制（2次重试，基本延迟500毫秒）。 启用磁盘缓存可以减少重复的API调用。

---

## 生成的内容

### 变体

| 类型 | 示例输入 | 示例输出 |
| ------ | --------------- | ---------------- |
| 标准化 | `My Cool Tool` | `my-cool-tool` |
| 分词 | `my-cool-tool` | `["my", "cool", "tool"]` |
| 语音（Metaphone） | `["my", "cool", "tool"]` | `["M", "KL", "TL"]` |
| 同形字 | `my-cool-tool` | `["my-c00l-tool", "my-co0l-t00l"]`（ASCII + 斯拉夫语 + 希腊语） |
| 模糊匹配（编辑距离=1） | `my-cool-tool` | `["my-cool-too", "my-cool-tools", ...]` |

### 风险等级

| 等级 | 含义 |
| ------ | --------- |
| 🟢 绿色 | 所有命名空间可用，没有语音/同形字冲突。 |
| 🟡 黄色 | 某些检查结果不确定（网络问题），存在潜在冲突，或选择了模糊变体。 |
| 🔴 红色 | 存在确切冲突、语音冲突或高风险混淆。 |

### 评分细分

每个风险等级都包含加权评分细分，用于解释：

| 子评分 | 衡量内容 |
| ----------- | ----------------- |
| 命名空间可用性 | 已检查的可用命名空间的比例。 |
| 覆盖完整性 | 检查了多少种命名空间类型（4种中的）。 |
| 冲突严重性 | 针对确切冲突、语音冲突、混淆冲突、潜在冲突以及选择模糊变体的惩罚。 |
| 域名可用性 | 已检查的顶级域名（TLD）中，可用域名的比例。 |

风险等级配置文件（`--risk` 标志）：**保守**（默认）、**平衡**、**激进**。 较高的风险容忍度会降低绿色/黄色等级的阈值，并将权重转移到命名空间可用性。

> **注意：** 等级始终基于规则——确切冲突会导致红色，无论数值评分如何。 细分只是用于解释的附加元数据。

### 风险等级 v2 增强功能

风险评估引擎会生成额外的分析（v0.6.0+）：

| 功能 | 描述 |
| --------- | ------------- |
| 主要因素 | 驱动等级决策的 3-5 个最重要的因素，以及权重分类。 |
| 风险描述 | 一个确定性的“如果什么都不做……”段落，总结了风险。 |
| DuPont-Lite 分析 | 相似性评分、渠道重叠、声誉代理和意图代理评分。 |
| 更安全的替代方案 | 5 个确定性的替代名称建议，使用前缀/后缀/分隔符/缩写/组合策略。 |

主要因素和风险描述使用模板目录——确定性，不使用 LLM 文本。 DuPont-Lite 因素灵感来自 DuPont 商标分析框架，但并非法律建议。

### 指导输出（v0.7.0+）

| 功能 | 描述 |
| --------- | ------------- |
| 下一步行动 | 2-4 个指导步骤（“下一步该做什么”）基于等级 + 发现结果。 |
| 覆盖率评分 | 衡量成功检查的请求命名空间的比例，范围为 0-100%。 |
| 未检查的命名空间 | 列出返回未知状态的命名空间。 |
| 免责声明 | 法律声明，说明报告的内容和不包含的内容。 |
| 冲突卡片 | 针对每种冲突类型的确定性解释卡片。 | `collisionCards[]` 在意见中 |

后续操作与 `recommendedActions`（即预订链接）不同。它们提供指导性文字，例如：“立即申请”、“使用 --radar 重新运行”、“咨询商标律师”等。

---

## 输出格式

每次运行会生成四个文件：

```
reports/<date>/
├── run.json           # Complete run object (per schema)
├── run.md             # Human-readable clearance report with score table
├── report.html        # Self-contained attorney packet (dark theme)
├── summary.json       # Condensed summary for integrations
└── manifest.json      # SHA-256 lockfile for tamper detection (via gen-lock)
```

### 律师报告 (`report.html`)

一个独立的 HTML 报告，适合与律师分享。包含完整的意见、评分细分表、命名空间检查结果、发现、证据链，以及带有可点击预订链接的建议操作。采用深色主题，无外部依赖。

### 摘要 JSON (`summary.json`)

一个精简的输出，用于集成：等级、总体评分、命名空间状态、发现摘要、碰撞雷达计数、语料库匹配计数、模糊匹配变体计数，以及建议操作。

---

## 1.0 标准

在引擎达到 v1.0.0 版本之前，以下条件必须满足：

- [x] 资源模式已发布并在 CI 中验证 (`summary.schema.json`, `index-entry.schema.json`)
- [ ] 适配器可靠性已记录（正常运行时间、速率限制、每个渠道的故障保护行为）
- [x] 兼容性策略已声明并实施 (`docs/VERSIONING.md`)
- [x] 网站访问稳定性已验证（`nameops` + 营销网站读取 `summary.json` → `/lab/clearance/`）
- [x] 黄金快照测试覆盖所有等级结果（绿色、黄色、红色）
- [ ] 碰撞卡已针对真实世界的运行进行验证

---

## 安装

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

## 使用

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

### `coe validate-artifacts <目录>`

验证 JSON 资源 (`run.json`, `summary.json`, `runs.json`) 与内置模式。打印每个文件的通过/失败指示。如果所有文件都有效，则退出状态码为 0，否则为 1。

### 批量模式

`coe batch <文件>` 从 `.txt` 或 `.json` 文件中读取候选名称，使用共享缓存和并发控制检查每个名称，并生成每个名称的运行资源以及批量级别的摘要。

**文本格式** (`.txt`)：每行一个名称。空行和以 `#` 开头的注释将被忽略。

**JSON 格式** (`.json`)：字符串数组 `["name1", "name2"]` 或对象数组 `[{ "name": "name1", "riskTolerance": "aggressive" }]`。

输出结构：
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

### 重放命令

`coe replay <目录>` 从指定的目录读取 `run.json`，验证清单（如果存在），并重新生成所有输出到 `replay/` 子目录中。然后，它将比较重新生成的 Markdown 与原始文件，以验证确定性。

```bash
# Run a check
node src/index.mjs check my-cool-tool --output reports

# Generate manifest (SHA-256 lockfile)
node scripts/gen-lock.mjs reports/2026-02-15

# Later: verify nothing changed
node src/index.mjs replay reports/2026-02-15
```

---

## 配置

不需要配置文件。所有选项都是 CLI 标志：

| 标志 | 默认值 | 描述 |
| ------ | --------- | ------------- |
| `--channels` | `github,npm,pypi,domain` | 要检查的渠道。接受显式列表、组名 (`core`, `dev`, `ai`, `all`) 或增量 (`+cratesio,+dockerhub`) |
| `--org` | _(无)_ | 要检查的 GitHub 组织，以确定组织名称的可用性 |
| `--risk` | `conservative` | 风险承受度：`conservative`（保守）、`balanced`（平衡）、`aggressive`（激进） |
| `--output` | `reports/` | 运行资源的输出目录 |
| `--radar` | _(禁用)_ | 启用碰撞雷达（在 GitHub、npm、crates.io 和 Docker Hub 上搜索相似名称） |
| `--suggest` | _(禁用)_ | 在意见中生成更安全的替代名称建议 |
| `--corpus` | _(无)_ | 用于比较的已知商标语料库的 JSON 路径 |
| `--cache-dir` | _(禁用)_ | 缓存适配器响应的目录（或设置 `COE_CACHE_DIR`） |
| `--max-age-hours` | `24` | 缓存 TTL（小时）（需要 `--cache-dir`） |
| `--dockerNamespace` | _(无)_ | Docker Hub 命名空间（用户/组织）——当启用 `dockerhub` 渠道时需要 |
| `--hfOwner` | _(无)_ | Hugging Face 用户/组织名称 — 当启用 `huggingface` 频道时，此项为必填。 |
| `--fuzzyQueryMode` | `registries` | 模糊匹配查询模式：`off`（关闭）、`registries`（仅限注册表）、`all`（全部）。 |
| `--concurrency` | `4` | 批量模式下，最大并发检查数量。 |
| `--resume` | _(无)_ | 从之前的输出目录恢复批量任务（跳过已完成的名称）。 |
| `--variantBudget` | `12` | 每个注册表中，最大模糊匹配的变体数量（最大：30）。 |

### 环境变量

| 变量 | 作用 |
| ---------- | -------- |
| `GITHUB_TOKEN` | 将 GitHub API 的速率限制从每小时 60 次提高到 5000 次。 |
| `COE_CACHE_DIR` | 默认缓存目录（CLI 的 `--cache-dir` 标志优先级更高）。 |

---

## Schema（模式）

规范的数据模型定义在 `schema/clearance.schema.json` 文件中（JSON Schema 2020-12 版本）。

主要类型：`run`（运行）、`intake`（导入）、`candidate`（候选）、`channel`（频道）、`variants`（变体）、`namespaceCheck`（命名空间检查）、`finding`（发现）、`evidence`（证据）、`opinion`（意见）、`scoreBreakdown`（评分细分）、`manifest`（清单）。

---

## 测试

```bash
npm test            # unit tests
npm run test:e2e    # integration tests with golden snapshots
npm run test:all    # all tests
```

所有测试都使用注入的适配器（不进行任何网络调用）。黄金快照强制执行字节级别的完全一致性。

---

## 错误代码

| 代码 | 含义 |
| ------ | --------- |
| `COE.INIT.NO_ARGS` | 未提供候选名称。 |
| `COE.INIT.BAD_CHANNEL` | `--channels` 中未知的频道。 |
| `COE.ADAPTER.GITHUB_FAIL` | GitHub API 返回了意外的错误。 |
| `COE.ADAPTER.NPM_FAIL` | npm 注册表返回了意外的错误。 |
| `COE.ADAPTER.PYPI_FAIL` | PyPI API 返回了意外的错误。 |
| `COE.ADAPTER.DOMAIN_FAIL` | RDAP 查询失败。 |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | 超过 RDAP 速率限制（HTTP 429）。 |
| `COE.ADAPTER.CRATESIO_FAIL` | crates.io API 返回了意外的错误。 |
| `COE.ADAPTER.DOCKERHUB_FAIL` | Docker Hub API 返回了意外的错误。 |
| `COE.ADAPTER.HF_FAIL` | Hugging Face API 返回了意外的错误。 |
| `COE.ADAPTER.RADAR_GITHUB_FAIL` | 无法访问 GitHub Search API。 |
| `COE.ADAPTER.RADAR_NPM_FAIL` | 无法访问 npm Search API。 |
| `COE.ADAPTER.RADAR_CRATESIO_FAIL` | 无法访问 crates.io Search API。 |
| `COE.ADAPTER.RADAR_DOCKERHUB_FAIL` | 无法访问 Docker Hub Search API。 |
| `COE.DOCTOR.FATAL` | Doctor 命令执行失败。 |
| `COE.DOCKER.NAMESPACE_REQUIRED` | 启用了 Docker Hub 频道，但未提供 `--dockerNamespace`。 |
| `COE.HF.OWNER_REQUIRED` | 启用了 Hugging Face 频道，但未提供 `--hfOwner`。 |
| `COE.VARIANT.FUZZY_HIGH` | 模糊匹配的变体数量超过了阈值（仅为提示信息）。 |
| `COE.CORPUS.INVALID` | 语料库文件格式无效。 |
| `COE.CORPUS.NOT_FOUND` | 未在指定路径找到语料库文件。 |
| `COE.RENDER.WRITE_FAIL` | 无法写入输出文件。 |
| `COE.LOCK.MISMATCH` | 锁文件验证失败（已篡改）。 |
| `COE.REPLAY.NO_RUN` | replay 目录中没有 `run.json` 文件。 |
| `COE.REPLAY.HASH_MISMATCH` | replay 过程中，清单哈希值不匹配。 |
| `COE.REPLAY.MD_DIFF` | 重新生成的 Markdown 与原始文件不同。 |
| `COE.BATCH.BAD_FORMAT` | 不支持的批量文件格式。 |
| `COE.BATCH.EMPTY` | 批量文件中不包含任何名称。 |
| `COE.BATCH.DUPLICATE` | 批量文件中存在重复的名称。 |
| `COE.BATCH.TOO_MANY` | 批量文件超过了 500 个名称的安全限制。 |
| `COE.REFRESH.NO_RUN` | refresh 目录中没有 `run.json` 文件。 |
| `COE.PUBLISH.NOT_FOUND` | 未找到用于发布的运行目录。 |
| `COE.PUBLISH.NO_FILES` | 目录中没有可发布的任何文件。 |
| `COE.PUBLISH.SECRET_DETECTED` | 在发布输出中可能检测到敏感信息（警告）。 |
| `COE.NET.DNS_FAIL` | DNS 解析失败 — 请检查网络连接。 |
| `COE.NET.CONN_REFUSED` | 远程服务器拒绝连接。 |
| `COE.NET.TIMEOUT` | 请求超时。 |
| `COE.NET.RATE_LIMITED` | 达到速率限制 — 请等待并重试。 |
| `COE.FS.PERMISSION` | 写入磁盘时权限被拒绝。 |
| `COE.CORPUS.EXISTS` | 语料库文件已存在（在初始化时）。 |
| `COE.CORPUS.EMPTY_NAME` | 名称必须填写，但为空。 |
| `COE.VALIDATE.*` | 工件验证出现错误。 |

请参阅 [docs/RUNBOOK.md](docs/RUNBOOK.md)，以获取完整的错误参考和故障排除指南。

---

## 安全

- **只读模式**: 从不修改任何命名空间、注册表或仓库。
- **确定性**: 相同的输入始终产生相同的输出。
- **基于证据**: 每一个观点都可追溯到具体的检查，并带有 SHA-256 哈希值。
- **保守**: 在不确定时，默认显示为黄色/红色。
- **输出中不包含敏感信息**: API 令牌绝不会出现在报告中。
- **防止跨站脚本攻击 (XSS)**: 所有用户字符串在“attorney packet”中都经过 HTML 编码处理。
- **敏感信息脱敏**: 在写入之前，令牌、API 密钥和 Authorization 头部会被移除。
- **敏感信息扫描**: `coe publish` 命令在写入之前会扫描输出，以查找可能泄露的令牌。

---

## 限制

- 本工具不提供法律建议，不属于商标检索，也不能替代专业的法律咨询。
- 不进行商标数据库检查（包括美国专利商标局、欧盟知识产权局和世界知识产权组织）。
- 碰撞雷达仅提供指示性信息（市场使用信号），不属于权威的商标检索。
- 语料库比较仅针对用户提供的商标，不包含全面的数据库。
- 域名检查仅覆盖 `.com` 和 `.dev` 域名。
- Docker Hub 需要使用 `--dockerNamespace` 参数；Hugging Face 需要使用 `--hfOwner` 参数。
- 模糊匹配的变体仅限于编辑距离为 1；查询仅限于 npm、PyPI 和 crates.io。
- 音韵分析以英语为中心（使用 Metaphone 算法）。
- 同形字检测覆盖 ASCII、西里尔字母和希腊字母（不包括所有 Unicode 字符集）。
- 不进行社交媒体账号检查。
- 所有检查都是特定时间点的快照。
- 批量模式每个文件最多处理 500 个名称。
- 新鲜度检测仅提供信息，不会改变风险等级。

请参阅 [docs/LIMITATIONS.md](docs/LIMITATIONS.md) 获取完整的列表。

---

## 许可证

MIT

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
