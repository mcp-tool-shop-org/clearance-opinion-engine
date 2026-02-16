import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createCratesIoAdapter } from "../../src/adapters/cratesio.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures", "adapters");

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

function mockFetch(fixture) {
  return async () => ({
    status: fixture.status,
    text: async () => fixture.body,
  });
}

function failingFetch(message = "Network error") {
  return async () => {
    throw new Error(message);
  };
}

const NOW = "2026-02-15T12:00:00.000Z";

describe("crates.io adapter", () => {
  it("checkCrate returns available for 404", async () => {
    const fixture = loadFixture("cratesio-available.json");
    const adapter = createCratesIoAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkCrate("my-new-crate", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.namespace, "cratesio");
    assert.match(check.id, /^chk\.cratesio\./);
    assert.equal(evidence.type, "http_response");
    assert.equal(evidence.source.system, "cratesio");
  });

  it("checkCrate returns taken for 200", async () => {
    const fixture = loadFixture("cratesio-taken.json");
    const adapter = createCratesIoAdapter(mockFetch(fixture));
    const { check } = await adapter.checkCrate("serde", { now: NOW });

    assert.equal(check.status, "taken");
    assert.equal(check.authority, "authoritative");
  });

  it("extracts crate metadata when taken", async () => {
    const fixture = loadFixture("cratesio-taken.json");
    const adapter = createCratesIoAdapter(mockFetch(fixture));
    const { check } = await adapter.checkCrate("serde", { now: NOW });

    assert.equal(check.details.crateName, "serde");
    assert.equal(check.details.crateCreatedAt, "2015-01-13T00:07:07.000Z");
    assert.equal(check.details.crateDownloads, 312000000);
  });

  it("checkCrate returns unknown on network error", async () => {
    const adapter = createCratesIoAdapter(failingFetch("Connection refused"));
    const { check } = await adapter.checkCrate("any-crate", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.equal(check.errors[0].code, "COE.ADAPTER.CRATESIO_FAIL");
    assert.match(check.errors[0].message, /Connection refused/);
  });

  it("namespace is cratesio", async () => {
    const fixture = loadFixture("cratesio-available.json");
    const adapter = createCratesIoAdapter(mockFetch(fixture));
    const { check } = await adapter.checkCrate("test", { now: NOW });

    assert.equal(check.namespace, "cratesio");
  });

  it("evidence has correct shape", async () => {
    const fixture = loadFixture("cratesio-available.json");
    const adapter = createCratesIoAdapter(mockFetch(fixture));
    const { evidence } = await adapter.checkCrate("test", { now: NOW });

    assert.equal(evidence.type, "http_response");
    assert.equal(evidence.source.system, "cratesio");
    assert.equal(evidence.source.method, "GET");
    assert.match(evidence.source.url, /crates\.io\/api\/v1\/crates\//);
    assert.ok(evidence.sha256);
    assert.ok(evidence.bytes > 0);
    assert.ok(Array.isArray(evidence.repro));
  });

  it("IDs are deterministic", async () => {
    const fixture = loadFixture("cratesio-available.json");
    const adapter = createCratesIoAdapter(mockFetch(fixture));
    const r1 = await adapter.checkCrate("my-crate", { now: NOW });
    const r2 = await adapter.checkCrate("my-crate", { now: NOW });

    assert.equal(r1.check.id, r2.check.id);
    assert.equal(r1.evidence.id, r2.evidence.id);
  });

  it("details includes source field", async () => {
    const fixture = loadFixture("cratesio-available.json");
    const adapter = createCratesIoAdapter(mockFetch(fixture));
    const { check } = await adapter.checkCrate("test", { now: NOW });

    assert.equal(check.details.source, "cratesio");
  });
});
