<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Moteur déterministe de vérification de la disponibilité des noms et d'évaluation des risques.

Étant donné un nom candidat, il vérifie la disponibilité réelle dans les espaces de noms (GitHub org/repo, npm, PyPI, domaine via RDAP, crates.io, Docker Hub, Hugging Face), génère des variantes linguistiques (normalisées, tokenisées, phonétiques, homoglyphes, distance d'édition floue = 1), recherche des noms similaires via un système de détection de collisions (recherche GitHub + npm), interroge les registres pour détecter les conflits avec les variantes floues, compare avec les marques connues fournies par l'utilisateur, et produit une évaluation des risques prudente (VERT / JAUNE / ROUGE) avec une explication détaillée des scores, un résumé, une matrice de couverture et une chaîne de preuves complète.

---

## Contrat de véracité

- **Mêmes entrées + mêmes réponses de l'adaptateur = sortie identique au niveau des octets.**
- Chaque vérification produit un objet `evidence` contenant le hachage SHA-256, l'horodatage et les étapes de reproduction.
- Les évaluations sont prudentes : VERT uniquement si _toutes_ les vérifications d'espace de noms sont propres _et_ qu'il n'y a pas de collisions phonétiques/homoglyphes.
- Le moteur n'envoie, ne publie ni ne modifie rien. Il ne fait que lire et signaler.
- Les explications des scores expliquent _pourquoi_ un niveau a été attribué, mais ne remplacent jamais la logique basée sur des règles pour l'attribution des niveaux.

---

## Ce qui est vérifié

| Canal | Espace de noms | Méthode |
| --------- | ----------- | -------- |
| GitHub | Nom de l'organisation | `GET /orgs/{name}` → 404 = disponible |
| GitHub | Nom du dépôt | `GET /repos/{owner}/{name}` → 404 = disponible |
| npm | Paquet | `GET https://registry.npmjs.org/{name}` → 404 = disponible |
| PyPI | Paquet | `GET https://pypi.org/pypi/{name}/json` → 404 = disponible |
| Domaine | `.com`, `.dev` | RDAP (RFC 9083) via `rdap.org` → 404 = disponible |
| crates.io | Module | `GET https://crates.io/api/v1/crates/{name}` → 404 = disponible |
| Docker Hub | Dépôt | `GET https://hub.docker.com/v2/repositories/{ns}/{name}` → 404 = disponible |
| Hugging Face | Modèle | `GET https://huggingface.co/api/models/{owner}/{name}` → 404 = disponible |
| Hugging Face | Espace | `GET https://huggingface.co/api/spaces/{owner}/{name}` → 404 = disponible |

### Groupes de canaux

| Groupe | Canaux |
| ------- | ---------- |
| `core` (par défaut) | github, npm, pypi, domain |
| `dev` | cratesio, dockerhub |
| `ai` | huggingface |
| `all` | tous les canaux |

Utilisez `--channels <groupe>` pour les configurations prédéfinies, ou `--channels +cratesio,+dockerhub` pour une syntaxe additive (ajoute aux paramètres par défaut).

### Signaux indicatifs (optionnels)

| Source | Ce qui est recherché | Méthode |
| -------- | ----------------- | -------- |
| Détection de collisions | Dépôts GitHub | `GET /search/repositories?q={name}` → notation de similarité |
| Détection de collisions | Paquets npm | `GET /-/v1/search?text={name}` → notation de similarité |
| Détection de collisions | Modules crates.io | `GET https://crates.io/api/v1/crates?q={name}` → notation de similarité |
| Détection de collisions | Dépôts Docker Hub | `GET https://hub.docker.com/v2/search/repositories?query={name}` → notation de similarité |
| Corpus | Marques fournies par l'utilisateur | Comparaison hors ligne Jaro-Winkler + Metaphone |

Tous les appels aux adaptateurs utilisent une tentative de nouvelle exécution avec un recul exponentiel (2 tentatives, délai de base de 500 ms). La mise en cache sur disque, optionnelle, réduit le nombre d'appels d'API répétés.

---

## Ce que cela génère

### Variantes

| Type | Exemple d'entrée | Exemple de sortie |
| ------ | --------------- | ---------------- |
| Normalisé | `My Cool Tool` | `my-cool-tool` |
| Tokenisé | `my-cool-tool` | `["my", "cool", "tool"]` |
| Phonétique (Metaphone) | `["my", "cool", "tool"]` | `["M", "KL", "TL"]` |
| Homoglyphes | `my-cool-tool` | `["my-c00l-tool", "my-co0l-t00l"]` (ASCII + Cyrillique + Grec) |
| Flou (distance d'édition = 1) | `my-cool-tool` | `["my-cool-too", "my-cool-tools", ...]` |

### Niveaux d'opinion

| Niveau | Signification |
| ------ | --------- |
| 🟢 VERT | Tous les espaces de noms sont disponibles, aucun conflit phonétique/homoglyphe. |
| 🟡 JAUNE | Certaines vérifications sont inconclusives (réseau), conflits proches ou variante floue prise en compte. |
| 🔴 ROUGE | Conflit exact, collision phonétique ou risque élevé de confusion. |

### Répartition des scores

Chaque opinion comprend une répartition pondérée des scores pour faciliter la compréhension :

| Sous-score | Ce que cela mesure |
| ----------- | ----------------- |
| Disponibilité des espaces de noms | Pourcentage des espaces de noms vérifiés qui sont disponibles. |
| Complétude de la couverture | Nombre de types d'espaces de noms vérifiés (sur 4). |
| Gravité des conflits | Pénalité pour les conflits exacts, phonétiques, de confusion, proches et les variantes prises en compte. |
| Disponibilité du domaine | Pourcentage des TLD vérifiés avec des domaines disponibles. |

Profils de pondération (indicateur `--risk`) : **conservateur** (par défaut), **équilibré**, **agressif**. Une tolérance au risque plus élevée réduit les seuils pour les niveaux VERT/JAUNE et oriente la pondération vers la disponibilité des espaces de noms.

> **Note** : Le niveau est toujours basé sur des règles : les conflits exacts produisent un niveau ROUGE, quel que soit le score numérique. La répartition est une métadonnée additive uniquement pour faciliter la compréhension.

### Améliorations de l'opinion v2

Le moteur d'opinion produit une analyse supplémentaire (v0.6.0+) :

| Fonctionnalité | Description |
| --------- | ------------- |
| Facteurs principaux | 3 à 5 facteurs les plus importants qui influencent la décision du niveau, avec classification pondérée. |
| Narration des risques | Un paragraphe déterministe du type "Si vous ne faites rien..." qui résume le risque. |
| Analyse DuPont-Lite | Similarité des marques, chevauchement des canaux, scores de proxy de notoriété et scores de proxy d'intention. |
| Alternatives plus sûres | 5 suggestions de noms alternatifs déterministes utilisant des stratégies de préfixe/suffixe/séparateur/abréviation/combinaison. |

Les facteurs principaux et les narrations des risques utilisent des catalogues de modèles : déterministes, sans texte LLM. Les facteurs DuPont-Lite s'inspirent du cadre d'analyse des marques commerciales DuPont, mais ne constituent PAS un conseil juridique.

### Sortie de coaching (v0.7.0+)

| Fonctionnalité | Description |
| --------- | ------------- |
| Prochaines étapes | 2 à 4 étapes de coaching ("ce qu'il faut faire ensuite") basées sur le niveau + les résultats. |
| Score de couverture | Mesure de 0 à 100 % du nombre d'espaces de noms demandés qui ont été vérifiés avec succès. |
| Espaces de noms non vérifiés | Liste des espaces de noms qui ont renvoyé un statut inconnu. |
| Avertissement | Note juridique indiquant ce que le rapport est et n'est pas. |
| Cartes de collision | Explications déterministes pour chaque type de conflit. | `collisionCards[]` dans l'avis. |

Les actions suivantes diffèrent des `recommendedActions` (qui sont des liens de réservation). Elles fournissent des conseils : "Déposer maintenant", "Relancer avec --radar", "Consulter un avocat spécialisé en marques", etc.

---

## Format de sortie

Chaque exécution produit quatre fichiers :

```
reports/<date>/
├── run.json           # Complete run object (per schema)
├── run.md             # Human-readable clearance report with score table
├── report.html        # Self-contained attorney packet (dark theme)
├── summary.json       # Condensed summary for integrations
└── manifest.json      # SHA-256 lockfile for tamper detection (via gen-lock)
```

### Dossier pour l'avocat (`report.html`)

Un rapport HTML autonome, adapté au partage avec le conseil juridique. Il comprend l'intégralité de l'avis, le tableau de répartition des scores, les vérifications des espaces de noms, les conclusions, la chaîne de preuves et les actions recommandées, avec des liens de réservation cliquables. Thème sombre, aucune dépendance externe.

### Résumé JSON (`summary.json`)

Une sortie condensée pour les intégrations : niveau, score global, statuts des espaces de noms, résumé des conclusions, nombre de détections de collisions par le radar, nombre de correspondances dans le corpus, nombre de variantes floues prises en compte, et actions recommandées.

---

## Critères 1.0

Avant que le moteur n'atteigne la version 1.0.0, les conditions suivantes doivent être remplies :

- [x] Schémas des artefacts publiés et validés dans l'environnement CI (`summary.schema.json`, `index-entry.schema.json`)
- [ ] Fiabilité de l'adaptateur documentée (temps de disponibilité, limites de débit, comportement de repli pour chaque canal)
- [x] Politique de compatibilité définie et appliquée (`docs/VERSIONING.md`)
- [x] Stabilité de la consommation du site web prouvée (`nameops` + ingestion du site marketing `summary.json` → `/lab/clearance/`)
- [x] Les tests de référence couvrent tous les résultats possibles (VERT, JAUNE, ROUGE)
- [ ] Les cartes de collisions validées par rapport à des exécutions réelles

---

## Installation

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

## Utilisation

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

Valide les artefacts JSON (`run.json`, `summary.json`, `runs.json`) par rapport aux schémas intégrés. Affiche un indicateur de succès/échec pour chaque fichier. Quitte avec le code 0 si tous sont valides, 1 sinon.

### Mode batch

`coe batch <file>` lit les noms candidats à partir d'un fichier `.txt` ou `.json`, vérifie chacun d'eux avec un cache partagé et un contrôle de concurrence, et génère les artefacts de chaque exécution ainsi que des résumés au niveau du lot.

**Format texte** (`.txt`) : Un nom par ligne. Les lignes vides et les commentaires commençant par `#` sont ignorés.

**Format JSON** (`.json`) : Tableau de chaînes de caractères `["name1", "name2"]` ou d'objets `[{ "name": "name1", "riskTolerance": "aggressive" }]`.

Structure de la sortie :
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

### Commande de relecture

`coe replay <dir>` lit un `run.json` dans le répertoire spécifié, vérifie le manifeste (s'il est présent) et régénère toutes les sorties dans un sous-répertoire `replay/`. Il compare ensuite le Markdown régénéré avec l'original pour vérifier la reproductibilité.

```bash
# Run a check
node src/index.mjs check my-cool-tool --output reports

# Generate manifest (SHA-256 lockfile)
node scripts/gen-lock.mjs reports/2026-02-15

# Later: verify nothing changed
node src/index.mjs replay reports/2026-02-15
```

---

## Configuration

Aucun fichier de configuration requis. Toutes les options sont des arguments de ligne de commande :

| Argument | Valeur par défaut | Description |
| ------ | --------- | ------------- |
| `--channels` | `github,npm,pypi,domain` | Canaux à vérifier. Accepte une liste explicite, un nom de groupe (`core`, `dev`, `ai`, `all`), ou une combinaison (`+cratesio,+dockerhub`) |
| `--org` | _(aucun)_ | Organisation GitHub à vérifier pour la disponibilité du nom d'organisation |
| `--risk` | `conservative` | Tolérance au risque : `conservative`, `balanced`, `aggressive` |
| `--output` | `reports/` | Répertoire de sortie pour les artefacts de l'exécution |
| `--radar` | _(désactivé)_ | Activer le radar de collisions (recherche sur GitHub + npm + crates.io + Docker Hub pour les noms similaires) |
| `--suggest` | _(désactivé)_ | Générer des suggestions de noms alternatifs plus sûrs dans l'avis |
| `--corpus` | _(aucun)_ | Chemin vers le corpus JSON des marques connues à comparer |
| `--cache-dir` | _(désactivé)_ | Répertoire pour la mise en cache des réponses de l'adaptateur (ou définir `COE_CACHE_DIR`) |
| `--max-age-hours` | `24` | Durée de vie du cache en heures (nécessite `--cache-dir`) |
| `--dockerNamespace` | _(aucun)_ | Espace de noms Docker Hub (utilisateur/organisation) — requis lorsque le canal `dockerhub` est activé |
| `--hfOwner` | _(aucun)_ | Propriétaire de Hugging Face (utilisateur/organisation) — requis lorsque le canal `huggingface` est activé. |
| `--fuzzyQueryMode` | `registries` | Mode de requête de variantes flou : `off`, `registries`, `all`. |
| `--concurrency` | `4` | Nombre maximal de vérifications simultanées en mode batch. |
| `--resume` | _(aucun)_ | Reprendre un batch à partir d'un répertoire de sortie précédent (ignore les noms déjà traités). |
| `--variantBudget` | `12` | Nombre maximal de variantes flou à interroger par registre (maximum : 30). |

### Variables d'environnement

| Variable | Effet |
| ---------- | -------- |
| `GITHUB_TOKEN` | Augmente la limite de débit de l'API GitHub de 60/heure à 5 000/heure. |
| `COE_CACHE_DIR` | Répertoire de cache par défaut (l'indicateur CLI `--cache-dir` a la priorité). |

---

## Schéma

Le modèle de données canonique est défini dans `schema/clearance.schema.json` (JSON Schema 2020-12).

Types de clés : `run`, `intake`, `candidate`, `channel`, `variants`, `namespaceCheck`, `finding`, `evidence`, `opinion`, `scoreBreakdown`, `manifest`.

---

## Tests

```bash
npm test            # unit tests
npm run test:e2e    # integration tests with golden snapshots
npm run test:all    # all tests
```

Tous les tests utilisent des adaptateurs injectés (zéro appel réseau). Les instantanés dorés garantissent une détermination identique au niveau des octets.

---

## Codes d'erreur

| Code | Signification |
| ------ | --------- |
| `COE.INIT.NO_ARGS` | Aucun nom de candidat fourni. |
| `COE.INIT.BAD_CHANNEL` | Canal inconnu dans `--channels`. |
| `COE.ADAPTER.GITHUB_FAIL` | L'API GitHub a renvoyé une erreur inattendue. |
| `COE.ADAPTER.NPM_FAIL` | Le registre npm a renvoyé une erreur inattendue. |
| `COE.ADAPTER.PYPI_FAIL` | L'API PyPI a renvoyé une erreur inattendue. |
| `COE.ADAPTER.DOMAIN_FAIL` | La recherche RDAP a échoué. |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | Limite de débit RDAP dépassée (HTTP 429). |
| `COE.ADAPTER.CRATESIO_FAIL` | L'API crates.io a renvoyé une erreur inattendue. |
| `COE.ADAPTER.DOCKERHUB_FAIL` | L'API Docker Hub a renvoyé une erreur inattendue. |
| `COE.ADAPTER.HF_FAIL` | L'API Hugging Face a renvoyé une erreur inattendue. |
| `COE.ADAPTER.RADAR_GITHUB_FAIL` | L'API de recherche GitHub est inaccessible. |
| `COE.ADAPTER.RADAR_NPM_FAIL` | L'API de recherche npm est inaccessible. |
| `COE.ADAPTER.RADAR_CRATESIO_FAIL` | L'API de recherche crates.io est inaccessible. |
| `COE.ADAPTER.RADAR_DOCKERHUB_FAIL` | L'API de recherche Docker Hub est inaccessible. |
| `COE.DOCTOR.FATAL` | La commande Doctor a échoué. |
| `COE.DOCKER.NAMESPACE_REQUIRED` | Le canal Docker Hub est activé sans `--dockerNamespace`. |
| `COE.HF.OWNER_REQUIRED` | Le canal Hugging Face est activé sans `--hfOwner`. |
| `COE.VARIANT.FUZZY_HIGH` | Le nombre de variantes flou dépasse le seuil (information). |
| `COE.CORPUS.INVALID` | Le fichier corpus a un format invalide. |
| `COE.CORPUS.NOT_FOUND` | Le fichier corpus n'a pas été trouvé à l'emplacement spécifié. |
| `COE.RENDER.WRITE_FAIL` | Impossible d'écrire les fichiers de sortie. |
| `COE.LOCK.MISMATCH` | La vérification du fichier de verrouillage a échoué (altéré). |
| `COE.REPLAY.NO_RUN` | Aucun fichier `run.json` dans le répertoire de relecture. |
| `COE.REPLAY.HASH_MISMATCH` | Incohérence de la somme de contrôle du manifeste pendant la relecture. |
| `COE.REPLAY.MD_DIFF` | Le Markdown régénéré diffère de l'original. |
| `COE.BATCH.BAD_FORMAT` | Format de fichier batch non pris en charge. |
| `COE.BATCH.EMPTY` | Le fichier batch ne contient aucun nom. |
| `COE.BATCH.DUPLICATE` | Nom dupliqué dans le fichier batch. |
| `COE.BATCH.TOO_MANY` | Le batch dépasse la limite de sécurité de 500 noms. |
| `COE.REFRESH.NO_RUN` | Aucun fichier `run.json` dans le répertoire de rafraîchissement. |
| `COE.PUBLISH.NOT_FOUND` | Répertoire d'exécution non trouvé pour la publication. |
| `COE.PUBLISH.NO_FILES` | Aucun fichier publiable dans le répertoire. |
| `COE.PUBLISH.SECRET_DETECTED` | Détection possible d'un secret dans la sortie de publication (avertissement). |
| `COE.NET.DNS_FAIL` | La résolution DNS a échoué — vérifiez la connexion réseau. |
| `COE.NET.CONN_REFUSED` | Connexion refusée par le serveur distant. |
| `COE.NET.TIMEOUT` | La requête a expiré. |
| `COE.NET.RATE_LIMITED` | Limite de débit dépassée — attendez et réessayez. |
| `COE.FS.PERMISSION` | Permission refusée pour l'écriture sur le disque. |
| `COE.CORPUS.EXISTS` | Le fichier corpus existe déjà (pendant l'initialisation). |
| `COE.CORPUS.EMPTY_NAME` | Le nom est requis mais vide. |
| `COE.VALIDATE.*` | Erreurs de validation des artefacts. |

Consultez [docs/RUNBOOK.md](docs/RUNBOOK.md) pour la référence complète des erreurs et le guide de dépannage.

---

## Sécurité

- **Lecture seule** : ne modifie jamais aucun espace de noms, registre ou dépôt.
- **Déterministe** : les mêmes entrées produisent les mêmes sorties.
- **Basé sur des preuves** : chaque affirmation est étayée par des vérifications spécifiques avec des hachages SHA-256.
- **Conservateur** : par défaut, affiche JAUNE/ROUGE en cas d'incertitude.
- **Aucun secret dans la sortie** : les jetons d'API n'apparaissent jamais dans les rapports.
- **Sûr contre les attaques XSS** : toutes les chaînes de caractères fournies par l'utilisateur sont échappées en HTML dans le paquet de l'avocat.
- **Suppression des informations sensibles** : les jetons, les clés API et les en-têtes d'autorisation sont supprimés avant l'écriture.
- **Analyse des secrets** : la commande `coe publish` analyse la sortie à la recherche de jetons divulgués avant l'écriture.

---

## Limitations

- Ne constitue pas un avis juridique ; ne remplace pas une recherche de marque ou un conseil professionnel.
- Aucune vérification de base de données de marques (USPTO, EUIPO, WIPO).
- Le radar de collision est indicatif (signaux d'utilisation sur le marché), et ne constitue pas une recherche de marque autorisée.
- La comparaison du corpus se fait uniquement avec les marques fournies par l'utilisateur, et non avec une base de données exhaustive.
- Les vérifications de noms de domaine couvrent uniquement les extensions `.com` et `.dev`.
- Docker Hub nécessite l'option `--dockerNamespace` ; Hugging Face nécessite l'option `--hfOwner`.
- Les variantes approximatives ont une distance d'édition de 1 uniquement ; les requêtes sont limitées à npm, PyPI et crates.io.
- L'analyse phonétique est axée sur l'anglais (algorithme Metaphone).
- La détection des homoglyphes couvre l'ASCII, le cyrillique et le grec (et non tous les scripts Unicode).
- Aucune vérification de noms d'utilisateur sur les réseaux sociaux.
- Toutes les vérifications sont des instantanés à un moment donné.
- Le mode batch est limité à 500 noms par fichier.
- La détection de la fraîcheur est informative uniquement (ne modifie pas le niveau de confiance).

Consultez [docs/LIMITATIONS.md](docs/LIMITATIONS.md) pour la liste complète.

---

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
