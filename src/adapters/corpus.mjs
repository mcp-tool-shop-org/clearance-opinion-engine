/**
 * User-provided corpus comparison for clearance-opinion-engine.
 *
 * Accepts a local JSON file of known marks (competitors, portfolio,
 * avoid-list, etc.) and compares candidates against it using the
 * similarity engine. No network calls — fully offline and deterministic.
 *
 * Corpus format:
 *   { "marks": [{ "mark": "ReactJS", "class": 9, "registrant": "Meta" }, ...] }
 */

import { readFileSync } from "node:fs";
import { findingId } from "../lib/ids.mjs";
import { hashString } from "../lib/hash.mjs";
import { findSimilarMarks, similarityLabel } from "../scoring/similarity.mjs";

/**
 * Load and validate a corpus file.
 *
 * @param {string} corpusPath - Path to corpus.json
 * @returns {{ marks: Array<{ mark: string, class?: number, registrant?: string }> }}
 * @throws {Error} with code COE.CORPUS.INVALID if file is invalid
 */
export function loadCorpus(corpusPath) {
  let raw;
  try {
    raw = readFileSync(corpusPath, "utf8");
  } catch (err) {
    const error = new Error(`Cannot read corpus file: ${corpusPath} — ${err.message}`);
    error.code = "COE.CORPUS.INVALID";
    throw error;
  }

  let corpus;
  try {
    corpus = JSON.parse(raw);
  } catch (err) {
    const error = new Error(`Corpus file is not valid JSON: ${corpusPath}`);
    error.code = "COE.CORPUS.INVALID";
    throw error;
  }

  if (!corpus || !Array.isArray(corpus.marks)) {
    const error = new Error(`Corpus file must have a "marks" array: ${corpusPath}`);
    error.code = "COE.CORPUS.INVALID";
    throw error;
  }

  for (let i = 0; i < corpus.marks.length; i++) {
    const entry = corpus.marks[i];
    if (!entry || typeof entry.mark !== "string" || entry.mark.length === 0) {
      const error = new Error(`Corpus entry ${i} must have a non-empty "mark" string`);
      error.code = "COE.CORPUS.INVALID";
      throw error;
    }
  }

  return corpus;
}

/**
 * Compare a candidate against a corpus of known marks.
 *
 * @param {string} candidateMark
 * @param {{ marks: Array<{ mark: string, class?: number, registrant?: string }> }} corpus
 * @param {{ threshold?: number, now?: string, lookWeight?: number, soundWeight?: number }} [opts]
 * @returns {{ findings: object[], evidence: object[], closestConflicts: object[] }}
 */
export function compareAgainstCorpus(candidateMark, corpus, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const threshold = opts.threshold ?? 0.70;

  const findings = [];
  const evidence = [];
  const closestConflicts = [];

  const matches = findSimilarMarks(candidateMark, corpus.marks, {
    threshold,
    lookWeight: opts.lookWeight,
    soundWeight: opts.soundWeight,
  });

  for (let i = 0; i < matches.length; i++) {
    const { mark, comparison } = matches[i];
    const corpusEntry = corpus.marks.find((m) => m.mark === mark);

    // Determine finding kind based on similarity scores
    let kind = "near_conflict";
    let severity = "medium";

    if (comparison.sounds.score >= 0.85) {
      kind = "phonetic_conflict";
      severity = "high";
    } else if (comparison.overall >= 0.85) {
      kind = "near_conflict";
      severity = "high";
    }

    // Build evidence for this corpus match
    const evId = `ev.corpus.${i}`;
    const markHash = hashString(JSON.stringify(corpusEntry || { mark }));

    evidence.push({
      id: evId,
      type: "text",
      source: { system: "user_corpus" },
      observedAt: now,
      sha256: markHash,
      notes: `Corpus entry: "${mark}"${corpusEntry?.class ? ` (Nice class ${corpusEntry.class})` : ""}${corpusEntry?.registrant ? ` by ${corpusEntry.registrant}` : ""}`,
    });

    // Build commercial impression line
    const looksLabel = similarityLabel(comparison.looks.score);
    const soundsLabel = similarityLabel(comparison.sounds.score);
    const commercialImpression = `Commercial impression: Looks like "${mark}" (${looksLabel}), sounds like "${mark}" (${soundsLabel})`;

    // Build finding
    const why = [...comparison.why, commercialImpression];

    findings.push({
      id: findingId(kind, `corpus-${candidateMark}-${mark}`, i),
      candidateMark,
      kind,
      summary: `Candidate "${candidateMark}" is similar to known mark "${mark}" (overall: ${comparison.overall.toFixed(2)})`,
      severity,
      score: Math.round(comparison.overall * 100),
      why,
      evidenceRefs: [evId],
    });

    // Build closest conflict entry
    closestConflicts.push({
      mark,
      why: [
        `${kind === "phonetic_conflict" ? "Phonetic" : "Visual"} similarity: ${comparison.overall.toFixed(2)} (${similarityLabel(comparison.overall)})`,
        commercialImpression,
      ],
      severity,
      evidenceRefs: [evId],
    });
  }

  return { findings, evidence, closestConflicts };
}
