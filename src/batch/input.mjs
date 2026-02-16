/**
 * Batch input parser.
 *
 * Supports .txt (one name per line) and .json (array of strings or objects).
 *
 * Throws on validation errors (does NOT call process.exit).
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";

const MAX_NAMES = 500;

/**
 * Create a structured error for batch input validation.
 */
function batchError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Parse a batch input file.
 *
 * @param {string} filePath - Absolute path to .txt or .json file
 * @returns {{ names: Array<{ name: string, config?: object }>, format: string }}
 * @throws On validation errors
 */
export function parseBatchInput(filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext !== ".txt" && ext !== ".json") {
    throw batchError("COE.BATCH.BAD_FORMAT", `Unsupported batch file format: ${ext}`);
  }

  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    throw batchError("COE.BATCH.READ_FAIL", `Cannot read batch file: ${err.message}`);
  }

  if (ext === ".txt") {
    return parseTxt(raw);
  }
  return parseJson(raw);
}

/**
 * Parse a .txt batch file.
 * One name per line. Blank lines and # comments are ignored.
 */
function parseTxt(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) {
    throw batchError("COE.BATCH.EMPTY", "Batch file contains no names");
  }

  // Check for duplicates
  const seen = new Set();
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (seen.has(lower)) {
      throw batchError("COE.BATCH.DUPLICATE", `Duplicate name: "${line}"`);
    }
    seen.add(lower);
  }

  if (lines.length > MAX_NAMES) {
    throw batchError("COE.BATCH.TOO_MANY", `Batch file contains ${lines.length} names (max: ${MAX_NAMES})`);
  }

  return {
    names: lines.map((name) => ({ name })),
    format: "txt",
  };
}

/**
 * Parse a .json batch file.
 * Accepts: ["name1", "name2"] or [{ name: "name1", channels: "all" }]
 */
function parseJson(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw batchError("COE.BATCH.BAD_JSON", `Invalid JSON: ${err.message}`);
  }

  if (!Array.isArray(data)) {
    throw batchError("COE.BATCH.BAD_FORMAT", "JSON must be an array");
  }

  if (data.length === 0) {
    throw batchError("COE.BATCH.EMPTY", "Batch file contains no names");
  }

  const names = data.map((item, idx) => {
    if (typeof item === "string") {
      if (item.trim().length === 0) {
        throw batchError("COE.BATCH.EMPTY_NAME", `Entry ${idx} is empty`);
      }
      return { name: item.trim() };
    }

    if (typeof item === "object" && item !== null && typeof item.name === "string") {
      if (item.name.trim().length === 0) {
        throw batchError("COE.BATCH.EMPTY_NAME", `Entry ${idx} has empty name`);
      }
      const { name, ...config } = item;
      return Object.keys(config).length > 0
        ? { name: name.trim(), config }
        : { name: name.trim() };
    }

    throw batchError("COE.BATCH.BAD_ENTRY", `Entry ${idx} is not a string or {name: string} object`);
  });

  // Check for duplicates
  const seen = new Set();
  for (const entry of names) {
    const lower = entry.name.toLowerCase();
    if (seen.has(lower)) {
      throw batchError("COE.BATCH.DUPLICATE", `Duplicate name: "${entry.name}"`);
    }
    seen.add(lower);
  }

  if (names.length > MAX_NAMES) {
    throw batchError("COE.BATCH.TOO_MANY", `Batch file contains ${names.length} names (max: ${MAX_NAMES})`);
  }

  return {
    names,
    format: "json",
  };
}
