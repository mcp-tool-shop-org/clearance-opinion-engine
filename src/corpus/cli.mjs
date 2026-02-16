/**
 * Corpus CLI tooling.
 *
 * corpusInit — create a new corpus.json template
 * corpusAdd  — append a mark to an existing corpus file
 *
 * Throws on errors (does NOT call process.exit).
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { hashString } from "../lib/hash.mjs";
import { loadCorpus } from "../adapters/corpus.mjs";

function corpusError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Create a new corpus.json template file.
 *
 * @param {string} outputPath - Path to write the corpus file
 * @param {object} [opts]
 * @param {string} [opts.now] - Injectable ISO timestamp
 * @throws If file already exists
 */
export function corpusInit(outputPath, opts = {}) {
  const { now = new Date().toISOString() } = opts;

  if (existsSync(outputPath)) {
    throw corpusError("COE.CORPUS.EXISTS", `Corpus file already exists: ${outputPath}`);
  }

  const template = {
    marks: [],
    metadata: {
      createdAt: now,
      version: "1.0.0",
    },
  };

  writeFileSync(outputPath, JSON.stringify(template, null, 2) + "\n", "utf8");
  return { path: outputPath, created: true };
}

/**
 * Append a mark to an existing corpus file.
 *
 * Deduplicates by name (case-insensitive). Uses atomic write (tmp + rename).
 *
 * @param {string} corpusPath - Path to existing corpus file
 * @param {object} entry
 * @param {string} entry.name - Mark name (required)
 * @param {number} [entry.class] - Nice classification number
 * @param {string} [entry.registrant] - Owner/registrant name
 * @returns {{ path: string, added: boolean, id: string }}
 */
export function corpusAdd(corpusPath, entry = {}) {
  const { name, class: niceClass, registrant } = entry;

  if (!name || name.trim().length === 0) {
    throw corpusError("COE.CORPUS.EMPTY_NAME", "Mark name is required");
  }

  if (!existsSync(corpusPath)) {
    throw corpusError("COE.CORPUS.NOT_FOUND", `Corpus file not found: ${corpusPath}`);
  }

  // Validate by loading
  const corpus = loadCorpus(corpusPath);

  // Check for duplicate (case-insensitive)
  const lower = name.trim().toLowerCase();
  const existing = corpus.marks.find((m) => m.mark.toLowerCase() === lower);
  if (existing) {
    return { path: corpusPath, added: false, id: null, reason: "duplicate" };
  }

  // Generate deterministic ID
  const id = `mark.${hashString(lower).slice(0, 8)}`;

  // Build new mark entry
  const mark = { id, mark: name.trim() };
  if (niceClass !== undefined && niceClass !== null) {
    mark.class = Number(niceClass);
  }
  if (registrant) {
    mark.registrant = registrant;
  }

  corpus.marks.push(mark);

  // Atomic write (tmp + rename)
  const dir = dirname(corpusPath);
  const tmpPath = join(dir, `.corpus-tmp-${randomBytes(4).toString("hex")}.json`);
  writeFileSync(tmpPath, JSON.stringify(corpus, null, 2) + "\n", "utf8");
  renameSync(tmpPath, corpusPath);

  return { path: corpusPath, added: true, id };
}
