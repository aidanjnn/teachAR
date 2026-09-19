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

## Voice fixtures

`narration-transcript.v1.json` is a synthetic, hand-written transcript (four spans
over 12 s, English) shaped like a `TranscriptResult` with `source: "fixture"`. The
mock AI provider rescales it to the uploaded audio's duration. `label-segments.v1.json`
holds three ordered, non-overlapping segments; the third receives two spans so
label tests cover many-to-one assignment. Neither file is a real recording.
