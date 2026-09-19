# Trail validation routes

Use [plan section 11](../../docs/plan.md#11-verification-strategy-and-acceptance-checklist)
for exact scenarios and acceptance criteria, and [AGENTS.md](../../AGENTS.md) for
invariants. This reference selects evidence; it does not claim tests exist.

## Select checks from the current repository

1. Inspect manifests, test config, scripts, and CI for actual commands. The
   application scaffold implements unit/API and built-app browser checks.
2. For documentation/skills, check local links, discovery symlinks, frontmatter,
   and patch whitespace. Read new untracked files; `git diff` alone omits them.
3. For application changes, run the smallest behavioral checks first. Once
   configured, `pnpm check` runs typecheck, unit tests, and build. PR preparation
   and signoff use this gate plus relevant fixture/desktop end-to-end checks.
   `pnpm test:e2e` runs Playwright against the built app; run `pnpm build` or
   `pnpm check` first and install Chromium with `pnpm exec playwright install chromium`.
4. Native changes need the implemented Unity EditMode/PlayMode and Android
   ARM64/IL2CPP build checks in addition to relevant web/server checks. Native
   wrappers `quest:test`, `quest:test:play` and `quest:build` run through the
   reusable guide workflow and feed the required `check` result. A licensed
   runner must be provisioned as described in [CI setup](../../docs/ci.md).
   Inspect the editor/project and available scripts first; report activation/licensing
   or absent gates. Test
   strict C# serialization/AOT in APK and compare shared golden fixtures. No
   Unity installation is necessary to check a documentation-only change.
5. Reuse results for unchanged inputs; after repairs, rerun affected checks and
   the final gate when required. Record the tested SHA or say results are for
   an uncommitted worktree. Do not attribute results to a different revision.

| Changed surface | Relevant plan scenarios | Additional evidence |
| --- | --- | --- |
| Schemas/import/export | T01, T11, T14, T15 | Valid/invalid fixtures, unknown versions, ranges/IDs/hash checks, consumer compatibility |
| Transforms/calibration | T01, T02, T11 | Two independent users, held-out mark, rotated mat and restarted XR |
| Guide reducer/matcher | T03–T12, T17 | Slow learner, wrong hand/pose, loss during dwell, pause/repeat/reset on headset |
| Capture/ghost rendering | T18, T01 | Fresh real capture/save/reload, named joints, visibility gaps, same reference space |
| Unity migration/runtime/UI | T31–T37 | Compatible editor/UPM set, preserved web checks, C# fixtures, one provider/rig, native joints/basis conversion, world-space UI, pause/teardown and APK build; simulator and Quest results separate |
| Native auth/camera/audio | T38–T40 | Bearer vs cookie/Origin, wrong role, frame identity/readback freshness, DSP clock mapping, duplex echo/interruption and lifecycle on APK |
| Audio/semantic labels | T12, T13, T23 | Complete playable WAV, timing alignment, concurrent mic/XR/hands/casting, actual provider result |
| GPT Live/scene inspection | T24–T30, T47 | Actual Quest speech and interruptions, fresh decoded frames, reviewed references, correct/wrong/obscured views, stale-audio suppression and clean close |
| Dedicated vision service | T45–T47 | Internal auth/input bounds, actual two-process integration, cancellation/deduplication/crash recovery; real fresh-image interpretation changes speech heard on Quest |
| Environment transfer/scene setup | T41–T44 | Different room/table with same parts/layout; independent calibration, current scene or explicit unavailable, changed lighting/background |
| Uploads/storage/jobs | T14, T15 | Fastify injection/failure cases; interrupted upload/job, atomic publish and restart |
| Spectator/network/preload | T10, T16, T17 | Stale indicator, full reconnect snapshot, actual backend disconnect after preload |
| Optional haptics | T19 | Mock first; physical cutoff/watchdog and disconnect only when hardware exists |

T01–T47 are plan identifiers, not guaranteed test filenames. Select actual tests
after finding their implementation. Also check pairing/Origin, path containment,
input limits, secret exposure, stale draft/job revisions, and read-only spectator
roles whenever the diff touches those boundaries.

## Claims and readiness

- **Automated:** deterministic tests/typecheck/build. Name commands and results.
- **Desktop fixture:** browser behavior with synthetic or recorded inputs;
  identify which. It cannot prove Quest tracking or physical transfer.
- **Live provider:** actual service/model, input source, response/failure,
  latency, and provenance. Mock success is not provider success.
- **Headset/human:** actual device/OS, APK/commit, editor/SDK versions, endpoint, participant
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
The quality target also requires two fresh task families without code changes,
GPT Live conversation on the headset, and bounded scene-grounded spoken feedback.
The separate vision service must receive real current image inputs and return
evidence that changes the answer heard in the headset. Mock providers, cached
images, audio/text-only exchanges and captions alone cannot prove that target.
