<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Motore deterministico per la verifica della disponibilità di un nome e la valutazione della sua idoneità.

Dato un nome candidato, verifica la reale disponibilità nello spazio dei nomi (organizzazione/repository GitHub, npm, PyPI, dominio tramite RDAP, crates.io, Docker Hub, Hugging Face), genera varianti linguistiche (normalizzate, tokenizzate, fonetiche, omofone, distanza di modifica fuzzy = 1), ricerca nomi simili tramite un sistema di rilevamento delle collisioni (ricerca GitHub + npm), interroga i registri per conflitti con varianti fuzzy, confronta con i marchi noti forniti dall'utente e produce una valutazione conservativa sull'idoneità (VERDE / GIALLO / ROSSO) con una spiegazione dettagliata del punteggio, un riepilogo esecutivo, una matrice di copertura e una catena di evidenze completa.

---

## Contratto di veridicità

- **Stessi input + stesse risposte dell'adattatore = output byte-identico.**
- Ogni controllo produce un oggetto `evidence` con SHA-256, timestamp e passaggi per la riproduzione.
- Le valutazioni sono conservative: VERDE solo quando _tutti_ i controlli dello spazio dei nomi sono puliti _e_ non esistono collisioni fonetiche/omofore.
- Il motore non invia, pubblica o modifica nulla. Legge e segnala solamente.
- La spiegazione del punteggio indica _perché_ è stato assegnato un determinato livello, ma non sovrascrive la logica basata su regole.

---

## Cosa viene verificato

| Canale | Spazio dei nomi | Metodo |
| --------- | ----------- | -------- |
| GitHub | Nome dell'organizzazione | `GET /orgs/{name}` → 404 = disponibile |
| GitHub | Nome del repository | `GET /repos/{owner}/{name}` → 404 = disponibile |
| npm | Pacchetto | `GET https://registry.npmjs.org/{name}` → 404 = disponibile |
| PyPI | Pacchetto | `GET https://pypi.org/pypi/{name}/json` → 404 = disponibile |
| Dominio | `.com`, `.dev` | RDAP (RFC 9083) tramite `rdap.org` → 404 = disponibile |
| crates.io | Crate | `GET https://crates.io/api/v1/crates/{name}` → 404 = disponibile |
| Docker Hub | Repository | `GET https://hub.docker.com/v2/repositories/{ns}/{name}` → 404 = disponibile |
| Hugging Face | Modello | `GET https://huggingface.co/api/models/{owner}/{name}` → 404 = disponibile |
| Hugging Face | Spazio | `GET https://huggingface.co/api/spaces/{owner}/{name}` → 404 = disponibile |

### Gruppi di canali

| Gruppo | Canali |
| ------- | ---------- |
| `core` (predefinito) | github, npm, pypi, dominio |
| `dev` | cratesio, dockerhub |
| `ai` | huggingface |
| `all` | tutti i canali |

Utilizzare `--channels <gruppo>` per i preset, oppure `--channels +cratesio,+dockerhub` per la sintassi additiva (aggiunge al predefinito).

### Segnali indicativi (opzionali)

| Origine | Cosa viene ricercato | Metodo |
| -------- | ----------------- | -------- |
| Rilevamento delle collisioni | Repository GitHub | `GET /search/repositories?q={name}` → valutazione della somiglianza |
| Rilevamento delle collisioni | Pacchetti npm | `GET /-/v1/search?text={name}` → valutazione della somiglianza |
| Rilevamento delle collisioni | Crate crates.io | `GET https://crates.io/api/v1/crates?q={name}` → valutazione della somiglianza |
| Rilevamento delle collisioni | Repository Docker Hub | `GET https://hub.docker.com/v2/search/repositories?query={name}` → valutazione della somiglianza |
| Corpus | Marchi forniti dall'utente | Confronto offline Jaro-Winkler + Metaphone |

Tutte le chiamate all'adattatore utilizzano un meccanismo di ripetizione con backoff esponenziale (2 tentativi, ritardo base di 500 ms). La memorizzazione nella cache su disco, attivabile dall'utente, riduce il numero di chiamate all'API.

---

## Cosa genera

### Varianti

| Tipo | Esempio di input | Esempio di output |
| ------ | --------------- | ---------------- |
| Normalizzato | `My Cool Tool` | `my-cool-tool` |
| Tokenizzato | `my-cool-tool` | `["my", "cool", "tool"]` |
| Foneticamente (Metaphone) | `["my", "cool", "tool"]` | `["M", "KL", "TL"]` |
| Omofoni | `my-cool-tool` | `["my-c00l-tool", "my-co0l-t00l"]` (ASCII + Cirillico + Greco) |
| Approssimativo (edit-distance=1) | `my-cool-tool` | `["my-cool-too", "my-cool-tools", ...]` |

### Livelli di valutazione

| Livello | Significato |
| ------ | --------- |
| 🟢 VERDE | Tutti i namespace disponibili, nessuna collisione fonetica/omofona. |
| 🟡 GIALLO | Alcuni controlli inconcludenti (rete), potenziali collisioni o variante approssimativa rilevata. |
| 🔴 ROSSO | Collisione esatta, collisione fonetica o rischio elevato di confusione. |

### Dettaglio del punteggio

Ogni valutazione include una ripartizione ponderata del punteggio per una maggiore trasparenza:

| Sottopunteggio | Cosa misura |
| ----------- | ----------------- |
| Disponibilità del namespace | Percentuale di namespace controllati che sono disponibili. |
| Completezza della copertura | Numero di tipi di namespace controllati (su 4). |
| Gravità della collisione | Penalità per collisioni esatte, fonetiche, di confusione, approssimative e per varianti rilevate. |
| Disponibilità del dominio | Percentuale di TLD controllati con domini disponibili. |

Profili di ponderazione (`--risk` flag): **conservativo** (predefinito), **equilibrato**, **aggressivo**. Una maggiore tolleranza al rischio abbassa le soglie per i livelli VERDE/GIALLO e sposta il peso verso la disponibilità del namespace.

> **Nota**: Il livello è sempre determinato da regole: le collisioni esatte producono SEMPRE il livello ROSSO, indipendentemente dal punteggio numerico. La ripartizione è un metadato aggiuntivo solo a scopo esplicativo.

### Miglioramenti della valutazione v2

Il motore di valutazione produce analisi aggiuntive (v0.6.0+):

| Funzionalità | Descrizione |
| --------- | ------------- |
| Fattori principali | 3-5 fattori più importanti che influenzano la decisione sul livello, con classificazione del peso. |
| Descrizione del rischio | Un paragrafo deterministico che riassume il rischio ("Se non fai nulla..."). |
| Analisi DuPont-Lite | Punteggi di somiglianza dei marchi, sovrapposizione dei canali, proxy di notorietà e proxy di intento. |
| Alternative più sicure | 5 suggerimenti deterministici di nomi alternativi utilizzando prefissi/suffissi/separatori/abbreviazioni/combinazioni. |

I fattori principali e le descrizioni del rischio utilizzano cataloghi di modelli: sono deterministici e non utilizzano testo generato da modelli linguistici (LLM). I fattori DuPont-Lite sono ispirati al framework di analisi dei marchi DuPont, ma NON costituiscono consulenza legale.

### Output di coaching (v0.7.0+)

| Funzionalità | Descrizione |
| --------- | ------------- |
| Prossime azioni | 2-4 passaggi di coaching ("cosa fare dopo") basati sul livello e sui risultati. |
| Punteggio di copertura | Misura dello 0-100% di quanti namespace richiesti sono stati controllati con successo. |
| Namespace non controllati | Elenco di namespace che hanno restituito uno stato sconosciuto. |
| Dichiarazione di non responsabilità | Testo esplicativo che indica cosa il rapporto è e cosa non è. |
| Schede delle collisioni | Spiegazioni deterministiche per ogni tipo di collisione. | `collisionCards[]` nell'opinione. |

Le azioni successive sono distinte dalle `recommendedActions` (che sono link di prenotazione). Forniscono un testo esplicativo: "Richiedi ora", "Riesegui con --radar", "Consulta un avvocato specializzato in marchi", ecc.

---

## Formato di output

Ogni esecuzione produce quattro file:

```
reports/<date>/
├── run.json           # Complete run object (per schema)
├── run.md             # Human-readable clearance report with score table
├── report.html        # Self-contained attorney packet (dark theme)
├── summary.json       # Condensed summary for integrations
└── manifest.json      # SHA-256 lockfile for tamper detection (via gen-lock)
```

### Pacchetto per l'avvocato (`report.html`)

Un report HTML autonomo, adatto per essere condiviso con il legale. Include l'opinione completa, la tabella di riepilogo dei punteggi, i controlli dei namespace, i risultati, la catena delle prove e le azioni consigliate con link di prenotazione cliccabili. Tema scuro, senza dipendenze esterne.

### Riepilogo JSON (`summary.json`)

Un output condensato per le integrazioni: livello, punteggio complessivo, stato dei namespace, riepilogo dei risultati, numero di rilevamenti tramite "radar" delle collisioni, numero di corrispondenze nel database, numero di varianti approssimative rilevate e azioni consigliate.

---

## Criteri 1.0

Prima che il motore raggiunga la versione 1.0.0, le seguenti condizioni devono essere vere:

- [x] Schemi degli artefatti pubblicati e validati nell'ambiente CI (`summary.schema.json`, `index-entry.schema.json`)
- [ ] Affidabilità dell'adattatore documentata (tempo di attività, limiti di velocità, comportamento di fallback per ogni canale)
- [x] Politica di compatibilità definita e applicata (`docs/VERSIONING.md`)
- [x] Stabilità del traffico del sito web dimostrata (`nameops` + ingestione del sito di marketing di `summary.json` → `/lab/clearance/`)
- [x] I test "golden" coprono tutti i possibili risultati (VERDE, GIALLO, ROSSO)
- [ ] Le "collision cards" validate contro esecuzioni reali

---

## Installazione

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

## Utilizzo

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

Valida gli artefatti JSON (`run.json`, `summary.json`, `runs.json`) rispetto agli schemi integrati. Stampa un indicatore di successo/fallimento per ogni file. Esce con codice 0 se tutti i file sono validi, 1 altrimenti.

### Modalità batch

`coe batch <file>` legge i nomi candidati da un file `.txt` o `.json`, verifica ciascuno di essi con la memorizzazione nella cache e il controllo della concorrenza, e genera gli artefatti per ogni nome, oltre a riepiloghi a livello di batch.

**Formato di testo** (`.txt`): Un nome per riga. Le righe vuote e i commenti con `#` vengono ignorati.

**Formato JSON** (`.json`): Array di stringhe `["name1", "name2"]` o oggetti `[{ "name": "name1", "riskTolerance": "aggressive" }]`.

Struttura dell'output:
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

### Comando di riproduzione

`coe replay <dir>` legge un `run.json` dalla directory specificata, verifica il manifest (se presente) e rigenera tutti gli output in una sottodirectory `replay/`. Quindi, confronta il Markdown rigenerato con l'originale per verificare la determinazione.

```bash
# Run a check
node src/index.mjs check my-cool-tool --output reports

# Generate manifest (SHA-256 lockfile)
node scripts/gen-lock.mjs reports/2026-02-15

# Later: verify nothing changed
node src/index.mjs replay reports/2026-02-15
```

---

## Configurazione

Non è necessario un file di configurazione. Tutte le opzioni sono flag della riga di comando:

| Flag | Valore predefinito | Descrizione |
| ------ | --------- | ------------- |
| `--channels` | `github,npm,pypi,domain` | Canali da controllare. Accetta un elenco esplicito, un nome di gruppo (`core`, `dev`, `ai`, `all`), o un elenco cumulativo (`+cratesio,+dockerhub`) |
| `--org` | _(nessuno)_ | Organizzazione GitHub da controllare per la disponibilità del nome dell'organizzazione |
| `--risk` | `conservative` | Tolleranza al rischio: `conservativa`, `equilibrata`, `aggressiva` |
| `--output` | `reports/` | Directory di output per gli artefatti dell'esecuzione |
| `--radar` | _(disattivato)_ | Abilita il "radar" delle collisioni (ricerca su GitHub + npm + crates.io + Docker Hub per nomi simili) |
| `--suggest` | _(disattivato)_ | Genera suggerimenti di nomi alternativi più sicuri nell'opinione |
| `--corpus` | _(nessuno)_ | Percorso del database JSON dei marchi noti da confrontare |
| `--cache-dir` | _(disattivato)_ | Directory per la memorizzazione nella cache delle risposte dell'adattatore (o imposta `COE_CACHE_DIR`) |
| `--max-age-hours` | `24` | TTL della cache in ore (richiede `--cache-dir`) |
| `--dockerNamespace` | _(nessuno)_ | Namespace di Docker Hub (utente/organizzazione) — richiesto quando il canale `dockerhub` è abilitato |
| `--hfOwner` | _(nessuno)_ | Proprietario di Hugging Face (utente/organizzazione) — richiesto quando il canale `huggingface` è abilitato. |
| `--fuzzyQueryMode` | `registries` | Modalità di query fuzzy: `off`, `registries`, `all`. |
| `--concurrency` | `4` | Numero massimo di controlli simultanei in modalità batch. |
| `--resume` | _(nessuno)_ | Riprendi l'esecuzione batch da una directory di output precedente (salta i nomi già completati). |
| `--variantBudget` | `12` | Numero massimo di varianti fuzzy da interrogare per ogni registro (massimo: 30). |

### Variabili d'ambiente

| Variabile | Effetto |
| ---------- | -------- |
| `GITHUB_TOKEN` | Aumenta il limite di richieste dell'API GitHub da 60/ora a 5.000/ora. |
| `COE_CACHE_DIR` | Directory di cache predefinita (il flag CLI `--cache-dir` ha la precedenza). |

---

## Schema

Il modello di dati canonico è definito in `schema/clearance.schema.json` (JSON Schema 2020-12).

Tipi di chiave: `run`, `intake`, `candidate`, `channel`, `variants`, `namespaceCheck`, `finding`, `evidence`, `opinion`, `scoreBreakdown`, `manifest`.

---

## Test

```bash
npm test            # unit tests
npm run test:e2e    # integration tests with golden snapshots
npm run test:all    # all tests
```

Tutti i test utilizzano adattatori iniettati tramite fixture (nessuna chiamata di rete). Gli snapshot di riferimento garantiscono una determinazione byte-identica.

---

## Codici di errore

| Codice | Significato |
| ------ | --------- |
| `COE.INIT.NO_ARGS` | Nessun nome candidato fornito. |
| `COE.INIT.BAD_CHANNEL` | Canale sconosciuto in `--channels`. |
| `COE.ADAPTER.GITHUB_FAIL` | L'API GitHub ha restituito un errore imprevisto. |
| `COE.ADAPTER.NPM_FAIL` | Il registro npm ha restituito un errore imprevisto. |
| `COE.ADAPTER.PYPI_FAIL` | L'API PyPI ha restituito un errore imprevisto. |
| `COE.ADAPTER.DOMAIN_FAIL` | Ricerca RDAP fallita. |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | Limite di richieste RDAP superato (HTTP 429). |
| `COE.ADAPTER.CRATESIO_FAIL` | L'API crates.io ha restituito un errore imprevisto. |
| `COE.ADAPTER.DOCKERHUB_FAIL` | L'API Docker Hub ha restituito un errore imprevisto. |
| `COE.ADAPTER.HF_FAIL` | L'API Hugging Face ha restituito un errore imprevisto. |
| `COE.ADAPTER.RADAR_GITHUB_FAIL` | L'API di ricerca GitHub non è raggiungibile. |
| `COE.ADAPTER.RADAR_NPM_FAIL` | L'API di ricerca npm non è raggiungibile. |
| `COE.ADAPTER.RADAR_CRATESIO_FAIL` | L'API di ricerca crates.io non è raggiungibile. |
| `COE.ADAPTER.RADAR_DOCKERHUB_FAIL` | L'API di ricerca Docker Hub non è raggiungibile. |
| `COE.DOCTOR.FATAL` | Il comando `doctor` non è riuscito. |
| `COE.DOCKER.NAMESPACE_REQUIRED` | Il canale Docker Hub è abilitato senza `--dockerNamespace`. |
| `COE.HF.OWNER_REQUIRED` | Il canale Hugging Face è abilitato senza `--hfOwner`. |
| `COE.VARIANT.FUZZY_HIGH` | Il numero di varianti fuzzy supera la soglia (informativo). |
| `COE.CORPUS.INVALID` | Il file del corpus ha un formato non valido. |
| `COE.CORPUS.NOT_FOUND` | Il file del corpus non è stato trovato nel percorso specificato. |
| `COE.RENDER.WRITE_FAIL` | Impossibile scrivere i file di output. |
| `COE.LOCK.MISMATCH` | La verifica del file di lock è fallita (alterato). |
| `COE.REPLAY.NO_RUN` | Nessun file `run.json` nella directory di replay. |
| `COE.REPLAY.HASH_MISMATCH` | Errore di mismatch dell'hash del manifest durante il replay. |
| `COE.REPLAY.MD_DIFF` | Il Markdown rigenerato differisce dall'originale. |
| `COE.BATCH.BAD_FORMAT` | Formato del file batch non supportato. |
| `COE.BATCH.EMPTY` | Il file batch non contiene nomi. |
| `COE.BATCH.DUPLICATE` | Nome duplicato nel file batch. |
| `COE.BATCH.TOO_MANY` | Il batch supera il limite di sicurezza di 500 nomi. |
| `COE.REFRESH.NO_RUN` | Nessun file `run.json` nella directory di aggiornamento. |
| `COE.PUBLISH.NOT_FOUND` | Directory di esecuzione non trovata per la pubblicazione. |
| `COE.PUBLISH.NO_FILES` | Nessun file pubblicabile nella directory. |
| `COE.PUBLISH.SECRET_DETECTED` | Possibile segreto rilevato nell'output di pubblicazione (avviso). |
| `COE.NET.DNS_FAIL` | Ricerca DNS fallita — verificare la connessione di rete. |
| `COE.NET.CONN_REFUSED` | Connessione rifiutata dal server remoto. |
| `COE.NET.TIMEOUT` | Timeout della richiesta. |
| `COE.NET.RATE_LIMITED` | Limite di richieste superato — attendere e riprovare. |
| `COE.FS.PERMISSION` | Permesso negato per la scrittura su disco. |
| `COE.CORPUS.EXISTS` | Il file del corpus esiste già (durante l'inizializzazione). |
| `COE.CORPUS.EMPTY_NAME` | Il nome è richiesto ma vuoto. |
| `COE.VALIDATE.*` | Errori di validazione degli artefatti. |

Consultare [docs/RUNBOOK.md](docs/RUNBOOK.md) per il riferimento completo degli errori e la guida alla risoluzione dei problemi.

---

## Sicurezza

- **Solo lettura**: non modifica mai alcun namespace, registro o repository.
- **Deterministico**: gli stessi input producono sempre gli stessi output.
- **Basato su evidenze**: ogni affermazione è supportata da controlli specifici con hash SHA-256.
- **Conservativo**: assume di default i livelli GIALLO/ROSSO quando c'è incertezza.
- **Nessun segreto nell'output**: i token API non compaiono mai nei report.
- **Sicuro contro XSS**: tutte le stringhe fornite dall'utente sono codificate in HTML nel pacchetto "attorney".
- **Rimozione delle informazioni sensibili**: token, chiavi API e intestazioni di autorizzazione vengono rimossi prima della scrittura.
- **Scansione di segreti**: il comando `coe publish` esegue una scansione dell'output alla ricerca di token compromessi prima della scrittura.

---

## Limitazioni

- Non costituisce una consulenza legale; non è una ricerca di marchi e non sostituisce la consulenza professionale.
- Nessun controllo dei database di marchi (USPTO, EUIPO, WIPO).
- Il "radar delle collisioni" fornisce solo indicazioni (segnali di utilizzo sul mercato), non costituisce una ricerca autorevole di marchi.
- Il confronto del corpus avviene solo con i marchi forniti dall'utente, non con un database esaustivo.
- I controlli sui domini coprono solo i domini ".com" e ".dev".
- Docker Hub richiede l'opzione `--dockerNamespace`; Hugging Face richiede l'opzione `--hfOwner`.
- Le varianti "fuzzy" hanno una distanza di modifica di 1; le query sono limitate a npm, PyPI e crates.io.
- L'analisi fonetica è incentrata sull'inglese (algoritmo Metaphone).
- Il rilevamento di omofoni copre ASCII, cirillico e greco (non tutti i sistemi di scrittura Unicode).
- Nessun controllo dei nomi utente sui social media.
- Tutti i controlli sono istantanee nel tempo.
- La modalità batch è limitata a 500 nomi per file.
- Il rilevamento della "freschezza" è puramente informativo (non modifica il livello di valutazione).

Per l'elenco completo, consultare [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

---

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
