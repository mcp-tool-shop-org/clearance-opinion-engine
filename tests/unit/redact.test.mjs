import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactUrl, redactEvidence, redactAllEvidence, MAX_EVIDENCE_BYTES, scanForSecrets } from "../../src/lib/redact.mjs";

describe("redactUrl", () => {
  it("strips token query param", () => {
    const url = "https://example.com/api?token=secret123&page=1";
    const result = redactUrl(url);
    assert.ok(!result.includes("secret123"), "secret value must be removed");
    assert.ok(result.includes("REDACTED"), "REDACTED marker must be present");
    assert.ok(result.includes("page=1"), "non-sensitive params must be preserved");
  });

  it("strips access_token query param", () => {
    const url = "https://example.com/api?access_token=abc456";
    const result = redactUrl(url);
    assert.ok(!result.includes("abc456"), "secret value must be removed");
    assert.ok(result.includes("REDACTED"), "REDACTED marker must be present");
  });

  it("strips api_key query param", () => {
    const url = "https://example.com/api?api_key=mykey789";
    const result = redactUrl(url);
    assert.ok(!result.includes("mykey789"), "secret value must be removed");
    assert.ok(result.includes("REDACTED"), "REDACTED marker must be present");
  });

  it("preserves non-sensitive query params", () => {
    const url = "https://example.com/api?page=2&limit=10";
    const result = redactUrl(url);
    assert.equal(result, url);
  });

  it("returns malformed URLs unchanged", () => {
    const url = "not-a-valid-url";
    const result = redactUrl(url);
    assert.equal(result, url);
  });

  it("handles null/undefined gracefully", () => {
    assert.equal(redactUrl(null), null);
    assert.equal(redactUrl(undefined), undefined);
  });
});

describe("redactEvidence", () => {
  it("strips Authorization Bearer from repro", () => {
    const ev = {
      repro: ['curl -H "Authorization: Bearer ghp_abc123" https://api.github.com'],
    };
    const result = redactEvidence(ev);
    assert.ok(result.repro[0].includes("[REDACTED]"));
    assert.ok(!result.repro[0].includes("ghp_abc123"));
  });

  it("strips Authorization token from repro", () => {
    const ev = {
      repro: ['curl -H "Authorization: token ghp_xyz789" https://api.github.com'],
    };
    const result = redactEvidence(ev);
    assert.ok(result.repro[0].includes("[REDACTED]"));
    assert.ok(!result.repro[0].includes("ghp_xyz789"));
  });

  it("truncates oversized notes", () => {
    const bigNotes = "x".repeat(MAX_EVIDENCE_BYTES + 1000);
    const ev = { notes: bigNotes };
    const result = redactEvidence(ev);
    assert.ok(result.notes.length <= MAX_EVIDENCE_BYTES + 20); // +20 for "[TRUNCATED]" suffix
    assert.ok(result.notes.endsWith("[TRUNCATED]"));
  });

  it("handles null input", () => {
    const result = redactEvidence(null);
    assert.equal(result, null);
  });
});

describe("redactAllEvidence", () => {
  it("processes array of evidence objects", () => {
    const arr = [
      {
        source: { url: "https://example.com/api?token=secret1" },
        repro: ['curl -H "Authorization: Bearer ghp_111"'],
      },
      {
        source: { url: "https://example.com/api?api_key=secret2" },
        repro: [],
      },
    ];

    const result = redactAllEvidence(arr);
    assert.equal(result.length, 2);
    assert.ok(!result[0].source.url.includes("secret1"));
    assert.ok(!result[1].source.url.includes("secret2"));
  });
});

describe("scanForSecrets", () => {
  it("detects GitHub PAT", () => {
    const input = "token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678a";
    const matches = scanForSecrets(input);
    assert.ok(matches.includes("GitHub personal access token"));
  });

  it("detects npm token", () => {
    const input = "auth: npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678a";
    const matches = scanForSecrets(input);
    assert.ok(matches.includes("npm token"));
  });

  it("detects Bearer token", () => {
    const input = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234';
    const matches = scanForSecrets(input);
    assert.ok(matches.includes("Bearer token"));
  });

  it("returns empty for clean content", () => {
    const input = "This is a normal report about package availability. No secrets here.";
    const matches = scanForSecrets(input);
    assert.equal(matches.length, 0);
  });
});
