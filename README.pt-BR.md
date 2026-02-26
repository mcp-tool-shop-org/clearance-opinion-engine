<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

Motor determinístico de "disponibilidade de nome + análise de viabilidade".

Dado um nome candidato, ele verifica a disponibilidade real do namespace (organização/repositório do GitHub, npm, PyPI, domínio via RDAP, crates.io, Docker Hub, Hugging Face), gera variantes linguísticas (normalizadas, tokenizadas, fonéticas, homóglifas, distância de edição aproximada = 1), procura nomes semelhantes através de um sistema de detecção de colisões (busca do GitHub + npm), consulta registros para conflitos de variantes aproximadas, compara com marcas conhecidas fornecidas pelo usuário e gera uma análise de viabilidade conservadora (VERDE / AMARELO / VERMELHO) com uma discriminação detalhada da pontuação, resumo executivo, matriz de cobertura e cadeia completa de evidências.

---

## Contrato de veracidade

- **Mesmas entradas + mesmas respostas do adaptador = saída idêntica em bytes.**
- Cada verificação produz um objeto `evidence` com SHA-256, timestamp e etapas de reprodução.
- As análises são conservadoras: VERDE apenas quando _todas_ as verificações de namespace estão livres _e_ não existem colisões fonéticas/homóglifas.
- O motor nunca envia, publica ou modifica nada. Ele apenas lê e reporta.
- A discriminação da pontuação explica _por que_ um nível foi atribuído, mas nunca substitui a lógica baseada em regras do nível.

---

## O que é verificado

| Canal | Namespace | Método |
| --------- | ----------- | -------- |
| GitHub | Nome da organização | `GET /orgs/{name}` → 404 = disponível |
| GitHub | Nome do repositório | `GET /repos/{owner}/{name}` → 404 = disponível |
| npm | Pacote | `GET https://registry.npmjs.org/{name}` → 404 = disponível |
| PyPI | Pacote | `GET https://pypi.org/pypi/{name}/json` → 404 = disponível |
| Domínio | `.com`, `.dev` | RDAP (RFC 9083) via `rdap.org` → 404 = disponível |
| crates.io | Crate | `GET https://crates.io/api/v1/crates/{name}` → 404 = disponível |
| Docker Hub | Repositório | `GET https://hub.docker.com/v2/repositories/{ns}/{name}` → 404 = disponível |
| Hugging Face | Modelo | `GET https://huggingface.co/api/models/{owner}/{name}` → 404 = disponível |
| Hugging Face | Espaço | `GET https://huggingface.co/api/spaces/{owner}/{name}` → 404 = disponível |

### Grupos de canais

| Grupo | Canais |
| ------- | ---------- |
| `core` (padrão) | github, npm, pypi, domínio |
| `dev` | cratesio, dockerhub |
| `ai` | huggingface |
| `all` | todos os canais |

Use `--channels <grupo>` para predefinições, ou `--channels +cratesio,+dockerhub` para sintaxe aditiva (adiciona ao padrão).

### Sinais indicativos (opcional)

| Fonte | O que é pesquisado | Método |
| -------- | ----------------- | -------- |
| Detecção de Colisões | Repositórios do GitHub | `GET /search/repositories?q={name}` → pontuação de similaridade |
| Detecção de Colisões | Pacotes npm | `GET /-/v1/search?text={name}` → pontuação de similaridade |
| Detecção de Colisões | Crates do crates.io | `GET https://crates.io/api/v1/crates?q={name}` → pontuação de similaridade |
| Detecção de Colisões | Repositórios do Docker Hub | `GET https://hub.docker.com/v2/search/repositories?query={name}` → pontuação de similaridade |
| Corpus | Marcas fornecidas pelo usuário | Comparação offline Jaro-Winkler + Metaphone |

Todas as chamadas de adaptador utilizam um mecanismo de repetição com retrocesso exponencial (2 tentativas, atraso base de 500ms). O cache de disco opcional reduz o número de chamadas de API repetidas.

---

## O que é gerado

### Variantes

| Tipo | Entrada de exemplo | Saída de exemplo |
| ------ | --------------- | ---------------- |
| Normalizado | `My Cool Tool` | `my-cool-tool` |
| Tokenizado | `my-cool-tool` | `["my", "cool", "tool"]` |
| Fonético (Metaphone) | `["my", "cool", "tool"]` | `["M", "KL", "TL"]` |
| Homógrafos | `my-cool-tool` | `["my-c00l-tool", "my-co0l-t00l"]` (ASCII + Cirílico + Grego) |
| Similaridade (distância de edição=1) | `my-cool-tool` | `["my-cool-too", "my-cool-tools", ...]` |

### Níveis de opinião

| Nível | Significado |
| ------ | --------- |
| 🟢 VERDE | Todos os namespaces disponíveis, sem conflitos fonéticos/de homógrafos. |
| 🟡 AMARELO | Algumas verificações inconclusivas (rede), conflitos próximos ou variante considerada. |
| 🔴 VERMELHO | Conflito exato, colisão fonética ou alto risco de confusão. |

### Detalhes da pontuação

Cada opinião inclui uma detalhada divisão da pontuação ponderada para fins de explicação:

| Sub-pontuação | O que é medido |
| ----------- | ----------------- |
| Disponibilidade do Namespace | Proporção de namespaces verificados que estão disponíveis. |
| Completude da Cobertura | Quantos tipos de namespace foram verificados (de um total de 4). |
| Gravidade do Conflito | Penalidade para conflitos exatos, fonéticos, de confusão, próximos e variantes consideradas. |
| Disponibilidade do Domínio | Proporção de TLDs verificados com domínios disponíveis. |

Perfis de peso (`--risk` flag): **conservador** (padrão), **equilibrado**, **agressivo**. Uma maior tolerância ao risco diminui os limites para os níveis VERDE/AMARELO e desloca o peso para a disponibilidade do namespace.

> **Observação**: O nível é sempre baseado em regras — conflitos exatos resultam em VERMELHO, independentemente da pontuação numérica. A divisão é metadados adicionais apenas para fins de explicação.

### Melhorias na opinião v2

O motor de opinião produz análises adicionais (v0.6.0+):

| Recurso | Descrição |
| --------- | ------------- |
| Fatores Principais | 3 a 5 fatores mais importantes que influenciam a decisão do nível, com classificação de peso. |
| Narrativa de Risco | Um parágrafo determinístico do tipo "Se você não fizer nada..." que resume o risco. |
| Análise DuPont-Lite | Similaridade de marcas, sobreposição de canais, proxy de fama e pontuações de proxy de intenção. |
| Alternativas Mais Seguras | 5 sugestões determinísticas de nomes alternativos usando prefixos/sufixos/separadores/abreviações/compostos. |

Os fatores principais e as narrativas de risco usam catálogos de modelos — determinísticos, sem texto de LLM. Os fatores DuPont-Lite são inspirados no framework de análise de marcas registradas DuPont, mas NÃO são aconselhamento jurídico.

### Saída de orientação (v0.7.0+)

| Recurso | Descrição |
| --------- | ------------- |
| Próximos Passos | 2 a 4 etapas de orientação ("o que fazer a seguir") com base no nível + descobertas. |
| Pontuação de Cobertura | Medida de 0 a 100% de quantos namespaces solicitados foram verificados com sucesso. |
| Namespaces Não Verificados | Lista de namespaces que retornaram um status desconhecido. |
| Isenção de Responsabilidade | Rodapé de esclarecimento jurídico que indica o que o relatório é e o que não é. |
| Cartões de Colisão | Explicações determinísticas para cada tipo de conflito. | `collisionCards[]` na opinião. |

As próximas ações são distintas das `recommendedActions` (que são links de reserva). Elas fornecem textos explicativos: "Registre agora", "Execute novamente com --radar", "Consulte um advogado de marcas e patentes", etc.

---

## Formato de saída

Cada execução produz quatro arquivos:

```
reports/<date>/
├── run.json           # Complete run object (per schema)
├── run.md             # Human-readable clearance report with score table
├── report.html        # Self-contained attorney packet (dark theme)
├── summary.json       # Condensed summary for integrations
└── manifest.json      # SHA-256 lockfile for tamper detection (via gen-lock)
```

### Pacote para o advogado (`report.html`)

Um relatório HTML autônomo, adequado para compartilhar com o advogado. Inclui a opinião completa, a tabela de detalhamento da pontuação, as verificações de namespace, as descobertas, a cadeia de evidências e as ações recomendadas, com links de reserva clicáveis. Tema escuro, sem dependências externas.

### Resumo em JSON (`summary.json`)

Uma saída condensada para integrações: nível, pontuação geral, status dos namespaces, resumo das descobertas, contagem de correspondências do radar de colisões, contagem de correspondências no corpus, contagem de variantes aproximadas e ações recomendadas.

---

## Critérios 1.0

Antes que o motor atinja a versão 1.0.0, o seguinte deve ser verdadeiro:

- [x] Esquemas de artefatos publicados e validados no CI (`summary.schema.json`, `index-entry.schema.json`)
- [ ] Confiabilidade do adaptador documentada (tempo de atividade, limites de taxa, comportamento de fallback para cada canal)
- [x] Política de compatibilidade definida e aplicada (`docs/VERSIONING.md`)
- [x] Consumo do site comprovadamente estável (`nameops` + ingestão do site de marketing `summary.json` → `/lab/clearance/`)
- [x] Testes de snapshot abrangem todos os resultados de nível (VERDE, AMARELO, VERMELHO)
- [ ] Cartões de colisão validados em relação a execuções do mundo real

---

## Instalação

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

## Uso

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

Valida artefatos JSON (`run.json`, `summary.json`, `runs.json`) em relação aos esquemas integrados. Imprime um indicador de aprovação/reprovação para cada arquivo. Sai com código 0 se todos forem válidos, 1 caso contrário.

### Modo em lote

`coe batch <file>` lê nomes de candidatos de um arquivo `.txt` ou `.json`, verifica cada um com cache compartilhado e controle de concorrência, e gera artefatos de execução para cada nome, além de resumos de nível de lote.

**Formato de texto** (`.txt`): Um nome por linha. Linhas em branco e comentários com `#` são ignorados.

**Formato JSON** (`.json`): Array de strings `["name1", "name2"]` ou objetos `[{ "name": "name1", "riskTolerance": "aggressive" }]`.

Estrutura de saída:
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

### Comando de repetição

`coe replay <dir>` lê um `run.json` do diretório especificado, verifica o manifesto (se presente) e regenera todas as saídas em um subdiretório `replay/`. Em seguida, compara o Markdown regenerado com o original para verificar a determinística.

```bash
# Run a check
node src/index.mjs check my-cool-tool --output reports

# Generate manifest (SHA-256 lockfile)
node scripts/gen-lock.mjs reports/2026-02-15

# Later: verify nothing changed
node src/index.mjs replay reports/2026-02-15
```

---

## Configuração

Não é necessário um arquivo de configuração. Todas as opções são flags da linha de comando:

| Flag | Padrão | Descrição |
| ------ | --------- | ------------- |
| `--channels` | `github,npm,pypi,domain` | Canais a serem verificados. Aceita lista explícita, nome do grupo (`core`, `dev`, `ai`, `all`), ou aditivo (`+cratesio,+dockerhub`) |
| `--org` | _(nenhum)_ | Organização do GitHub a ser verificada para disponibilidade do nome da organização |
| `--risk` | `conservative` | Tolerância ao risco: `conservador`, `equilibrado`, `agressivo` |
| `--output` | `reports/` | Diretório de saída para artefatos de execução |
| `--radar` | _(desativado)_ | Habilita o radar de colisões (pesquisa no GitHub + npm + crates.io + Docker Hub por nomes semelhantes) |
| `--suggest` | _(desativado)_ | Gera sugestões de nomes alternativos mais seguros na opinião |
| `--corpus` | _(nenhum)_ | Caminho para o corpus JSON de marcas conhecidas para comparação |
| `--cache-dir` | _(desativado)_ | Diretório para cache de respostas do adaptador (ou defina `COE_CACHE_DIR`) |
| `--max-age-hours` | `24` | TTL do cache em horas (requer `--cache-dir`) |
| `--dockerNamespace` | _(nenhum)_ | Namespace do Docker Hub (usuário/organização) — obrigatório quando o canal `dockerhub` está habilitado |
| `--hfOwner` | _(nenhum)_ | Proprietário do Hugging Face (usuário/organização) — obrigatório quando o canal `huggingface` está habilitado. |
| `--fuzzyQueryMode` | `registries` | Modo de consulta de variantes aproximadas: `desligado`, `registries`, `tudo`. |
| `--concurrency` | `4` | Número máximo de verificações simultâneas no modo de lote. |
| `--resume` | _(nenhum)_ | Retomar o lote a partir de um diretório de saída anterior (ignora os nomes já processados). |
| `--variantBudget` | `12` | Número máximo de variantes aproximadas a serem consultadas por registro (máximo: 30). |

### Variáveis de ambiente

| Variável | Efeito |
| ---------- | -------- |
| `GITHUB_TOKEN` | Aumenta o limite de taxa da API do GitHub de 60/hora para 5.000/hora. |
| `COE_CACHE_DIR` | Diretório de cache padrão (a flag `--cache-dir` da CLI tem precedência). |

---

## Esquema

O modelo de dados canônico é definido em `schema/clearance.schema.json` (JSON Schema 2020-12).

Tipos de chave: `run`, `intake`, `candidate`, `channel`, `variants`, `namespaceCheck`, `finding`, `evidence`, `opinion`, `scoreBreakdown`, `manifest`.

---

## Testes

```bash
npm test            # unit tests
npm run test:e2e    # integration tests with golden snapshots
npm run test:all    # all tests
```

Todos os testes usam adaptadores injetados em fixtures (sem chamadas de rede). As imagens de referência garantem a determinação idêntica em bytes.

---

## Códigos de erro

| Código | Significado |
| ------ | --------- |
| `COE.INIT.NO_ARGS` | Nenhum nome de candidato fornecido. |
| `COE.INIT.BAD_CHANNEL` | Canal desconhecido em `--channels`. |
| `COE.ADAPTER.GITHUB_FAIL` | A API do GitHub retornou um erro inesperado. |
| `COE.ADAPTER.NPM_FAIL` | O registro npm retornou um erro inesperado. |
| `COE.ADAPTER.PYPI_FAIL` | A API do PyPI retornou um erro inesperado. |
| `COE.ADAPTER.DOMAIN_FAIL` | A consulta RDAP falhou. |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | Limite de taxa do RDAP excedido (HTTP 429). |
| `COE.ADAPTER.CRATESIO_FAIL` | A API do crates.io retornou um erro inesperado. |
| `COE.ADAPTER.DOCKERHUB_FAIL` | A API do Docker Hub retornou um erro inesperado. |
| `COE.ADAPTER.HF_FAIL` | A API do Hugging Face retornou um erro inesperado. |
| `COE.ADAPTER.RADAR_GITHUB_FAIL` | A API de pesquisa do GitHub não está acessível. |
| `COE.ADAPTER.RADAR_NPM_FAIL` | A API de pesquisa do npm não está acessível. |
| `COE.ADAPTER.RADAR_CRATESIO_FAIL` | A API de pesquisa do crates.io não está acessível. |
| `COE.ADAPTER.RADAR_DOCKERHUB_FAIL` | A API de pesquisa do Docker Hub não está acessível. |
| `COE.DOCTOR.FATAL` | O comando `doctor` falhou. |
| `COE.DOCKER.NAMESPACE_REQUIRED` | O canal do Docker Hub está habilitado sem `--dockerNamespace`. |
| `COE.HF.OWNER_REQUIRED` | O canal do Hugging Face está habilitado sem `--hfOwner`. |
| `COE.VARIANT.FUZZY_HIGH` | O número de variantes aproximadas excede o limite (informativo). |
| `COE.CORPUS.INVALID` | O arquivo de corpus tem um formato inválido. |
| `COE.CORPUS.NOT_FOUND` | O arquivo de corpus não foi encontrado no caminho especificado. |
| `COE.RENDER.WRITE_FAIL` | Não foi possível escrever os arquivos de saída. |
| `COE.LOCK.MISMATCH` | A verificação do arquivo de bloqueio falhou (corrompido). |
| `COE.REPLAY.NO_RUN` | Não existe `run.json` no diretório de repetição. |
| `COE.REPLAY.HASH_MISMATCH` | Incompatibilidade de hash do manifesto durante a repetição. |
| `COE.REPLAY.MD_DIFF` | O Markdown regenerado difere do original. |
| `COE.BATCH.BAD_FORMAT` | Formato de arquivo de lote não suportado. |
| `COE.BATCH.EMPTY` | O arquivo de lote não contém nomes. |
| `COE.BATCH.DUPLICATE` | Nome duplicado no arquivo de lote. |
| `COE.BATCH.TOO_MANY` | O lote excede o limite de segurança de 500 nomes. |
| `COE.REFRESH.NO_RUN` | Não existe `run.json` no diretório de atualização. |
| `COE.PUBLISH.NOT_FOUND` | Diretório de execução não encontrado para publicação. |
| `COE.PUBLISH.NO_FILES` | Não existem arquivos publicáveis no diretório. |
| `COE.PUBLISH.SECRET_DETECTED` | Possível segredo detectado na saída de publicação (aviso). |
| `COE.NET.DNS_FAIL` | A resolução de DNS falhou — verifique a conexão de rede. |
| `COE.NET.CONN_REFUSED` | Conexão recusada pelo servidor remoto. |
| `COE.NET.TIMEOUT` | O tempo de resposta excedeu o limite. |
| `COE.NET.RATE_LIMITED` | Limite de taxa atingido — aguarde e tente novamente. |
| `COE.FS.PERMISSION` | Permissão negada para escrever no disco. |
| `COE.CORPUS.EXISTS` | O arquivo de corpus já existe (durante a inicialização). |
| `COE.CORPUS.EMPTY_NAME` | O nome é obrigatório, mas está vazio. |
| `COE.VALIDATE.*` | Erros de validação de artefatos. |

Consulte [docs/RUNBOOK.md](docs/RUNBOOK.md) para a referência completa de erros e o guia de solução de problemas.

---

## Segurança

- **Somente leitura**: nunca modifica nenhum namespace, registro ou repositório.
- **Determinístico**: as mesmas entradas produzem as mesmas saídas.
- **Baseado em evidências**: cada opinião é rastreável até verificações específicas com hashes SHA-256.
- **Conservador**: assume o status AMARELO/VERMELHO quando há incerteza.
- **Sem informações confidenciais na saída**: tokens de API nunca aparecem nos relatórios.
- **Seguro contra XSS**: todas as strings do usuário são escapadas em HTML no pacote do advogado.
- **Remoção de informações confidenciais**: tokens, chaves de API e cabeçalhos de Autorização são removidos antes da escrita.
- **Verificação de informações confidenciais**: o comando `coe publish` verifica a saída em busca de tokens vazados antes da escrita.

---

## Limitações

- Não é aconselhamento jurídico — não é uma pesquisa de marcas registradas nem um substituto para aconselhamento profissional.
- Não realiza verificações em bancos de dados de marcas registradas (USPTO, EUIPO, WIPO).
- O radar de colisões é indicativo (sinais de uso no mercado), não uma pesquisa autoritativa de marcas registradas.
- A comparação de corpus é feita apenas com marcas fornecidas pelo usuário, não com um banco de dados abrangente.
- As verificações de domínio cobrem apenas os domínios `.com` e `.dev`.
- O Docker Hub requer o parâmetro `--dockerNamespace`; o Hugging Face requer o parâmetro `--hfOwner`.
- As variantes aproximadas têm uma distância de edição de 1; as consultas são limitadas ao npm, PyPI e crates.io.
- A análise fonética é centrada no inglês (algoritmo Metaphone).
- A detecção de homógrafos cobre ASCII, cirílico e grego (não todos os scripts Unicode).
- Não realiza verificações de nomes de usuário em redes sociais.
- Todas as verificações são instantâneas.
- O modo em lote é limitado a 500 nomes por arquivo.
- A detecção de novidade é apenas informativa (não altera a classificação).

Consulte [docs/LIMITATIONS.md](docs/LIMITATIONS.md) para a lista completa.

---

## Licença

MIT

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
