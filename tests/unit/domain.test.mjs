import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDomainAdapter } from "../../src/adapters/domain.mjs";

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

describe("Domain adapter", () => {
  it("checkDomain returns available for 404", async () => {
    const fixture = loadFixture("domain-available.json");
    const adapter = createDomainAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkDomain("my-cool-tool", ".com", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.claimability, "claimable_now");
    assert.equal(check.namespace, "domain");
    assert.equal(check.query.value, "my-cool-tool.com");
    assert.equal(evidence.type, "http_response");
  });

  it("checkDomain returns taken for 200", async () => {
    const fixture = loadFixture("domain-taken.json");
    const adapter = createDomainAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkDomain("example", ".com", { now: NOW });

    assert.equal(check.status, "taken");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.claimability, "not_claimable");
    assert.ok(evidence.sha256);
    assert.ok(evidence.bytes > 0);
  });

  it("checkDomain returns unknown on network error", async () => {
    const adapter = createDomainAdapter(failingFetch("ECONNREFUSED"));
    const { check, evidence } = await adapter.checkDomain("error-test", ".com", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.equal(check.claimability, "unknown");
    assert.ok(check.errors.some((e) => e.code === "COE.ADAPTER.DOMAIN_FAIL"));
    assert.ok(evidence.notes.includes("ECONNREFUSED"));
  });

  it("checkDomain returns unknown with rate-limit error on 429", async () => {
    const fixture = loadFixture("domain-rate-limited.json");
    const adapter = createDomainAdapter(mockFetch(fixture));
    const { check } = await adapter.checkDomain("rate-test", ".dev", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.ok(check.errors.some((e) => e.code === "COE.ADAPTER.DOMAIN_RATE_LIMITED"));
  });

  it("uses namespace 'domain' in check object", async () => {
    const fixture = loadFixture("domain-available.json");
    const adapter = createDomainAdapter(mockFetch(fixture));
    const { check } = await adapter.checkDomain("ns-test", ".com", { now: NOW });

    assert.equal(check.namespace, "domain");
  });

  it("evidence includes rdap source system", async () => {
    const fixture = loadFixture("domain-available.json");
    const adapter = createDomainAdapter(mockFetch(fixture));
    const { evidence } = await adapter.checkDomain("ev-test", ".dev", { now: NOW });

    assert.equal(evidence.source.system, "rdap");
    assert.ok(evidence.source.url.includes("rdap.org"));
    assert.equal(evidence.source.method, "GET");
  });

  it("check ID follows chk.domain.{fqdn} pattern", async () => {
    const fixture = loadFixture("domain-available.json");
    const adapter = createDomainAdapter(mockFetch(fixture));
    const { check } = await adapter.checkDomain("id-test", ".com", { now: NOW });

    assert.ok(check.id.startsWith("chk.domain."));
    assert.ok(check.id.includes("id-test"));
  });

  it("same input + same fixture = identical output (determinism)", async () => {
    const fixture = loadFixture("domain-available.json");
    const adapter1 = createDomainAdapter(mockFetch(fixture));
    const adapter2 = createDomainAdapter(mockFetch(fixture));

    const r1 = await adapter1.checkDomain("det-test", ".com", { now: NOW });
    const r2 = await adapter2.checkDomain("det-test", ".com", { now: NOW });

    assert.deepEqual(r1, r2);
  });

  it("exposes configured TLDs", () => {
    const adapter = createDomainAdapter(async () => {}, { tlds: [".com", ".io"] });
    assert.deepEqual(adapter.tlds, [".com", ".io"]);
  });

  it("defaults to .com and .dev TLDs", () => {
    const adapter = createDomainAdapter(async () => {});
    assert.deepEqual(adapter.tlds, [".com", ".dev"]);
  });
});
