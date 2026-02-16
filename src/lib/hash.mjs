/**
 * SHA-256 hashing utilities for clearance-opinion-engine.
 *
 * hashObject() sorts keys recursively before stringifying to guarantee
 * byte-identical hashes for semantically equivalent objects.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * SHA-256 hash of a string.
 * @param {string} str
 * @returns {string} hex digest
 */
export function hashString(str) {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * Sort object keys recursively for canonical JSON.
 * Arrays preserve order; objects get sorted keys.
 * @param {*} val
 * @returns {*}
 */
export function canonicalize(val) {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(canonicalize);
  const sorted = {};
  for (const key of Object.keys(val).sort()) {
    sorted[key] = canonicalize(val[key]);
  }
  return sorted;
}

/**
 * SHA-256 hash of an object using canonical JSON (sorted keys).
 * @param {object} obj
 * @returns {string} hex digest
 */
export function hashObject(obj) {
  const canonical = JSON.stringify(canonicalize(obj));
  return hashString(canonical);
}

/**
 * SHA-256 hash of a file (streamed).
 * @param {string} filePath
 * @returns {Promise<string>} hex digest
 */
export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
