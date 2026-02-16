import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "..", "schema", "clearance.schema.json");

describe("clearance.schema.json", () => {
  let schema;

  it("loads as valid JSON", () => {
    const raw = readFileSync(schemaPath, "utf8");
    schema = JSON.parse(raw);
    assert.ok(schema);
    assert.ok(schema.$schema);
    assert.ok(schema.$defs);
  });

  it("has $defs.topFactor with required properties", () => {
    const raw = readFileSync(schemaPath, "utf8");
    schema = JSON.parse(raw);
    const topFactor = schema.$defs.topFactor;
    assert.ok(topFactor, "topFactor must exist in $defs");
    assert.deepEqual(topFactor.required, ["factor", "statement", "weight", "category"]);
    assert.ok(topFactor.properties.factor);
    assert.ok(topFactor.properties.statement);
    assert.ok(topFactor.properties.weight);
    assert.ok(topFactor.properties.category);
  });

  it("has $defs.saferAlternative with required properties", () => {
    const raw = readFileSync(schemaPath, "utf8");
    schema = JSON.parse(raw);
    const saferAlt = schema.$defs.saferAlternative;
    assert.ok(saferAlt, "saferAlternative must exist in $defs");
    assert.deepEqual(saferAlt.required, ["name", "strategy"]);
    assert.ok(saferAlt.properties.name);
    assert.ok(saferAlt.properties.strategy);
    assert.ok(saferAlt.properties.availability);
  });

  it("has $defs.dupontFactor with required properties", () => {
    const raw = readFileSync(schemaPath, "utf8");
    schema = JSON.parse(raw);
    const dupontFactor = schema.$defs.dupontFactor;
    assert.ok(dupontFactor, "dupontFactor must exist in $defs");
    assert.deepEqual(dupontFactor.required, ["score", "rationale"]);
    assert.ok(dupontFactor.properties.score);
    assert.ok(dupontFactor.properties.rationale);
  });

  it("opinion properties include topFactors, riskNarrative, saferAlternatives and scoreBreakdown has dupontFactors", () => {
    const raw = readFileSync(schemaPath, "utf8");
    schema = JSON.parse(raw);
    const opinion = schema.$defs.opinion;
    assert.ok(opinion.properties.topFactors, "opinion must have topFactors");
    assert.ok(opinion.properties.riskNarrative, "opinion must have riskNarrative");
    assert.ok(opinion.properties.saferAlternatives, "opinion must have saferAlternatives");

    const scoreBreakdown = schema.$defs.scoreBreakdown;
    assert.ok(scoreBreakdown.properties.dupontFactors, "scoreBreakdown must have dupontFactors");
  });

  it("namespaceCheck.namespace enum includes cratesio, dockerhub, huggingface_model, huggingface_space", () => {
    const raw = readFileSync(schemaPath, "utf8");
    schema = JSON.parse(raw);
    const nsEnum = schema.$defs.namespaceCheck.properties.namespace.enum;
    assert.ok(nsEnum.includes("cratesio"), "namespace enum must include cratesio");
    assert.ok(nsEnum.includes("dockerhub"), "namespace enum must include dockerhub");
    assert.ok(nsEnum.includes("huggingface_model"), "namespace enum must include huggingface_model");
    assert.ok(nsEnum.includes("huggingface_space"), "namespace enum must include huggingface_space");
  });

  it("finding.kind enum includes variant_taken", () => {
    const raw = readFileSync(schemaPath, "utf8");
    schema = JSON.parse(raw);
    const kindEnum = schema.$defs.finding.properties.kind.enum;
    assert.ok(kindEnum.includes("variant_taken"), "finding.kind enum must include variant_taken");
  });
});
