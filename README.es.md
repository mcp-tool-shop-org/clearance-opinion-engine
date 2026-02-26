<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Deterministic "verificación de disponibilidad de nombres y opinión legal"

Dado un nombre candidato, verifica la disponibilidad real en diferentes espacios de nombres (organización/repositorio de GitHub, npm, PyPI, dominio a través de RDAP, crates.io, Docker Hub, Hugging Face), genera variantes lingüísticas (normalizadas, tokenizadas, fonéticas, homóglifas, distancia de edición difusa = 1), busca nombres similares mediante un sistema de detección de colisiones (búsqueda en GitHub + npm), consulta registros para detectar conflictos con variantes difusas, compara con marcas conocidas proporcionadas por el usuario, y genera una opinión legal conservadora (VERDE / AMARILLO / ROJO) con un desglose explicable de la puntuación, un resumen ejecutivo, una matriz de cobertura y una cadena completa de evidencia.

---

## Contrato de veracidad

- **Mismas entradas + mismas respuestas del adaptador = salida idéntica en bytes.**
- Cada verificación produce un objeto `evidence` con SHA-256, marca de tiempo y pasos de reproducción.
- Las opiniones son conservadoras: VERDE solo cuando _todas_ las verificaciones del espacio de nombres son limpias _y_ no existen colisiones fonéticas/homóglifas.
- El motor nunca envía, publica ni modifica nada. Solo lee e informa.
- El desglose de la puntuación explica _por qué_ se asignó un nivel, pero nunca anula la lógica basada en reglas del nivel.

---

## Qué verifica

| Canal | Espacio de nombres | Método |
| --------- | ----------- | -------- |
| GitHub | Nombre de la organización | `GET /orgs/{name}` → 404 = disponible |
| GitHub | Nombre del repositorio | `GET /repos/{owner}/{name}` → 404 = disponible |
| npm | Paquete | `GET https://registry.npmjs.org/{name}` → 404 = disponible |
| PyPI | Paquete | `GET https://pypi.org/pypi/{name}/json` → 404 = disponible |
| Dominio | `.com`, `.dev` | RDAP (RFC 9083) a través de `rdap.org` → 404 = disponible |
| crates.io | Crate | `GET https://crates.io/api/v1/crates/{name}` → 404 = disponible |
| Docker Hub | Repositorio | `GET https://hub.docker.com/v2/repositories/{ns}/{name}` → 404 = disponible |
| Hugging Face | Modelo | `GET https://huggingface.co/api/models/{owner}/{name}` → 404 = disponible |
| Hugging Face | Espacio | `GET https://huggingface.co/api/spaces/{owner}/{name}` → 404 = disponible |

### Grupos de canales

| Grupo | Canales |
| ------- | ---------- |
| `core` (predeterminado) | github, npm, pypi, dominio |
| `dev` | cratesio, dockerhub |
| `ai` | huggingface |
| `all` | todos los canales |

Use `--channels <grupo>` para predefiniciones, o `--channels +cratesio,+dockerhub` para sintaxis aditiva (agrega al predeterminado).

### Señales indicativas (opcional)

| Fuente | Qué busca | Método |
| -------- | ----------------- | -------- |
| Radar de colisiones | Repositorios de GitHub | `GET /search/repositories?q={name}` → puntuación de similitud |
| Radar de colisiones | Paquetes de npm | `GET /-/v1/search?text={name}` → puntuación de similitud |
| Radar de colisiones | Crates de crates.io | `GET https://crates.io/api/v1/crates?q={name}` → puntuación de similitud |
| Radar de colisiones | Repositorios de Docker Hub | `GET https://hub.docker.com/v2/search/repositories?query={name}` → puntuación de similitud |
| Cuerpo | Marcas proporcionadas por el usuario | Comparación offline Jaro-Winkler + Metaphone |

Todas las llamadas a los adaptadores utilizan un reintento con retroceso exponencial (2 reintentos, retardo base de 500 ms). El almacenamiento en caché de disco opcional reduce las llamadas repetidas a la API.

---

## Qué genera

### Variantes

| Tipo | Entrada de ejemplo | Salida de ejemplo |
| ------ | --------------- | ---------------- |
| Normalizado | `My Cool Tool` | `my-cool-tool` |
| Tokenizado | `my-cool-tool` | `["my", "cool", "tool"]` |
| Fonético (Metaphone) | `["my", "cool", "tool"]` | `["M", "KL", "TL"]` |
| Homóglifos | `my-cool-tool` | `["my-c00l-tool", "my-co0l-t00l"]` (ASCII + Cirílico + Griego) |
| Difuso (distancia de edición = 1) | `my-cool-tool` | `["my-cool-too", "my-cool-tools", ...]` |

### Niveles de opinión

| Nivel | Significado |
| ------ | --------- |
| 🟢 VERDE | Todos los espacios de nombres disponibles, sin conflictos fonéticos/de homóglifos. |
| 🟡 AMARILLO | Algunas comprobaciones son inconclusas (red), conflictos cercanos o se ha tomado una variante difusa. |
| 🔴 ROJO | Conflicto exacto, colisión fonética o alto riesgo de confusión. |

### Desglose de la puntuación

Cada opinión incluye un desglose ponderado de la puntuación para facilitar la comprensión:

| Subpuntuación | Qué mide |
| ----------- | ----------------- |
| Disponibilidad de espacios de nombres | Porcentaje de espacios de nombres verificados que están disponibles. |
| Completitud de la cobertura | Cuántos tipos de espacios de nombres se verificaron (de 4). |
| Gravedad del conflicto | Penalización por conflictos exactos, fonéticos, de confusión, cercanos y por la toma de variantes. |
| Disponibilidad del dominio | Porcentaje de los dominios con disponibilidad de los TLD verificados. |

Perfiles de ponderación (flag `--risk`): **conservador** (por defecto), **equilibrado**, **agresivo**. Una mayor tolerancia al riesgo reduce los umbrales para los niveles VERDE/AMARILLO y desplaza el peso hacia la disponibilidad de espacios de nombres.

> **Nota**: El nivel siempre se basa en reglas; los conflictos exactos producen ROJO independientemente de la puntuación numérica. El desglose es metadatos aditivos solo para facilitar la comprensión.

### Mejoras de la opinión v2

El motor de opinión produce análisis adicionales (v0.6.0+):

| Función | Descripción |
| --------- | ------------- |
| Factores principales | 3-5 factores más importantes que influyen en la decisión del nivel, con clasificación de ponderación. |
| Narrativa de riesgo | Un párrafo determinista que resume el riesgo ("Si no haces nada..."). |
| Análisis DuPont-Lite | Similitud de marcas, superposición de canales, puntajes de proxy de fama e intención. |
| Alternativas más seguras | 5 sugerencias deterministas de nombres alternativos utilizando estrategias de prefijo/sufijo/separador/abreviatura/compuesto. |

Los factores principales y las narrativas de riesgo utilizan catálogos de plantillas; son deterministas y no utilizan texto de LLM. Los factores de DuPont-Lite se inspiran en el marco de análisis de marcas comerciales de DuPont, pero NO son asesoramiento legal.

### Salida de entrenamiento (v0.7.0+)

| Función | Descripción |
| --------- | ------------- |
| Próximos pasos | 2-4 pasos de entrenamiento ("qué hacer a continuación") basados en el nivel + los hallazgos. |
| Puntuación de cobertura | Medida del 0 al 100% de cuántos espacios de nombres solicitados se verificaron correctamente. |
| Espacios de nombres no verificados | Lista de espacios de nombres que devolvieron un estado desconocido. |
| Descargo de responsabilidad | Pie de página de aclaración legal que indica qué es y qué no es el informe. |
| Tarjetas de colisión | Explicaciones deterministas para cada tipo de conflicto. | `collisionCards[]` en la sección de opinión. |

Las acciones siguientes son diferentes de las `recommendedActions` (que son enlaces de reserva). Proporcionan texto explicativo: "Reclamar ahora", "Ejecutar de nuevo con --radar", "Consultar a un abogado de marcas", etc.

---

## Formato de salida

Cada ejecución produce cuatro archivos:

```
reports/<date>/
├── run.json           # Complete run object (per schema)
├── run.md             # Human-readable clearance report with score table
├── report.html        # Self-contained attorney packet (dark theme)
├── summary.json       # Condensed summary for integrations
└── manifest.json      # SHA-256 lockfile for tamper detection (via gen-lock)
```

### Paquete para el abogado (`report.html`)

Un informe HTML independiente, adecuado para compartir con el asesor legal. Incluye la opinión completa, la tabla de desglose de la puntuación, las comprobaciones de espacio de nombres, los hallazgos, la cadena de evidencia y las acciones recomendadas con enlaces de reserva. Tema oscuro, sin dependencias externas.

### Resumen en formato JSON (`summary.json`)

Una salida condensada para integraciones: nivel, puntuación general, estados del espacio de nombres, resumen de hallazgos, número de coincidencias detectadas por el "radar", número de coincidencias en el corpus, número de variantes aproximadas encontradas y acciones recomendadas.

---

## Criterios 1.0

Antes de que el motor alcance la versión 1.0.0, lo siguiente debe ser cierto:

- [x] Esquemas de artefactos publicados y validados en CI (`summary.schema.json`, `index-entry.schema.json`)
- [ ] Fiabilidad del adaptador documentada (tiempo de actividad, límites de velocidad, comportamiento de respaldo para cada canal)
- [x] Política de compatibilidad establecida y aplicada (`docs/VERSIONING.md`)
- [x] Consumo del sitio web probado como estable (`nameops` + ingestión del sitio de marketing `summary.json` → `/lab/clearance/`)
- [x] Las pruebas de "snapshot" cubren todos los resultados de nivel (VERDE, AMARILLO, ROJO)
- [ ] Tarjetas de colisión validadas contra ejecuciones del mundo real

---

## Instalación

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

Valida los artefactos JSON (`run.json`, `summary.json`, `runs.json`) contra los esquemas integrados. Imprime un indicador de "éxito/fracaso" por archivo. Sale con código 0 si todos son válidos, y 1 en caso contrario.

### Modo por lotes

`coe batch <file>` lee nombres de candidatos de un archivo `.txt` o `.json`, verifica cada uno con almacenamiento en caché compartido y control de concurrencia, y genera artefactos de ejecución por nombre, además de resúmenes a nivel de lote.

**Formato de texto** (`.txt`): Un nombre por línea. Las líneas en blanco y los comentarios con `#` se ignoran.

**Formato JSON** (`.json`): Un array de cadenas `["name1", "name2"]` o objetos `[{ "name": "name1", "riskTolerance": "aggressive" }]`.

Estructura de salida:
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

### Comando de repetición

`coe replay <dir>` lee un `run.json` del directorio especificado, verifica el manifiesto (si está presente) y regenera todas las salidas en un subdirectorio `replay/`. Luego, compara el Markdown regenerado con el original para verificar la determinabilidad.

```bash
# Run a check
node src/index.mjs check my-cool-tool --output reports

# Generate manifest (SHA-256 lockfile)
node scripts/gen-lock.mjs reports/2026-02-15

# Later: verify nothing changed
node src/index.mjs replay reports/2026-02-15
```

---

## Configuración

No se requiere archivo de configuración. Todas las opciones son banderas de la línea de comandos:

| Bandera | Valor predeterminado | Descripción |
| ------ | --------- | ------------- |
| `--channels` | `github,npm,pypi,domain` | Canales a verificar. Acepta una lista explícita, un nombre de grupo (`core`, `dev`, `ai`, `all`), o una lista aditiva (`+cratesio,+dockerhub`) |
| `--org` | _(ninguno)_ | Organización de GitHub a verificar para la disponibilidad del nombre de la organización |
| `--risk` | `conservative` | Tolerancia al riesgo: `conservador`, `equilibrado`, `agresivo` |
| `--output` | `reports/` | Directorio de salida para los artefactos de la ejecución |
| `--radar` | _(desactivado)_ | Habilita el "radar" de colisiones (búsqueda en GitHub + npm + crates.io + Docker Hub para nombres similares) |
| `--suggest` | _(desactivado)_ | Genera sugerencias de nombres alternativos más seguros en la opinión |
| `--corpus` | _(ninguno)_ | Ruta a un corpus JSON de marcas conocidas para comparar |
| `--cache-dir` | _(desactivado)_ | Directorio para el almacenamiento en caché de las respuestas del adaptador (o establece `COE_CACHE_DIR`) |
| `--max-age-hours` | `24` | TTL del caché en horas (requiere `--cache-dir`) |
| `--dockerNamespace` | _(ninguno)_ | Espacio de nombres de Docker Hub (usuario/organización) — requerido cuando el canal `dockerhub` está habilitado |
| `--hfOwner` | _(ninguno)_ | Propietario de Hugging Face (usuario/organización) — requerido cuando el canal `huggingface` está habilitado. |
| `--fuzzyQueryMode` | `registries` | Modo de consulta de variantes difusas: `off`, `registries`, `all`. |
| `--concurrency` | `4` | Número máximo de comprobaciones simultáneas en modo por lotes. |
| `--resume` | _(ninguno)_ | Reanudar el procesamiento por lotes desde un directorio de salida anterior (omite los nombres ya procesados). |
| `--variantBudget` | `12` | Número máximo de variantes difusas a consultar por registro (máximo: 30). |

### Variables de entorno

| Variable | Efecto |
| ---------- | -------- |
| `GITHUB_TOKEN` | Aumenta el límite de velocidad de la API de GitHub de 60/hora a 5000/hora. |
| `COE_CACHE_DIR` | Directorio de caché predeterminado (la opción `--cache-dir` de la línea de comandos tiene prioridad). |

---

## Esquema

El modelo de datos canónico se define en `schema/clearance.schema.json` (JSON Schema 2020-12).

Tipos de clave: `run`, `intake`, `candidate`, `channel`, `variants`, `namespaceCheck`, `finding`, `evidence`, `opinion`, `scoreBreakdown`, `manifest`.

---

## Pruebas

```bash
npm test            # unit tests
npm run test:e2e    # integration tests with golden snapshots
npm run test:all    # all tests
```

Todas las pruebas utilizan adaptadores inyectados en los datos de prueba (sin llamadas a la red). Las instantáneas doradas garantizan la determinabilidad idéntica en bytes.

---

## Códigos de error

| Código | Significado |
| ------ | --------- |
| `COE.INIT.NO_ARGS` | No se proporcionó ningún nombre de candidato. |
| `COE.INIT.BAD_CHANNEL` | Canal desconocido en `--channels`. |
| `COE.ADAPTER.GITHUB_FAIL` | La API de GitHub devolvió un error inesperado. |
| `COE.ADAPTER.NPM_FAIL` | El registro npm devolvió un error inesperado. |
| `COE.ADAPTER.PYPI_FAIL` | La API de PyPI devolvió un error inesperado. |
| `COE.ADAPTER.DOMAIN_FAIL` | La búsqueda RDAP falló. |
| `COE.ADAPTER.DOMAIN_RATE_LIMITED` | Se superó el límite de velocidad de RDAP (HTTP 429). |
| `COE.ADAPTER.CRATESIO_FAIL` | La API de crates.io devolvió un error inesperado. |
| `COE.ADAPTER.DOCKERHUB_FAIL` | La API de Docker Hub devolvió un error inesperado. |
| `COE.ADAPTER.HF_FAIL` | La API de Hugging Face devolvió un error inesperado. |
| `COE.ADAPTER.RADAR_GITHUB_FAIL` | La API de búsqueda de GitHub no está disponible. |
| `COE.ADAPTER.RADAR_NPM_FAIL` | La API de búsqueda de npm no está disponible. |
| `COE.ADAPTER.RADAR_CRATESIO_FAIL` | La API de búsqueda de crates.io no está disponible. |
| `COE.ADAPTER.RADAR_DOCKERHUB_FAIL` | La API de búsqueda de Docker Hub no está disponible. |
| `COE.DOCTOR.FATAL` | El comando `doctor` falló. |
| `COE.DOCKER.NAMESPACE_REQUIRED` | El canal de Docker Hub está habilitado sin `--dockerNamespace`. |
| `COE.HF.OWNER_REQUIRED` | El canal de Hugging Face está habilitado sin `--hfOwner`. |
| `COE.VARIANT.FUZZY_HIGH` | El número de variantes difusas excede el umbral (informativo). |
| `COE.CORPUS.INVALID` | El archivo de corpus tiene un formato inválido. |
| `COE.CORPUS.NOT_FOUND` | No se encontró el archivo de corpus en la ruta especificada. |
| `COE.RENDER.WRITE_FAIL` | No se pudieron escribir los archivos de salida. |
| `COE.LOCK.MISMATCH` | La verificación del archivo de bloqueo falló (modificado). |
| `COE.REPLAY.NO_RUN` | No hay `run.json` en el directorio de reanudación. |
| `COE.REPLAY.HASH_MISMATCH` | Error de coincidencia de hash del manifiesto durante la reanudación. |
| `COE.REPLAY.MD_DIFF` | El Markdown regenerado difiere del original. |
| `COE.BATCH.BAD_FORMAT` | Formato de archivo por lotes no compatible. |
| `COE.BATCH.EMPTY` | El archivo por lotes no contiene nombres. |
| `COE.BATCH.DUPLICATE` | Nombre duplicado en el archivo por lotes. |
| `COE.BATCH.TOO_MANY` | El lote excede el límite de seguridad de 500 nombres. |
| `COE.REFRESH.NO_RUN` | No hay `run.json` en el directorio de actualización. |
| `COE.PUBLISH.NOT_FOUND` | No se encontró el directorio de ejecución para la publicación. |
| `COE.PUBLISH.NO_FILES` | No hay archivos publicables en el directorio. |
| `COE.PUBLISH.SECRET_DETECTED` | Posible secreto detectado en la salida de la publicación (advertencia). |
| `COE.NET.DNS_FAIL` | La resolución de DNS falló; verifique la conexión de red. |
| `COE.NET.CONN_REFUSED` | El servidor remoto rechazó la conexión. |
| `COE.NET.TIMEOUT` | La solicitud se agotó el tiempo de espera. |
| `COE.NET.RATE_LIMITED` | Límite de velocidad alcanzado; espere e intente de nuevo. |
| `COE.FS.PERMISSION` | Permiso denegado para escribir en el disco. |
| `COE.CORPUS.EXISTS` | El archivo de corpus ya existe (durante la inicialización). |
| `COE.CORPUS.EMPTY_NAME` | El nombre es obligatorio, pero está vacío. |
| `COE.VALIDATE.*` | Errores de validación de artefactos. |

Consulte [docs/RUNBOOK.md](docs/RUNBOOK.md) para obtener la referencia completa de errores y la guía de solución de problemas.

---

## Seguridad

- **Solo lectura**: nunca modifica ningún espacio de nombres, registro o repositorio.
- **Determinista**: las mismas entradas producen resultados idénticos.
- **Respaldado por evidencia**: cada opinión se basa en comprobaciones específicas con hashes SHA-256.
- **Conservador**: por defecto, adopta los niveles de riesgo AMARILLO/ROJO cuando hay incertidumbre.
- **Sin secretos en la salida**: los tokens de la API nunca aparecen en los informes.
- **Seguro contra XSS**: todas las cadenas de texto del usuario se codifican en HTML en el paquete del abogado.
- **Eliminación de información sensible**: los tokens, las claves de la API y los encabezados de autorización se eliminan antes de la escritura.
- **Análisis de secretos**: el comando `coe publish` analiza la salida en busca de tokens filtrados antes de la escritura.

---

## Limitaciones

- No constituye asesoramiento legal; no es una búsqueda de marcas registradas ni un sustituto del asesoramiento profesional.
- No se realizan comprobaciones en bases de datos de marcas registradas (USPTO, EUIPO, WIPO).
- El "radar de colisiones" es indicativo (señales de uso en el mercado), pero no es una búsqueda exhaustiva de marcas registradas.
- La comparación del corpus se realiza únicamente con las marcas proporcionadas por el usuario, no con una base de datos exhaustiva.
- Las comprobaciones de dominio cubren solo los dominios ".com" y ".dev".
- Docker Hub requiere el parámetro `--dockerNamespace`; Hugging Face requiere el parámetro `--hfOwner`.
- Las variantes aproximadas tienen una distancia de edición de 1; las consultas están limitadas a npm, PyPI y crates.io.
- El análisis fonético se centra en el inglés (algoritmo Metaphone).
- La detección de homóglifos cubre ASCII, cirílico y griego (no todos los scripts Unicode).
- No se realizan comprobaciones de nombres de usuario en redes sociales.
- Todas las comprobaciones son instantáneas en un momento determinado.
- El modo por lotes está limitado a 500 nombres por archivo.
- La detección de "frescura" es solo informativa (no cambia el nivel de riesgo).

Consulte [docs/LIMITATIONS.md](docs/LIMITATIONS.md) para obtener la lista completa.

---

## Licencia

MIT

---

Desarrollado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
