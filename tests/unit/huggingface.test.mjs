import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHuggingFaceAdapter } from "../../src/adapters/huggingface.mjs";

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

describe("Hugging Face adapter", () => {
  // ── Model checks ──

  it("checkModel returns available for 404", async () => {
    const fixture = loadFixture("hf-model-available.json");
    const adapter = createHuggingFaceAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkModel("myuser", "new-model", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.namespace, "huggingface_model");
    assert.match(check.id, /^chk\.huggingface-model\./);
    assert.equal(evidence.type, "http_response");
    assert.equal(evidence.source.system, "huggingface");
  });

  it("checkModel returns taken for 200", async () => {
    const fixture = loadFixture("hf-model-taken.json");
    const adapter = createHuggingFaceAdapter(mockFetch(fixture));
    const { check } = await adapter.checkModel("openai", "whisper-large-v3", { now: NOW });

    assert.equal(check.status, "taken");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.details.resourceId, "openai/whisper-large-v3");
    assert.equal(check.details.downloads, 5200000);
    assert.equal(check.details.likes, 3400);
  });

  it("checkModel returns unknown on network error", async () => {
    const adapter = createHuggingFaceAdapter(failingFetch("Timeout"));
    const { check } = await adapter.checkModel("myuser", "model", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.authority, "indicative");
    assert.equal(check.errors[0].code, "COE.ADAPTER.HF_FAIL");
  });

  it("checkModel returns skipped when no owner", async () => {
    const adapter = createHuggingFaceAdapter(mockFetch({ status: 200, body: "{}" }));
    const { check, evidence } = await adapter.checkModel(null, "model", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.errors[0].code, "COE.HF.OWNER_REQUIRED");
    assert.equal(evidence.type, "skipped");
  });

  // ── Space checks ──

  it("checkSpace returns available for 404", async () => {
    const fixture = loadFixture("hf-space-available.json");
    const adapter = createHuggingFaceAdapter(mockFetch(fixture));
    const { check, evidence } = await adapter.checkSpace("myuser", "new-space", { now: NOW });

    assert.equal(check.status, "available");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.namespace, "huggingface_space");
    assert.match(check.id, /^chk\.huggingface-space\./);
    assert.equal(evidence.source.system, "huggingface");
  });

  it("checkSpace returns taken for 200", async () => {
    const fixture = loadFixture("hf-space-taken.json");
    const adapter = createHuggingFaceAdapter(mockFetch(fixture));
    const { check } = await adapter.checkSpace("stabilityai", "stable-diffusion", { now: NOW });

    assert.equal(check.status, "taken");
    assert.equal(check.authority, "authoritative");
    assert.equal(check.details.resourceId, "stabilityai/stable-diffusion");
  });

  it("checkSpace returns unknown on network error", async () => {
    const adapter = createHuggingFaceAdapter(failingFetch("ECONNREFUSED"));
    const { check } = await adapter.checkSpace("myuser", "space", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.errors[0].code, "COE.ADAPTER.HF_FAIL");
  });

  it("checkSpace returns skipped when no owner", async () => {
    const adapter = createHuggingFaceAdapter(mockFetch({ status: 200, body: "{}" }));
    const { check } = await adapter.checkSpace(null, "space", { now: NOW });

    assert.equal(check.status, "unknown");
    assert.equal(check.errors[0].code, "COE.HF.OWNER_REQUIRED");
  });

  // ── General ──

  it("model query.value includes owner/name", async () => {
    const fixture = loadFixture("hf-model-available.json");
    const adapter = createHuggingFaceAdapter(mockFetch(fixture));
    const { check } = await adapter.checkModel("myuser", "my-tool", { now: NOW });

    assert.equal(check.query.value, "myuser/my-tool");
  });

  it("IDs are deterministic", async () => {
    const fixture = loadFixture("hf-model-available.json");
    const adapter = createHuggingFaceAdapter(mockFetch(fixture));
    const r1 = await adapter.checkModel("user", "model", { now: NOW });
    const r2 = await adapter.checkModel("user", "model", { now: NOW });

    assert.equal(r1.check.id, r2.check.id);
    assert.equal(r1.evidence.id, r2.evidence.id);
  });
});
