#!/usr/bin/env node

/**
 * Verify a manifest.json lockfile against the files on disk.
 *
 * Usage: node scripts/verify-lock.mjs <manifest.json>
 * Exit 0 if all hashes match, exit 1 if any mismatch or error.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hashFile } from "../src/lib/hash.mjs";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: node scripts/verify-lock.mjs <manifest.json>");
  process.exit(1);
}

const absPath = resolve(manifestPath);
const dir = dirname(absPath);

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(absPath, "utf8"));
  } catch (err) {
    console.error(`Failed to read manifest: ${err.message}`);
    process.exit(1);
  }

  let mismatches = 0;
  let verified = 0;

  for (const entry of manifest.files) {
    const filePath = join(dir, entry.path);
    try {
      const actual = await hashFile(filePath);
      if (actual !== entry.sha256) {
        console.error(`MISMATCH: ${entry.path}`);
        console.error(`  expected: ${entry.sha256}`);
        console.error(`  actual:   ${actual}`);
        mismatches++;
      } else {
        verified++;
      }
    } catch (err) {
      console.error(`MISSING: ${entry.path} — ${err.message}`);
      mismatches++;
    }
  }

  console.log(`\nVerified: ${verified}/${manifest.files.length} files`);

  if (mismatches > 0) {
    console.error(`\n${mismatches} mismatch(es) found. Lockfile verification FAILED.`);
    process.exit(1);
  } else {
    console.log("All hashes match. Lockfile verification PASSED.");
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
