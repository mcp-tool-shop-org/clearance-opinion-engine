# Versioning and Compatibility Policy

## Artifact Compatibility

### `run.json` (schema: `clearance.schema.json`)

- `schemaVersion` field: currently `"1.0.0"` (const).
- Backward-compatible changes (new optional fields) do NOT bump schemaVersion.
- Removing or renaming required fields WILL bump the major version.
- Adding a new enum value to an existing field is a minor bump.
- Consumers SHOULD ignore unknown fields.

### `summary.json` (schema: `summary.schema.json`)

- `schemaVersion` tracks the run schema version.
- `formatVersion` tracks the summary output format independently.
- Both start at `"1.0.0"`.
- The summary is a derived artifact; its format may evolve independently of the run schema.

### `runs.json` index entries (schema: `index-entry.schema.json`)

- Each entry includes `schemaVersion: "1.0.0"`.
- Old entries without `schemaVersion` are treated as `"1.0.0"`.

## Engine Version (`package.json`)

- **Major (1.x.x)**: Breaking changes to `run.json` schema, CLI flags, or output format.
- **Minor (0.x.0)**: New features, new fields, new commands, new adapters.
- **Patch (0.x.y)**: Bug fixes, test improvements, documentation.

## CLI Flag Compatibility

- Existing flags will not be removed without a major version bump.
- New flags default to behavior-preserving values (e.g., `--fuzzyQueryMode off`).
- Deprecated flags will be documented in CHANGELOG and produce warnings for one minor release before removal.

## Pre-1.0 Policy

While the engine is below v1.0.0, minor versions MAY include breaking changes. The changelog will always document them. Post-1.0, the standard semver contract applies.
