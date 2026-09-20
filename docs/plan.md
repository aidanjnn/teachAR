# Trail WebXR implementation plan

## 1. Product direction

On 2026-09-20 the user retired Unity and selected the WebXR stack
[PR #17](https://github.com/aidanjnn/trail/pull/17) →
[PR #23](https://github.com/aidanjnn/trail/pull/23) →
[PR #24](https://github.com/aidanjnn/trail/pull/24) as the current foundation. `apps/webxr` is the primary runtime.
The old native implementation plan is superseded; Git and the append-only
[activity log](codex-log.md) retain its history.

Trail records a safe physical demonstration, lets an expert review it, then
replays workspace-relative hand motion for a learner at their own pace.
Movement matching is guidance, not proof of assembly or hidden object state.

## 2. Existing foundation

The source baseline is PR #24 head `2566e5948cf6be4974cea4ccf171df907fdca28a`,
which includes PR #23 `a10b9f75790c8039d3a81b2ca80a26bf406fadb7` and
PR #17 `40514f519a8db6b9fac3c47e223ecdc2ba474cc2`.

PR #17 supplies Create/Follow, tracked-hand recording, save-position/trim,
review, local library, import/export, rigid placement and guidance. PR #23
connects the real DOM/XR UI, in-headset trimming, settings and durable-save
feedback. PR #24 adds preview-first practice, automatic movement-only
transitions and smoother procedural hands. See [the UI base](web-ui-base.md),
[practice flow](web-practice-flow.md) and [feature inventory](web-delivery.md).

The reviewed upstream repairs require explicit hand selection and complete
required-hand coverage, await durable tutorial saves, protect unfinished takes,
reconcile review edits with live guidance, and preserve short movement excursions.

This migration preserves the complete stack and formats while moving
`experiments/quest-browser` into `apps/webxr`, making it the root development
entry point and removing the retired native runtime/toolchain. No new provider
integration or device acceptance is implied.

## 3. Architecture and entry points

| Surface | Implementation | Entry point |
| --- | --- | --- |
| Headset tutor | Three.js, WebXR hand tracking, browser modules and IndexedDB | `pnpm dev`, port 4321, `/tutorial` or `/` |
| Local development / camera lab | Existing Python server, bounded optional image checks | Same server, `/lab`, `/camera`, `/ar` |
| Desktop review and diagnostics | Vite / TypeScript | `pnpm dev:desktop`, port 5173 |
| Main API | Fastify, private files, pairing, relay and provider adapters | Port 3001 |
| Visual interpretation | Separate authenticated Fastify service | Port 3002 |
| Shared formats/math | Zod and pure TypeScript | `packages/contracts`, `packages/motion` |

Local guidance works independently of the TypeScript backend. A validated coach-guide
adapter now publishes approved step text for paired voice and narration drafting;
reference-image and fresh-frame integration remain pending. The headset browser is the sole progression
authority. Backend and desktop observations remain advisory/read-only.

The exact Three.js dependency is pinned in the WebXR package. Vendoring checks
version, artifact hashes and license. Python requirements remain in the app.
No additional UI framework or database is part of this foundation.

## 4. Expert workflow

1. Create a tutorial and place its workspace using origin plus heading.
2. Choose its save position once, then record real hands with pause/resume.
3. Finish manually or return to the save zone; review any automatic trim.
4. Replay, trim, enter instructions and approve each step explicitly.
5. Await the local save; reopen it from the library and export for backup/transfer.

Keep optional audio/photo capture bounded and explicit. Missing tracking or
late media cannot become invented samples or mutate a reset recording. Failure
must remain visible; a save animation must follow durable storage success.

## 5. Learner workflow and spatial limits

Load a reviewed tutorial and place it in the current XR session at its original
scale. Each step demonstrates first at 0.75×, waits for a broad starting pose,
then guides ordered movement. Completion automatically previews the next step;
the final summary reports movement only. Pause/repeat/watch and tracking recovery
remain available. No physical-result confirmation is generated automatically.

Current placement is a rigid origin-plus-heading transform. It is not the former
three-point calibration/fourth-mark protocol. Use the same object geometry and
layout; changing shirt size, rearranging parts or inferring hidden fingers is
not supported retargeting. Never hide placement error by scaling recordings or
loosening tolerances. Validate physical accuracy on hardware.

## 6. Data contracts and compatibility

The browser format stays `trail.tutorial.prototype.v3`, with its existing import
migration/validation. Keep `trail-tutorials` IndexedDB storage identifiers and the
`/tutorial` URL stable so a source move does not discard existing local work.
Storage belongs to the complete browser origin, including hostname and port.
Export/import is explicit; source checkout changes do not synchronize data.

The main API's recording/tutorial v1 formats remain separate. Shared legacy
capture sidecars and named joint mapping remain import compatibility data only.
C# generation/parity and all native consumers are removed. See
[contracts](contracts.md) for the supported boundary. Any future converter needs
versioned provenance, real timestamps, approved steps and tests; do not fabricate
calibration, reference images or hashes.

Keep meters, actual monotonic sample times, explicit validity, normalized
quaternions and original scale. Sampling and ghost rendering share one reference
space. Runtime placement never becomes permanent recorded world coordinates.

## 7. Local progression and recovery

Preserve preview → ready → practice → transition → complete phase ownership,
the start gate, ordered per-hand path targets and fresh valid samples.
Tracking loss, stalled frames, focus loss and explicit pause clear progress
accumulation. A new XR session or changed reference invalidates placement.
Repeat begins a new attempt; reject delayed media/provider results after a change
of tutorial, step, attempt or session. Pure comparison/following code consumes
observations/time; runtime code owns I/O and rendering.

Movement events and the final “Movements finished” state leave physical results
unverified. Never call `TutorialPlayer.confirm()` during automatic transitions.
Preserve the relaxed demo tolerances, directional/excursion guards and paused
transition timer semantics in [the practice handoff](web-practice-flow.md).
Palm proximity is not proof of finger pose,
grasp, contact, full trajectory quality or physical completion. Existing guide
operation must not depend on optional paid image checks. Continuing an already
loaded tutorial without backend/AI is a target; cold offline launch is separate.

## 8. Security, privacy and service boundaries

The Python service binds loopback and checks Host/Origin and input bounds. It is
for single-user USB-loopback development. HTTPS, authentication and a deployment
review are required before ordinary remote/public use. Preserve the existing
shared API's role, cookie/Origin, bearer-client and spectator restrictions.
See [pairing](pairing.md) and [storage](authoring-storage.md).

Keep provider keys server-side. Default tests/providers to mocks. Do not enable
paid calls through tests or merely by opening the tutor. Preserve bounded
attempts, cooldown, cancellation and capture freshness in the separate camera lab.
No secrets, raw narration, camera frames, personal recordings, runtime databases,
model weights or virtual environments belong in Git. Prefer synthetic fixtures.

## 9. Next implementation phases

The functional UI and event-feedback slices are implemented by PR #23. Their
hardware acceptance remains open. Next work is:

1. **Visual coach context:** extend the connected step-text voice adapter with
   reviewed references and fresh frames, preserving microphone ownership,
   lifecycle cleanup, generations, opt-in capture, budgets and cancellation.
2. **Headset acceptance:** fresh multi-step recording, independent learner
   placement, preview/practice/transition and recovery drills, then a novice run.
   Verify broad demo tuning and stationary guards on hardware; test camera/mic/hands together.
3. **Broader tasks:** prove a second safe task family before adding object
   detection, layout retargeting, continuous video or optional haptics. Add an
   explicit physical-result gate only when required by a chosen task.

OMNI remains a research/integration target until its API/access and actual
behavior are confirmed. No live pipeline is claimed by this migration.

## 10. Capability limits

Passthrough rendering does not establish camera-pixel access. Feature-detect
browser APIs and test the installed Quest OS/browser. Hidden hands, deforming
objects, persistent/shared anchors and general object tracking are not solved by
this stack choice. Optional controller input is recovery/UI, not real hand data.
The plushie image lab is task-specific and cannot complete tutor steps.

Use lightweight forgiving tasks without dangerous tools. Two task families test
reuse; they do not prove general physical reasoning.

## 11. Verification strategy and acceptance checklist

The reproducible software gate is:

```sh
pnpm install --frozen-lockfile
pnpm setup:webxr
pnpm exec playwright install chromium
pnpm check
pnpm validate:fixtures
pnpm test:e2e
pnpm test:webxr
```

`pnpm check` covers TypeScript/API tests and builds, including verified WebXR
assets. `pnpm test:webxr` covers Node motion/format tests, Python server tests and
eleven synthetic Chromium workflows on a private temporary server with provider
credentials disabled. [CI](ci.md) runs the same applicable checks. Use focused
checks for smaller changes and reuse unchanged passing evidence.

Software acceptance: startup from a fresh checkout; both product URLs work;
review/save/reload/import/export remain functional; stale tracking cannot advance;
legacy experiments remain reachable; existing shared API checks pass. No editor,
C# runtime or APK is needed.

Hardware acceptance remains [the headset checklist](device-check.md): a fresh
multi-step tutorial, independent placement, start/off-path/loss/recovery,
pause/repeat/re-entry, optional-service disconnection after preload, three
consecutive runs and one non-builder. Separately prove concurrent mic/camera/XR,
real provider behavior and measured latency. Record revision, device/OS/browser,
origin, scenario and observations; never infer these from mocked inputs.

## 17. Immediate tickets to create

These are current planning labels, not existing issue IDs. Earlier TRAIL-xx
native tickets are historical and do not impose dependencies on browser work.

| Slice | Acceptance |
| --- | --- |
| WEB-01 Functional UI integration | Implemented in PR #23; headset legibility/reach acceptance remains |
| WEB-02 Feedback and failures | Implemented in PR #23; durable save, mute and stale/failure behavior have synthetic coverage |
| WEB-03 Paired coach adapter | Approved context, explicit protocol conversion, stale-result rejection and lifecycle tests |
| WEB-04 Headset transfer | Validate PR #24 preview/practice/automatic movement transitions and independent learner recovery |
| WEB-05 Second task family | New task data works without task-specific movement code |

Refer to [web delivery](web-delivery.md) for the source map and
[team ownership](team-plan.md) for coordination boundaries.
