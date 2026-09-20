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

`contracts/` contains synthetic shared API recording/tutorial/guide/scene/inspection
fixtures and the retained legacy capture metadata corpus. `corpus.json` lists
valid/invalid cases consumed by Zod; `transforms.json` contains independently
specified expected values. Legacy joint mapping tests protect imports only.

Run `pnpm validate:fixtures` and the contract tests through `pnpm check`.
Regenerate deliberately with `pnpm exec tsx packages/contracts/tools/generate-fixtures.ts`.
See [data contracts and compatibility](../docs/contracts.md).

Browser `trail.tutorial.prototype.v3` is tested separately in
[`apps/webxr/tests`](../apps/webxr/tests). Do not submit browser JSON as a shared
API recording. All automated fixtures use synthetic media/observations and do
not establish headset, provider or physical-task evidence.
