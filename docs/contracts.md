# Data contracts and compatibility

Trail has two explicit data boundaries. The primary WebXR tutor uses its existing
browser format. The retained TypeScript backend uses strict shared API schemas.
This foundation does not convert between them or change either wire format.

## Browser tutorials

`apps/webxr/public/tutorial-core.mjs` owns `trail.tutorial.prototype.v3`, validation,
legacy browser imports, step preparation and reviewed readiness. The recording
contains timed hand frames, instructions, optional narration/references, a persistent
save position and review state. Runtime placement is session-local and is not
restored as a valid world transform after loading.

`apps/webxr/public/tutorial-store.mjs` owns IndexedDB library/drafts. Database names
and import migrations remain unchanged. `/tutorial` is still the product URL;
changing checkout paths does not change storage, but changing browser origin does.

Any backend adapter must validate approved steps and map real source/provenance,
identities, timestamps and revisions explicitly. Never fabricate API hashes,
calibration marks or camera metadata from a browser file. Browser review does not
establish physical task completion.

## Shared API versions

`packages/contracts/src/index.ts` exports Zod schemas, strict JSON parsing and
semantic binding checks used by the TypeScript services, diagnostics and fixtures.

| Surface | Version / definition |
| --- | --- |
| Portable recording | `schemaVersion: 1`, `recording.ts` |
| API tutorial | `schemaVersion: 1`, `tutorial.ts` |
| Guide events | `schemaVersion: 1`, `guide.ts` |
| Scene references and inspection | `scene.ts`, `vision-transport.ts` |
| Upload/authoring envelopes | `storage.ts`, `authoring.ts` |
| Legacy capture provenance and calibration | `native.ts`, retained solely for existing imports |

The legacy module's `NativeCaptureSidecar`, `CalibrationV2`, clock-source literals
and named `OPENXR_JOINT_MAP` are compatibility data, not a WebXR adapter or a runtime
dependency. The C# implementation, generated codecs and native test harnesses are
retired. Do not broaden legacy formats to claim new browser capabilities.

Recording v1 preserves the canonical 25 joint names/order, workspace-relative
meters, right-handed axes (+X right, +Y up, +Z toward learner), normalized
`[x,y,z,w]` quaternions, monotonic milliseconds, actual timestamps and explicit
valid/missing samples. Zero is a coordinate. Frame ranges are half-open.
`parseContractJson` rejects malformed, duplicate-key, non-finite and over-budget
JSON before schema validation. Semantic bindings reject mismatched recording/hash,
workspace, tutorial/revision, step and reference identities.

Exact-byte upload/download hashes apply to the original bytes. Do not reserialize
a document and assume its hash is identical. Ready tutorials remain immutable;
draft operations require revisions and late results must be rejected.

## Fixtures and schema export

`fixtures/contracts/corpus.json` names valid and invalid cases consumed by the
Zod corpus tests. `transforms.json` supplies independently specified expected
values; the legacy joint map remains a compatibility regression. Fixtures are
synthetic, not headset or provider evidence.

```sh
pnpm check
pnpm validate:fixtures
pnpm exec tsx packages/contracts/tools/generate-fixtures.ts
pnpm exec tsx packages/contracts/tools/export-schemas.ts /tmp/trail-schemas.json
```

Regenerate fixtures only when intentionally changing their source. The generated
fixture test ensures regeneration preserves every checked-in regression case.
JSON Schema export is build-time documentation; runtime Zod refinements still
apply. Run `pnpm test:webxr` for browser-format and local-storage regression checks.

New serialized changes need consumer updates, fixtures and migration notes.
Neither strict parsing nor palm matching proves tracking quality or assembly.
