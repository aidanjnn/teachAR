# Trail validation routes

Use [plan section 11](../../plan.md#11-verification-strategy-and-acceptance-checklist)
for exact scenarios and acceptance criteria, and [AGENTS.md](../../AGENTS.md) for
invariants. This reference selects evidence; it does not claim tests exist.

## Select checks from the current repository

1. Inspect manifests, test config, scripts, and CI for actual commands. The
   plan-only scaffold has no package manifest or application tests yet.
2. For documentation/skills, check local links, discovery symlinks, frontmatter,
   and patch whitespace. Read new untracked files; `git diff` alone omits them.
3. For application changes, run the smallest behavioral checks first. Once
   configured, `pnpm check` runs typecheck, unit tests, and build. PR preparation
   and signoff use this gate plus relevant fixture/desktop end-to-end checks.
   `pnpm test:e2e` is the planned Playwright entry point, not a current guarantee.
4. Reuse results for unchanged inputs; after repairs, rerun affected checks and
   the final gate when required. Record the tested SHA or say results are for
   an uncommitted worktree. Do not attribute results to a different revision.

| Changed surface | Relevant plan scenarios | Additional evidence |
| --- | --- | --- |
| Schemas/import/export | T01, T11, T14, T15 | Valid/invalid fixtures, unknown versions, ranges/IDs/hash checks, consumer compatibility |
| Transforms/calibration | T01, T02, T11 | Two independent users, held-out mark, rotated mat and restarted XR |
| Guide reducer/matcher | T03–T12, T17 | Slow learner, wrong hand/pose, loss during dwell, pause/repeat/reset on headset |
| Capture/ghost rendering | T18, T01 | Fresh real capture/save/reload, named joints, visibility gaps, same reference space |
| Audio/semantic labels/coach | T12, T13 | Playable whole blob, timing alignment, concurrent mic/XR/hands/casting, actual provider result |
| Uploads/storage/jobs | T14, T15 | Fastify injection/failure cases; interrupted upload/job, atomic publish and restart |
| Spectator/network/preload | T10, T16, T17 | Stale indicator, full reconnect snapshot, actual backend disconnect after preload |
| Optional haptics | T19 | Mock first; physical cutoff/watchdog and disconnect only when hardware exists |

T01–T19 are plan identifiers, not guaranteed test filenames. Select actual tests
after finding their implementation. Also check pairing/Origin, path containment,
input limits, secret exposure, stale draft/job revisions, and read-only spectator
roles whenever the diff touches those boundaries.

## Claims and readiness

- **Automated:** deterministic tests/typecheck/build. Name commands and results.
- **Desktop fixture:** browser behavior with synthetic or recorded inputs;
  identify which. It cannot prove Quest tracking or physical transfer.
- **Live provider:** actual service/model, input source, response/failure,
  latency, and provenance. Mock success is not provider success.
- **Headset/human:** actual device, OS/Browser, tested commit/origin, participant
  role, observed result, measurements, and unresolved issues. Use the hardware
  acceptance checklist in the plan; never mark it complete from unit tests.

Use `not tested`, `blocked`, `failed`, or `passed` accurately. No headset access
does not prevent a scoped code PR; disclose the missing evidence and avoid a
physical-MVP signoff. Missing a live observation is a validation gap, not proof
of a code bug. An empty test run or missing required check is not a pass.

For full-demo readiness, require a newly recorded 3–5-step task, independent
learner calibration, local automatic progression, interruption/recovery drills,
three consecutive runs, and a non-builder without step-by-step coaching.
AI-generated reviewed labels are required for the target semantic MVP; manual
labels are a disclosed reduced tier. A cold offline start needs separate proof.
