/**
 * Artifact validation for clearance-opinion-engine.
 *
 * Zero-dependency minimal validator. Checks required fields, const values,
 * types, and enums — NOT a full JSON Schema validator.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── Helpers ────────────────────────────────────────────────────

function checkRequired(obj, fields, prefix, errors) {
  for (const field of fields) {
    if (!(field in obj)) {
      errors.push({ path: prefix ? `${prefix}.${field}` : field, message: "missing required field" });
    }
  }
}

function checkConst(obj, field, expected, errors) {
  if (field in obj && obj[field] !== expected) {
    errors.push({ path: field, message: `expected "${expected}", got "${obj[field]}"` });
  }
}

function checkType(obj, field, expectedType, errors) {
  if (!(field in obj)) return;
  const value = obj[field];

  if (expectedType === "array") {
    if (!Array.isArray(value)) {
      errors.push({ path: field, message: `expected array, got ${typeof value}` });
    }
  } else if (expectedType === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push({ path: field, message: `expected object, got ${Array.isArray(value) ? "array" : typeof value}` });
    }
  } else if (typeof value !== expectedType) {
    errors.push({ path: field, message: `expected ${expectedType}, got ${typeof value}` });
  }
}

function checkArray(obj, field, errors) {
  if (!(field in obj)) return;
  if (!Array.isArray(obj[field])) {
    errors.push({ path: field, message: `expected array, got ${typeof obj[field]}` });
  }
}

function checkEnum(obj, field, allowed, prefix, errors) {
  if (!(field in obj)) return;
  const path = prefix ? `${prefix}.${field}` : field;
  if (!allowed.includes(obj[field])) {
    errors.push({ path, message: `expected one of [${allowed.join(", ")}], got "${obj[field]}"` });
  }
}

// ── Validators per type ────────────────────────────────────────

const TIER_VALUES = ["green", "yellow", "red", "unknown"];

function validateRun(data) {
  const errors = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push({ path: "", message: "expected an object" });
    return { valid: false, errors };
  }

  const required = ["schemaVersion", "run", "intake", "variants", "checks", "evidence", "opinion"];
  checkRequired(data, required, "", errors);
  checkConst(data, "schemaVersion", "1.0.0", errors);
  checkArray(data, "checks", errors);
  checkArray(data, "evidence", errors);

  if ("findings" in data) {
    checkArray(data, "findings", errors);
  }

  if (data.opinion && typeof data.opinion === "object") {
    checkEnum(data.opinion, "tier", TIER_VALUES, "opinion", errors);
  }

  return { valid: errors.length === 0, errors };
}

function validateSummary(data) {
  const errors = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push({ path: "", message: "expected an object" });
    return { valid: false, errors };
  }

  const required = [
    "schemaVersion", "formatVersion", "generatedAt",
    "engineVersion", "runId", "candidates", "tier",
    "namespaces", "findingsSummary",
  ];
  checkRequired(data, required, "", errors);
  checkConst(data, "schemaVersion", "1.0.0", errors);
  checkConst(data, "formatVersion", "1.0.0", errors);
  checkEnum(data, "tier", TIER_VALUES, "", errors);
  checkArray(data, "candidates", errors);
  checkArray(data, "namespaces", errors);
  checkType(data, "findingsSummary", "object", errors);

  return { valid: errors.length === 0, errors };
}

function validateIndexEntry(data) {
  const errors = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push({ path: "", message: "expected an object" });
    return { valid: false, errors };
  }

  const required = ["schemaVersion", "slug", "name", "tier", "date"];
  checkRequired(data, required, "", errors);
  checkConst(data, "schemaVersion", "1.0.0", errors);
  checkEnum(data, "tier", TIER_VALUES, "", errors);

  return { valid: errors.length === 0, errors };
}

// ── Public API ────────────────────────────────────────────────

/**
 * Validate a single parsed JSON object against a known artifact type.
 *
 * @param {*} data - Parsed JSON value
 * @param {"run"|"summary"|"index-entry"} type - Artifact type
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
export function validateArtifact(data, type) {
  switch (type) {
    case "run":
      return validateRun(data);
    case "summary":
      return validateSummary(data);
    case "index-entry":
      return validateIndexEntry(data);
    default:
      return { valid: false, errors: [{ path: "", message: `unknown artifact type: ${type}` }] };
  }
}

/**
 * Scan a directory for known artifact files and validate each.
 *
 * Known files: run.json, summary.json, runs.json.
 * runs.json is parsed as an array; each element is validated as "index-entry".
 * Missing files are silently skipped.
 *
 * @param {string} dir - Absolute path to directory
 * @returns {{ results: Array<{file: string, type: string, valid: boolean, errors: Array}>, allValid: boolean }}
 */
export function validateDirectory(dir) {
  const results = [];

  if (!existsSync(dir)) {
    return { results, allValid: false };
  }

  // run.json
  const runPath = join(dir, "run.json");
  if (existsSync(runPath)) {
    try {
      const data = JSON.parse(readFileSync(runPath, "utf8"));
      const result = validateArtifact(data, "run");
      results.push({ file: "run.json", type: "run", valid: result.valid, errors: result.errors });
    } catch (err) {
      results.push({ file: "run.json", type: "run", valid: false, errors: [{ path: "", message: `parse error: ${err.message}` }] });
    }
  }

  // summary.json
  const summaryPath = join(dir, "summary.json");
  if (existsSync(summaryPath)) {
    try {
      const data = JSON.parse(readFileSync(summaryPath, "utf8"));
      const result = validateArtifact(data, "summary");
      results.push({ file: "summary.json", type: "summary", valid: result.valid, errors: result.errors });
    } catch (err) {
      results.push({ file: "summary.json", type: "summary", valid: false, errors: [{ path: "", message: `parse error: ${err.message}` }] });
    }
  }

  // runs.json — array of index entries
  const runsPath = join(dir, "runs.json");
  if (existsSync(runsPath)) {
    try {
      const data = JSON.parse(readFileSync(runsPath, "utf8"));
      if (!Array.isArray(data)) {
        results.push({ file: "runs.json", type: "index-entry[]", valid: false, errors: [{ path: "", message: "expected an array" }] });
      } else {
        const allErrors = [];
        for (let i = 0; i < data.length; i++) {
          const entry = data[i];
          const result = validateIndexEntry(entry);
          for (const err of result.errors) {
            allErrors.push({ path: `[${i}].${err.path}`.replace(/\.$/, ""), message: err.message });
          }
        }
        results.push({ file: "runs.json", type: "index-entry[]", valid: allErrors.length === 0, errors: allErrors });
      }
    } catch (err) {
      results.push({ file: "runs.json", type: "index-entry[]", valid: false, errors: [{ path: "", message: `parse error: ${err.message}` }] });
    }
  }

  const allValid = results.length > 0 && results.every((r) => r.valid);
  return { results, allValid };
}
