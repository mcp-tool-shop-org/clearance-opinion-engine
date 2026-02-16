#!/usr/bin/env node

/**
 * Generate a SHA-256 lockfile (manifest.json) for a run directory.
 *
 * Usage: node scripts/gen-lock.mjs <run-dir>
 */

import { readdirSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { hashFile, hashObject } from "../src/lib/hash.mjs";

const runDir = process.argv[2];
if (!runDir) {
  console.error("Usage: node scripts/gen-lock.mjs <run-directory>");
  process.exit(1);
}

const absDir = resolve(runDir);

async function main() {
  const entries = readdirSync(absDir).filter(
    (f) => f !== "manifest.json" && !f.startsWith(".")
  );

  const files = [];
  for (const name of entries.sort()) {
    const filePath = join(absDir, name);
    const stat = statSync(filePath);
    if (!stat.isFile()) continue;

    const sha256 = await hashFile(filePath);
    files.push({
      path: name,
      sha256,
      bytes: stat.size,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    files,
  };

  // Compute root hash of the manifest itself
  manifest.rootSha256 = hashObject(manifest);

  const outPath = join(absDir, "manifest.json");
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Manifest written to ${outPath}`);
  console.log(`  Files: ${files.length}`);
  console.log(`  Root SHA-256: ${manifest.rootSha256}`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
