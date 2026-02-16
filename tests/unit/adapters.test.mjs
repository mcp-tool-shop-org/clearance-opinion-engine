import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createGitHubAdapter } from "../../src/adapters/github.mjs";
import { createNpmAdapter } from "../../src/adapters/npm.mjs";
import { createPyPIAdapter } from "../../src/adapters/pypi.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures", "adapters");

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

/**
 * Create a mock fetch that returns a fixture response.
 */
function mockFetch(fixture) {
  return async () => ({
    status: fixture.status,
    text: async () => fixture.body,
  });
}

/**
 * Create a mock fetch that throws a network error.
 */
function failingFetch(message = "Network error") {
  return async () => {
    throw new Error(message);
  };
}

const NOW = "2026-02-15T12:00:00.000Z";

describe("GitHub adapter", () => {
  it("checkOrg returns available for 404", async () => {
    const fixture = loadFixture("github-available.json");
    const adapter = createGitHubAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkOrg("new-org", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.namespace, "github_org");
    assert.match(check.id, /^chk\.github-org\./);
    assert.equal(evidence.type, "http_response");
    assert.equal(evidence.source.system, "github");
  });

  it("checkOrg returns taken for 200", async () => {
    const fixture = loadFixture("github-taken.json");
    const adapter = createGitHubAdapter(mockFetch(fixture));
    const { check } = await adapter.checkOrg("existing-org", { now: NOW });

    assert.equal(check.status, "taken");
    assert.equal(check.authority, "authoritative");
  });

  it("checkOrg returns unknown on network error", async () => {
    const adapter = createGitHubAdapter(failingFetch("ECONNREFUSED"));
    const { check, evidence } = await adapter.checkOrg("test-org", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.ok(check.errors.length > 0);
    assert.equal(check.errors[0].code, "COE.ADAPTER.GITHUB_FAIL");
  });

  it("checkRepo returns available for 404", async () => {
    const fixture = loadFixture("github-available.json");
    const adapter = createGitHubAdapter(mockFetch(fixture));
    const { check } = await adapter.checkRepo("my-org", "new-repo", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.namespace, "github_repo");
    assert.equal(check.query.owner, "my-org");
  });

  it("checkRepo returns taken for 200", async () => {
    const fixture = loadFixture("github-taken.json");
    const adapter = createGitHubAdapter(mockFetch(fixture));
    const { check } = await adapter.checkRepo("my-org", "existing-repo", { now: NOW });

    assert.equal(check.status, "taken");
  });
});

describe("npm adapter", () => {
  it("checkPackage returns available for 404", async () => {
    const fixture = loadFixture("npm-available.json");
    const adapter = createNpmAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkPackage("new-package", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.namespace, "npm");
    assert.equal(evidence.source.system, "npm");
  });

  it("checkPackage returns taken for 200", async () => {
    const fixture = loadFixture("npm-taken.json");
    const adapter = createNpmAdapter(mockFetch(fixture));
    const { check } = await adapter.checkPackage("test-tool", { now: NOW });

    assert.equal(check.status, "taken");
    assert.equal(check.authority, "authoritative");
  });

  it("checkPackage returns unknown on network error", async () => {
    const adapter = createNpmAdapter(failingFetch("ENOTFOUND"));
    const { check } = await adapter.checkPackage("test-pkg", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.ok(check.errors.length > 0);
    assert.equal(check.errors[0].code, "COE.ADAPTER.NPM_FAIL");
  });
});

describe("PyPI adapter", () => {
  it("checkPackage returns available for 404", async () => {
    const fixture = loadFixture("pypi-available.json");
    const adapter = createPyPIAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkPackage("new-package", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.namespace, "pypi");
    assert.equal(evidence.source.system, "pypi");
  });

  it("checkPackage returns taken for 200", async () => {
    const fixture = loadFixture("pypi-taken.json");
    const adapter = createPyPIAdapter(mockFetch(fixture));
    const { check } = await adapter.checkPackage("test-tool", { now: NOW });

    assert.equal(check.status, "taken");
    assert.equal(check.authority, "authoritative");
  });

  it("checkPackage returns unknown on network error", async () => {
    const adapter = createPyPIAdapter(failingFetch("ECONNRESET"));
    const { check } = await adapter.checkPackage("test-pkg", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.ok(check.errors.length > 0);
    assert.equal(check.errors[0].code, "COE.ADAPTER.PYPI_FAIL");
  });
});

describe("adapter determinism", () => {
  it("same input + same fixture = identical check IDs", async () => {
    const fixture = loadFixture("npm-available.json");
    const adapter = createNpmAdapter(mockFetch(fixture));
    const a = await adapter.checkPackage("my-tool", { now: NOW });
    const b = await adapter.checkPackage("my-tool", { now: NOW });

    assert.equal(a.check.id, b.check.id);
    assert.equal(a.evidence.id, b.evidence.id);
    assert.equal(a.evidence.sha256, b.evidence.sha256);
  });

  it("evidence includes repro steps", async () => {
    const fixture = loadFixture("github-available.json");
    const adapter = createGitHubAdapter(mockFetch(fixture));
    const { evidence } = await adapter.checkOrg("test", { now: NOW });

    assert.ok(evidence.repro.length > 0);
    assert.ok(evidence.repro[0].includes("curl"));
  });
});
