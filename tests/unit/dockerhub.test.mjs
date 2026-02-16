import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDockerHubAdapter } from "../../src/adapters/dockerhub.mjs";

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

describe("Docker Hub adapter", () => {
  it("checkRepo returns available for 404", async () => {
    const fixture = loadFixture("dockerhub-available.json");
    const adapter = createDockerHubAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkRepo("myorg", "new-image", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.namespace, "dockerhub");
    assert.match(check.id, /^chk\.dockerhub\./);
    assert.equal(evidence.type, "http_response");
    assert.equal(evidence.source.system, "dockerhub");
  });

  it("checkRepo returns taken for 200", async () => {
    const fixture = loadFixture("dockerhub-taken.json");
    const adapter = createDockerHubAdapter(mockFetch(fixture));
    const { check } = await adapter.checkRepo("library", "nginx", { now: NOW });

    assert.equal(check.status, "taken");
    assert.equal(check.authority, "authoritative");
  });

  it("extracts repo metadata when taken", async () => {
    const fixture = loadFixture("dockerhub-taken.json");
    const adapter = createDockerHubAdapter(mockFetch(fixture));
    const { check } = await adapter.checkRepo("library", "nginx", { now: NOW });

    assert.equal(check.details.repoName, "nginx");
    assert.equal(check.details.starCount, 18500);
    assert.equal(check.details.pullCount, 4200000000);
  });

  it("returns skipped check when no namespace provided", async () => {
    const adapter = createDockerHubAdapter(mockFetch({ status: 200, body: "{}" }));
    const { check, evidence } = await adapter.checkRepo(null, "my-image", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.equal(check.errors[0].code, "COE.DOCKER.NAMESPACE_REQUIRED");
    assert.equal(evidence.type, "skipped");
  });

  it("checkRepo returns unknown on network error", async () => {
    const adapter = createDockerHubAdapter(failingFetch("DNS lookup failed"));
    const { check } = await adapter.checkRepo("myorg", "my-image", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.equal(check.errors[0].code, "COE.ADAPTER.DOCKERHUB_FAIL");
    assert.match(check.errors[0].message, /DNS lookup failed/);
  });

  it("namespace is dockerhub", async () => {
    const fixture = loadFixture("dockerhub-available.json");
    const adapter = createDockerHubAdapter(mockFetch(fixture));
    const { check } = await adapter.checkRepo("myorg", "test", { now: NOW });

    assert.equal(check.namespace, "dockerhub");
  });

  it("query.value includes namespace/name", async () => {
    const fixture = loadFixture("dockerhub-available.json");
    const adapter = createDockerHubAdapter(mockFetch(fixture));
    const { check } = await adapter.checkRepo("myorg", "my-tool", { now: NOW });

    assert.equal(check.query.value, "myorg/my-tool");
  });

  it("IDs are deterministic", async () => {
    const fixture = loadFixture("dockerhub-available.json");
    const adapter = createDockerHubAdapter(mockFetch(fixture));
    const r1 = await adapter.checkRepo("myorg", "my-tool", { now: NOW });
    const r2 = await adapter.checkRepo("myorg", "my-tool", { now: NOW });

    assert.equal(r1.check.id, r2.check.id);
    assert.equal(r1.evidence.id, r2.evidence.id);
  });
});
