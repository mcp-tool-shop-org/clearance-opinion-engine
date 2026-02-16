import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createCollisionRadarAdapter } from "../../src/adapters/collision-radar.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures", "adapters");

const NOW = "2026-02-15T12:00:00.000Z";

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

function mockFetch(fixture) {
  return async () => ({
    status: fixture.status,
    text: async () => fixture.body,
  });
}

function errorFetch(message = "ECONNREFUSED") {
  return async () => {
    throw new Error(message);
  };
}

// ── searchGitHub ────────────────────────────────────────────────

describe("searchGitHub", () => {
  it("returns checks for matching repos above threshold", async () => {
    const fixture = loadFixture("collision-radar-github-results.json");
    const radar = createCollisionRadarAdapter(mockFetch(fixture), { similarityThreshold: 0.70 });
    const { checks, evidence } = await radar.searchGitHub("my-cool-tool", { now: NOW });

    // Should match "my-cool-tool" (exact) and "my-kool-tool" (close)
    // "totally-different" should be filtered out
    assert.ok(checks.length >= 1);
    assert.ok(checks.every((c) => c.namespace === "custom"));
    assert.ok(checks.every((c) => c.authority === "indicative"));
    assert.ok(checks.every((c) => c.status === "taken"));

    // Check that similarity details are present
    const exactMatch = checks.find((c) => c.query.value === "my-cool-tool");
    assert.ok(exactMatch);
    assert.ok(exactMatch.details.source === "github_search");
    assert.ok(exactMatch.details.similarity.overall >= 0.95);
  });

  it("returns empty checks for empty results", async () => {
    const fixture = loadFixture("collision-radar-github-empty.json");
    const radar = createCollisionRadarAdapter(mockFetch(fixture));
    const { checks } = await radar.searchGitHub("zzzzz-unique-name", { now: NOW });

    // No matching repos → no checks (only search-level evidence)
    assert.equal(checks.length, 0);
  });

  it("handles network errors gracefully", async () => {
    const radar = createCollisionRadarAdapter(errorFetch());
    const { checks, evidence } = await radar.searchGitHub("test", { now: NOW });

    assert.equal(checks.length, 1);
    assert.equal(checks[0].status, "unknown");
    assert.ok(checks[0].errors[0].code === "COE.ADAPTER.RADAR_GITHUB_FAIL");
    assert.ok(evidence.length >= 1);
    assert.ok(evidence[0].notes);
  });

  it("evidence has system 'github_search'", async () => {
    const fixture = loadFixture("collision-radar-github-results.json");
    const radar = createCollisionRadarAdapter(mockFetch(fixture));
    const { evidence } = await radar.searchGitHub("my-cool-tool", { now: NOW });

    assert.ok(evidence.length >= 1);
    assert.ok(evidence.every((e) => e.source.system === "github_search"));
  });

  it("check IDs start with 'chk.collision-radar.'", async () => {
    const fixture = loadFixture("collision-radar-github-results.json");
    const radar = createCollisionRadarAdapter(mockFetch(fixture));
    const { checks } = await radar.searchGitHub("my-cool-tool", { now: NOW });

    for (const c of checks) {
      assert.ok(c.id.startsWith("chk.collision-radar."), `Expected chk.collision-radar.* but got ${c.id}`);
    }
  });
});

// ── searchNpm ───────────────────────────────────────────────────

describe("searchNpm", () => {
  it("returns checks for matching packages above threshold", async () => {
    const fixture = loadFixture("collision-radar-npm-results.json");
    const radar = createCollisionRadarAdapter(mockFetch(fixture), { similarityThreshold: 0.70 });
    const { checks } = await radar.searchNpm("my-cool-tool", { now: NOW });

    assert.ok(checks.length >= 1);
    assert.ok(checks.every((c) => c.namespace === "custom"));
    assert.ok(checks.every((c) => c.authority === "indicative"));

    const exactMatch = checks.find((c) => c.query.value === "my-cool-tool");
    assert.ok(exactMatch);
    assert.ok(exactMatch.details.source === "npm_search");
  });

  it("returns empty checks for empty results", async () => {
    const fixture = loadFixture("collision-radar-npm-empty.json");
    const radar = createCollisionRadarAdapter(mockFetch(fixture));
    const { checks } = await radar.searchNpm("zzzzz-unique-name", { now: NOW });

    assert.equal(checks.length, 0);
  });

  it("handles network errors gracefully", async () => {
    const radar = createCollisionRadarAdapter(errorFetch());
    const { checks } = await radar.searchNpm("test", { now: NOW });

    assert.equal(checks.length, 1);
    assert.equal(checks[0].status, "unknown");
    assert.ok(checks[0].errors[0].code === "COE.ADAPTER.RADAR_NPM_FAIL");
  });

  it("evidence has system 'npm_search'", async () => {
    const fixture = loadFixture("collision-radar-npm-results.json");
    const radar = createCollisionRadarAdapter(mockFetch(fixture));
    const { evidence } = await radar.searchNpm("my-cool-tool", { now: NOW });

    assert.ok(evidence.length >= 1);
    assert.ok(evidence.every((e) => e.source.system === "npm_search"));
  });
});

// ── scanAll ─────────────────────────────────────────────────────

describe("scanAll", () => {
  it("aggregates results from GitHub and npm", async () => {
    const ghFixture = loadFixture("collision-radar-github-results.json");
    const npmFixture = loadFixture("collision-radar-npm-results.json");

    const radar = createCollisionRadarAdapter(async (url) => {
      if (url.includes("api.github.com")) {
        return { status: ghFixture.status, text: async () => ghFixture.body };
      }
      return { status: npmFixture.status, text: async () => npmFixture.body };
    }, { similarityThreshold: 0.70 });

    const { checks, evidence } = await radar.scanAll("my-cool-tool", { now: NOW });

    // Should have results from both sources
    const ghChecks = checks.filter((c) => c.details?.source === "github_search");
    const npmChecks = checks.filter((c) => c.details?.source === "npm_search");

    assert.ok(ghChecks.length >= 1, "Should have GitHub results");
    assert.ok(npmChecks.length >= 1, "Should have npm results");
    assert.ok(evidence.length >= 2, "Should have evidence from both sources");
  });

  it("handles partial failure (one source fails)", async () => {
    const npmFixture = loadFixture("collision-radar-npm-results.json");

    const radar = createCollisionRadarAdapter(async (url) => {
      if (url.includes("api.github.com")) {
        throw new Error("GitHub unavailable");
      }
      return { status: npmFixture.status, text: async () => npmFixture.body };
    }, { similarityThreshold: 0.70 });

    const { checks, evidence } = await radar.scanAll("my-cool-tool", { now: NOW });

    // Should still have npm results + GitHub error
    assert.ok(checks.length >= 1);
    assert.ok(evidence.length >= 1);
  });

  it("filters results below similarity threshold", async () => {
    const ghFixture = loadFixture("collision-radar-github-results.json");

    const radar = createCollisionRadarAdapter(async (url) => {
      if (url.includes("api.github.com")) {
        return { status: ghFixture.status, text: async () => ghFixture.body };
      }
      return { status: 200, text: async () => '{"objects":[],"total":0}' };
    }, { similarityThreshold: 0.99 });

    const { checks } = await radar.scanAll("my-cool-tool", { now: NOW });

    // Only exact match should pass 0.99 threshold
    const takenChecks = checks.filter((c) => c.status === "taken");
    assert.ok(takenChecks.length <= 1, "High threshold should filter most results");
  });

  it("is deterministic (same fixture = same output)", async () => {
    const ghFixture = loadFixture("collision-radar-github-results.json");
    const npmFixture = loadFixture("collision-radar-npm-results.json");

    const makeFetch = () => async (url) => {
      if (url.includes("api.github.com")) {
        return { status: ghFixture.status, text: async () => ghFixture.body };
      }
      return { status: npmFixture.status, text: async () => npmFixture.body };
    };

    const r1 = createCollisionRadarAdapter(makeFetch(), { similarityThreshold: 0.70 });
    const r2 = createCollisionRadarAdapter(makeFetch(), { similarityThreshold: 0.70 });

    const res1 = await r1.scanAll("my-cool-tool", { now: NOW });
    const res2 = await r2.scanAll("my-cool-tool", { now: NOW });

    assert.deepEqual(res1, res2);
  });
});
