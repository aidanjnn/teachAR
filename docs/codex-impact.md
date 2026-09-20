# How Codex improved Trail

Trail used Codex across planning, implementation, debugging, testing and
integration. The strongest evidence is a behavior that changed, its source
revision and a repeatable check. This page selects three examples from the
[development log](codex-log.md) for the [OpenAI track demo](openai-track.md).

Prepared September 20, 2026. Current source references below pin main at
`dfaf572a0c4bb1eb0ce15a14605649306fa550fe`; historical results remain attached to
their original commits. The team reports using Codex for implementation. Git
authorship alone does not measure AI contribution, and the examples preserve
the team's role in setting requirements, reviewing and testing.

## 1. Stationary hands could finish a movement

**Problem.** The learner could hold both palms at the midpoint of a short
recorded movement. Overlapping target regions let the old follower advance
without observing the demonstrated movement. That undermined Trail's central
promise: moving with the guide at your own pace.

**Codex work.** The recorded review reproduced the defect with a 41-frame,
1.6-second, 18 cm synthetic recording. In response to the user's P1 review,
Codex added the failing case and repaired the follower. Each moving required
hand must supply net movement in the recorded direction, in addition to proximity
and dwell. Missing tracking, pauses and invalid/stalled timestamps reset the
evidence. Small oscillations cannot accumulate enough path length to pass.

**Human contribution.** The user requested the review repair; product constraints
required forgiving movement guidance without pretending to verify assembly.
Hardware tuning remains a human/device task. The current 60% displacement
threshold is a prototype setting, not an experimentally validated accuracy rate.

**Result.** A stationary learner no longer earns movement progress from proximity
alone in the regression, while valid fresh motion still completes. The repair
was carried into both ordered guidance and relaxed practice.

Evidence: [original repair `957b894`](https://github.com/aidanjnn/trail/commit/957b89447bad972e50299f162cb318146f1bde6c),
[current follower tests](https://github.com/aidanjnn/trail/blob/dfaf572a0c4bb1eb0ce15a14605649306fa550fe/apps/webxr/tests/tutorial-follow.test.mjs),
[current follower](https://github.com/aidanjnn/trail/blob/dfaf572a0c4bb1eb0ce15a14605649306fa550fe/apps/webxr/public/tutorial-follow.mjs),
[original work record](https://github.com/aidanjnn/trail/blob/dfaf572a0c4bb1eb0ce15a14605649306fa550fe/docs/codex-log.md#2026-09-20--require-observed-movement-for-pr-17-palm-gates).

### Fresh verification for this documentation

Ran September 20, 2026 with Node 22.23.1. Exported exact Git source and existing
test files into temporary directories; no runtime source or tests were edited.

| Source and test input | Observed result |
| --- | --- |
| Pre-repair source `32d3020`, with the stationary-midpoint test from `957b894` | Expected failure: follower index became 2 where the regression requires 1. One test failed; a direct replay confirmed `done: true` with stationary hands. |
| Repair source and follower tests at `957b894` | All 12 tests passed. |
| Main snapshot `dfaf572`, follower + practice-regression + coach tests | All 32 tests passed; none skipped. |

The same direct stationary replay returned `done: false` at both the repair and
main snapshots. No real hand recording or API call was needed for this comparison.

To rerun the final set from a checkout of the pinned main revision:

```sh
node --test apps/webxr/tests/tutorial-follow.test.mjs \
  apps/webxr/tests/tutorial-practice-regressions.test.mjs \
  apps/webxr/tests/tutorial-coach.test.mjs
```

For the before/after comparison, export the old source to a separate directory,
copy only the repair commit's `tutorial-follow.test.mjs` into its matching
`tests/` directory, and select `--test-name-pattern='stationary midpoint'`.
Do not replace files in a working demo checkout. The failure is intentional
evidence about the old implementation, not a failing test in the repaired build.

These are synthetic software checks. They do not establish real hand-tracking
accuracy, physical assembly success or learning effectiveness.

**Suggested 25-second narration:**

> “A forgiving target accidentally let stationary hands pass a movement. Codex
> helped us reproduce it with an 18-centimeter synthetic recording, write a
> failing test, and require fresh movement before advancing. We reran the old
> and repaired versions. The old one fails; the repair passes. That changed the
> reliability of the interaction people will actually use.”

## 2. A stopped voice coach could start later

**Problem.** Guide publication is asynchronous. If the user pressed Stop while
startup waited for publication, the old continuation could still create and
connect the coach after the user's stop request.

**Codex work and result.** The recorded review reproduced the race. The repair
uses a startup generation checked after asynchronous boundaries; Stop or a newer
startup invalidates the old continuation. Tests cover stopping during pending
publication and a newer start superseding the old one. This makes Stop dependable
even when network work is delayed.

Evidence: [repair `940a99e`](https://github.com/aidanjnn/trail/commit/940a99ee936ad6280c596826d02f91dde881ba52),
[coach regressions](https://github.com/aidanjnn/trail/blob/dfaf572a0c4bb1eb0ce15a14605649306fa550fe/apps/webxr/tests/tutorial-coach.test.mjs),
and [integration and review-fix record](https://github.com/aidanjnn/trail/blob/dfaf572a0c4bb1eb0ce15a14605649306fa550fe/docs/codex-log.md#2026-09-20--integrate-voice-pr-28-with-its-retargeted-webxr-foundation).
The current regression cases passed within the fresh 32-test run above.
Network/provider behavior is injected in these tests; no live microphone or
OpenAI session was opened for this check.

## 3. Hand assets could make motion disappear

**Problem.** The hologram renderer hid its existing joint display before the
replacement hand asset loaded. A delayed or failed asset could leave capture
and review without visible hand motion.

**Codex work and result.** After automatic review identified the defect, Codex
reproduced it by delaying and rejecting GLB requests, retained the joint/bone
display during loading and failure, and switched to the skin when ready. The
fallback continues to receive fresh poses and hides missing tracking.

Evidence: [repair `3b02d40`](https://github.com/aidanjnn/trail/commit/3b02d40884ce41ced5a34d8a46bc27cbde0604c0),
[browser regression](https://github.com/aidanjnn/trail/blob/dfaf572a0c4bb1eb0ce15a14605649306fa550fe/apps/webxr/tests/browser-hand-fallback.cjs),
and [recorded validation](https://github.com/aidanjnn/trail/blob/dfaf572a0c4bb1eb0ce15a14605649306fa550fe/docs/codex-log.md#2026-09-20--preserve-visible-hands-when-pr-30-assets-fail).
That work records 99 Node tests, 53 Python tests, 15 synthetic WebXR browser
workflows and eight desktop workflows passing. Those suites were not rerun for
this documentation. They do not prove headset contrast or comfort.

## Runtime API evidence is separate from Codex evidence

The [voice integration record](https://github.com/aidanjnn/trail/blob/8b95701cddca9b06dec5009983854c0f5aeeb6f3/docs/codex-log.md#2026-09-20--webxr-voice-gpt-live-coach-and-whisper-labels-in-the-quest-browser-tutor)
reports a real OpenAI desktop smoke at about 01:50 EDT on September 20:
paired guide publication, a Live session plus server sideband established in
1.7 seconds, acknowledged step updates, typed grounded replies, and reviewed
transcription/label provenance using synthetic narration input.

That test used Chromium's fake microphone and heard no spoken audio. Its typed
answers and synthetic-tone transcript prove specific transport/application paths;
they do not prove useful speech recognition, spoken response latency or headset
conversation. Earlier logs also record a team-observed desktop voice trial;
neither is a new device test for the final integrated build.

Use the [demo evidence checklist](openai-track.md#rehearsal-evidence-to-collect)
to close the remaining demonstration gap. If the team already has a successful
headset run, attach its actual revision and observations rather than replacing
the older records with an unqualified “everything works.”
