# Synthetic fixtures

`synthetic-reach.v1.json` is generated data, not a human recording. It describes a
two-second right-hand reach over a 50 × 35 cm mat: 61 timestamped frames, all 25
named joints, no audio/head data, and the left hand always explicitly missing.
Right-hand samples from 900 through 1133.333 ms are missing; the next valid
observation is at 1166.667 ms. The diagnostic skeleton is illustrative, not an
anatomically validated hand model.

Run `pnpm validate:fixtures`. The same file is parsed by contract tests, motion
round-trip tests, and the browser. The motion tests apply a translated and rotated
reference frame to every valid pose and invert it; no second serialized coordinate
system is introduced. Browser playback and path rendering retain the missing gap.

Real recordings, narration, traces, and camera frames are excluded from Git by
default. Add a real fixture only with explicit consent, inspection, and provenance.

`vision-health.v1.json` is synthetic service-protocol evidence, not scene data.
It explicitly reports that image interpretation is unavailable and is exercised
by the authenticated vision service test. Recording v1 fixtures are unchanged.

## TRAIL-03 contract corpus

`contracts/` contains synthetic recording/tutorial/guide/native/scene/inspection
and upload examples, plus `corpus.json` valid/invalid mutations consumed by both
Zod and the actual C# parser. `joint-map.json` freezes named OpenXR mapping;
`transforms.json` has independently specified translated/rotated expected poses.
No image bytes, real recording or headset observation is included. Camera source
labels in synthetic manifest examples describe a hypothetical protocol case.

Run `pnpm exec vitest run packages/contracts/test` and, with a .NET 8 SDK,
`DOTNET=/path/to/dotnet pnpm --filter @trail/contracts test:native`. Regenerate
synthetic examples with `pnpm exec tsx packages/contracts/tools/generate-fixtures.ts`.
See [contract versions and native validation limits](../docs/contracts.md).

Authoring envelopes in `contracts/` cover tutorial jobs/finalization, reviewed
references, image-upload metadata, connected/disconnected spectators, label
batches and native exact-byte chunks. Their golden valid/invalid cases run through
both Zod and generated C# parsers. `reference-image-upload.json` deliberately
contains synthetic placeholder bytes for wire-shape validation, not a decodable
image; the server's decode gate is tested separately. `recording-byte-chunk.json`
encodes the synthetic recording only. Compatibility notes are in
[authoring transport compatibility](../docs/contracts.md#authoring-transport-compatibility-pr-11).
