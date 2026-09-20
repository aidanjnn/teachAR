# Trail Codex development log

## OpenAI track reading guide — September 20, 2026

Start with the [judge brief and demo plan](openai-track.md), then the
[three concrete Codex improvements](codex-impact.md). The full history below
records how the product evolved; the initial scaffold is an early milestone,
not the final scope of Codex's contribution.

**Evidence snapshot inspected for this summary:** main at
[`dfaf572`](https://github.com/aidanjnn/trail/tree/dfaf572a0c4bb1eb0ce15a14605649306fa550fe),
verified against GitHub during preparation on September 20. It contains the
WebXR tutor and paired GPT-Live coach. Historical statements such as “API not
implemented” or native-only plans apply to their dated snapshots, not the newer
browser implementation. Source links remain pinned as main advances.

| Judging criterion | Strongest selected evidence | Boundary |
| --- | --- | --- |
| OpenAI API powers the experience | Reviewed tutorial/current-step context feeds GPT-Live; transcription and structured label drafting support authoring. See the [API map](openai-track.md#what-the-api-contributes). | Implementation and recorded desktop provider evidence; the final Quest speech-and-hands rehearsal still needs its own record. |
| Codex improves the result | Reproduced false movement completion and repaired it with observed-motion checks and regression coverage. See [case 1](codex-impact.md#1-stationary-hands-could-finish-a-movement). | Freshly reproduced the old synthetic failure; repair passes 12 tests, inspected main passes 32 focused movement/coach tests. |
| Codex supports iteration | Cancelled voice startup cannot resume later; hand-asset failures retain visible joint outlines. See [cases 2 and 3](codex-impact.md). | Current coach unit regressions rerun; hand-rendering browser results attributed to their original work record. |

The team reports using Codex for implementation and supplied product direction,
constraints, review feedback and physical observations. These examples show the
specific work Codex performed without inventing code percentages or time savings.
The proposed live-demo sequence and feature ideas are recommendations, not
completed features or measured user outcomes.

## Historical introduction — initial scaffold

This log records how we used **OpenAI Codex to build Trail**, for our OpenAI / Codex track submission. It covers research, product decisions, implementation, debugging, testing, design exploration, and delivery—not just generated code.

**Last backfilled:** September 19, 2026. Times below are EDT (America/Toronto).
**Sources:** all five earlier Trail Codex tasks available in the local task history, including the archived workflow task, checked against repository files, commits, PR #1, and GitHub Actions. This is a summary of substantive work, not a raw conversation or tool-call export. Future sessions should append entries using the template below.

## What Codex has contributed so far

Codex helped turn the original product handoff into a researched implementation plan, refined it with the team, established repository workflows, divided work among four people, generated visual concepts, and implemented and delivered the first runnable application scaffold.

The strongest implemented contribution is [PR #1: feat(app): bootstrap the Trail application scaffold](https://github.com/aidanjnn/trail/pull/1). Before that change, the repository contained plans and agent workflows. After it, a teammate could install the workspace, run a Three.js hand-motion fixture, exercise a Fastify health API, and run automated checks without credentials or a headset. The change includes recording validation, rigid transforms, explicit tracking gaps, **27 unit/API tests**, and **3 desktop browser tests**.

The team supplied the product goal, hardware clarification, quality expectations, scope decisions, and delivery instructions. Codex researched, proposed, implemented, checked, and documented work in response. The PR's merge is recorded as a repository event; the Codex task created the PR and did not perform the merge.

## Activity timeline

This original timeline table covers **2026-09-19**. Later dated entries record subsequent work. Task letters refer to the source register below.

| Time | Request and Codex contribution | Result and evidence |
| --- | --- | --- |
| 03:32–03:42 | **Research and initial plan.** Read the supplied product handoff; used web research and three requested research subagents to develop the stack, architecture, contracts, calibration approach, build sequence, acceptance criteria, and sponsor/demo preparation. | Created the original `plan.md`; task A reported 28 source links and structural/technical review. The plan was later committed in [`292ac99`](https://github.com/aidanjnn/trail/commit/292ac99cb76181e82b2d8e0ee50713a03b05e6a3) and moved to [docs/plan.md](plan.md). Planning evidence, not a working application. |
| 03:42–03:47 | **Agent workflows.** Adapted the team's Copperlane delivery workflows to Trail's smaller TypeScript/WebXR project. Added nine skills, architecture and validation rules, Claude/Cursor discovery links, a PR template, and ignore rules. | [AGENTS.md](../AGENTS.md), [workflow skills](../.agents/skills/workflow/), and [validation guidance](../.agents/references/validation.md). Task B reported passing skill, link, and ignore checks. |
| 03:43–03:47 | **Hardware and quality revision.** Applied the user's confirmation of Quest 3S with controllers and request to target the best achievable experience regardless of limited XR experience. | Revised the plan toward articulated ghost hands, path-aware progression, automatic step proposals, contextual voice help, and polished interfaces. Scope cuts were tied to measured blockers and remaining time. Task A; included in `292ac99`. |
| 04:11–04:12 | **Workflow delivery.** Inspected and committed the agent workflow files, then pushed them to `main` on request. | [`d13ec55` — chore(agents): add Trail delivery skills](https://github.com/aidanjnn/trail/commit/d13ec55e70f6a7afed8caf0af2d33a19fee701f8). Task B verified local/remote agreement; the then-untracked plan was excluded. |
| 04:13–04:16 | **README and plan delivery.** Wrote the product overview, architecture, setup expectations, Quest connection instructions, milestones, and validation limits. Committed both README and plan so their documentation links resolved. | [`292ac99` — docs: add Trail README and implementation plan](https://github.com/aidanjnn/trail/commit/292ac99cb76181e82b2d8e0ee50713a03b05e6a3). Task B reported link/format checks and a clean, synchronized `main`. |
| 04:33 | **Documentation organization.** Moved the plan into `docs/` and updated README, agent guidance, and skill references. | Task A reported link and whitespace checks. The move and reference updates were subsequently included in the scaffold commit `3b1b1d2`. |
| 04:35–04:38 | **Four-person execution plan.** Defined XR, motion, voice/AI, and platform/integration ownership; starting tasks; file boundaries; concrete handoffs; headset sharing; integration gates; and accountability for all 15 plan tickets. | Created local draft `docs/team-plan.md` with README/main-plan references. Task A checked local links, ticket coverage, and ownership. This draft and its references were still uncommitted when this log was written. |
| 04:52–05:12 | **Plan critique and product clarification.** Challenged the unspecified physical demo task and discussed bottle/LEGO assembly, fresh demonstrations, object layouts, and the limits of hand tracking. | In task A, the user accepted a reusable, recording-driven engine with a consistent starting layout. Codex explained that reaching a hand checkpoint cannot independently verify correct assembly; explicit learner confirmation was discussed as a recommendation, not implemented behavior. |
| 04:52–04:55 | **Overlay concepts.** Used the built-in image generation tool to illustrate a translucent cyan ghost hand, short movement cue, and restrained floating instructions. | Task D produced local `first-person.png`, `guidance-sequence.png`, and saved prompts under `docs/mockups/translucent-assembly-2026-09-19/`. These remained uncommitted visual concepts, not screenshots or headset evidence. |
| 05:03–05:04 | **Stack explanation.** Explained why the plan uses WebXR, Three.js, strict TypeScript, pure motion logic, Zod, Vite, Fastify, local persistence, and desktop tests; emphasized local progression authority and measured criteria for a native alternative. | Task C provided a source-linked architectural explanation. This was decision support, with no implementation claimed for the explanation itself. |
| 05:20–05:30 | **Application scaffold.** Created an isolated worktree and `codex/initial-scaffold`; implemented four workspace packages, a synthetic replay screen, recording contracts, transforms, server health/static serving, test suites, CI, and setup notes. Iterated on compatibility and typecheck failures. | Task E completed a clean frozen install, typecheck/build, 27 unit/API tests, fixture validation, and 3 Playwright tests; also inspected desktop/mobile screenshots. See the implementation and validation sections below. |
| 05:30–05:33 | **Scaffold delivery and CI.** Staged only the scaffold and related documentation, committed, pushed, and opened PR #1 against `main` with the repository template and explicit validation limits. | [`3b1b1d2` — feat(app): bootstrap the Trail application scaffold](https://github.com/aidanjnn/trail/commit/3b1b1d214f50d054b2d6be55d977fd289492a3bc). Both PR check runs passed; the [PR CI run](https://github.com/aidanjnn/trail/actions/runs/35434938486) is retained as evidence. Team-plan/mockup drafts were excluded. |
| 09:31 | **Repository milestone.** PR #1 was merged after the Codex delivery task had finished. | Merge [`013e2ed`](https://github.com/aidanjnn/trail/commit/013e2ed84b663d9e974bc0306cdee9fd33f3ec58). The subsequent [main-branch CI run](https://github.com/aidanjnn/trail/actions/runs/35446014069) passed. Merge status and CI were checked live while preparing this log. |
| Current log task | **Evidence collection.** Reviewed the five task histories, Git history, merged PR, CI results, and current source/tests; backfilled this log. Updated local `main` to the merged scaffold while preserving existing documentation and image drafts. | This file is the deliverable. Its introducing commit records the log change; only this file is included in that commit. The user requested direct delivery to `main`. |

## Implemented contribution: the initial scaffold

Delivered in `3b1b1d2`, merged through PR #1:

| Area | What Codex implemented | Evidence |
| --- | --- | --- |
| Reproducible workspace | Four pnpm packages, strict TypeScript, exact dependency pins, shared package builds/watchers, and one lockfile. | [Root manifest](../package.json), [workspace](../pnpm-workspace.yaml), [lockfile](../pnpm-lock.yaml), [scaffold notes](scaffold.md). |
| Recording boundaries | Version-1 recording/pose schemas, 25 named joints, explicit valid/missing hand samples, quaternion validation, ordered timestamps, and recording limits. | [Contracts](../packages/contracts/src/index.ts), [contract tests](../packages/contracts/test/recording.test.ts), [version/migration notes](contracts.md). |
| Pure spatial math | Rotation/translation transforms and inverses without scaling, separated from browser and server effects. | [Motion implementation](../packages/motion/src/index.ts), [round-trip tests](../packages/motion/test/transform.test.ts), [architecture test](../packages/motion/test/architecture.test.ts). |
| Desktop replay | Three.js diagnostic skeleton, actual-time fixture sampling, play/pause/reset, keyboard scrubbing, tracking-gap rendering, and a read-only AR-support query. | [Replay viewer](../apps/web/src/replay/viewer.ts), [fixture source](../apps/web/src/replay/fixture-source.ts), [browser tests](../tests/e2e/fixture.spec.ts). |
| Local server | Injectable Fastify app, loopback-only configuration, root environment loading, writable-storage health probe, built static assets, and explicit rejection of unsupported live modes. | [Server app](../apps/server/src/app.ts), [configuration](../apps/server/src/config.ts), [API/config tests](../apps/server/test/app.test.ts). |
| Validation and handoff | Unit/API tests, built-app browser tests, GitHub Actions, setup instructions, contract notes, pending device checklist, and module ownership notes. | [CI workflow](../.github/workflows/check.yml), [README](../README.md), [device checklist](device-check.md). |

One concrete correctness example is **preserving missing tracking data**. The synthetic fixture has 61 frames over 2,000 ms, including eight missing right-hand samples. Codex added a schema round-trip test that preserves those gaps and a browser test that verifies the rendered hand disappears during a gap and returns on reset. This supports honest diagnostic replay. It does not establish tracking-loss behavior for the future guide reducer, which is not implemented yet.

Another example is **workspace-transform correctness**: tests rotate and translate every valid fixture pose into another workspace and back, check a nonidentity orientation, and verify quaternion-sign equivalence. These are deterministic math checks; physical calibration accuracy still needs hardware measurements.

During implementation, Codex also resolved a shared-package typecheck failure involving the universal `URL` type referenced by Zod declarations. The final scaffold retains declaration checking and includes an architecture test restricting shared source imports and platform globals. This iteration is recorded in task E and explained in [contracts.md](contracts.md).

## Validation evidence and limits

Earlier checks below are historical results from task E and the linked CI runs. They were inspected for this log, not represented as newly run application tests. This documentation-only change uses focused link, reference, scope, and whitespace checks.

| Evidence category | Recorded result | Scope |
| --- | --- | --- |
| Clean installation | Passed `pnpm install --offline --frozen-lockfile` in a temporary source copy without existing dependencies, builds, environment file, or runtime data. Initial network installation also succeeded. | Node 22.23.1 / pnpm 11.3.0; recorded in [scaffold validation at its original revision](https://github.com/aidanjnn/trail/blob/3b1b1d214f50d054b2d6be55d977fd289492a3bc/docs/scaffold.md#validation). |
| Automated application checks | Passed `pnpm check`: strict typecheck, **27 unit/API tests**, and production build. | Recording boundaries, rigid transforms, shared-package architecture, server configuration, health/storage failure, and static serving. |
| Synthetic fixture | Passed `pnpm validate:fixtures`: **61 frames / 2,000 ms**. | [Synthetic fixture](../fixtures/synthetic-reach.v1.json); not a real person's recording. |
| Desktop browser | Passed `pnpm test:e2e`: **3 Chromium tests**. Development startup/proxy/watchers also ran; desktop/mobile screenshots were inspected. | Replay/tracking gaps/reset, failed health request/recovery, and narrow-screen keyboard controls. Task E records Chromium 153.0.8010.12. |
| Remote CI | PR checks and the merged-main [Check run](https://github.com/aidanjnn/trail/actions/runs/35446014069) succeeded. | CI installs dependencies, runs `pnpm check`, installs Chromium, and runs `pnpm test:e2e`. |
| Build limitation | Non-blocking Vite warning: client chunk **757.33 kB minified / 174.07 kB gzip**. | Historical scaffold build; headset load/render performance remains unmeasured. |
| Live OpenAI API inside Trail | **Not implemented or tested.** | Transcription, semantic labels, and contextual voice help remain planned. Codex development assistance and image generation do not establish a runtime API integration. |
| Headset and human use | **Not tested.** | Live AR entry, hand capture, calibration, guidance/progression, physical transfer, and simultaneous mic/XR/hands/casting are unproven. See [device-check.md](device-check.md). |

Other planned work includes authoring/persistence, the complete tutorial/event contract, pairing, spectator relay, and guide recovery. The implemented fixture remaining usable after a health-request failure does not prove a preloaded interactive guide or cold offline launch.

## Evidence to add as implementation continues

- For a live OpenAI integration: the implementing commit/PR, actual model and operation, input provenance, reviewed output, latency/failure observations, and a reproducible demo. Keep keys, raw narration, and personal recordings out of this log.
- For a Codex-assisted fix: the observed problem, relevant prompt or request summary, code change, and regression test or measured before/after result. Avoid inventing time savings or treating proposed work as completed.
- For a headset milestone: tested commit, device/OS/Browser, scenario, observed measurements, and remaining issues in `docs/validation.md` once evidence exists.
- For submission: select a concrete implemented Codex contribution and connect its commit, tests, and demo. This log supplies the development history; track registration and final submission remain team actions.

## Source task register

Task titles are preserved as shown in Codex. IDs allow the team to locate the original sessions; they are not public transcript links. No conversations have been shared publicly by creating this log.

| Ref | Codex task | Task ID |
| --- | --- | --- |
| A | Create repo and stack plan | `01a0b892-e9f2-7da3-a272-5c6f565d2c8b` |
| B | Add plan-aligned agent skills (archived) | `01a0b89b-b494-74f0-804c-260262c8629d` |
| C | Explain Trail tech stack choices | `01a0b8e8-0651-76d3-b2fc-fd32e1d27c53` |
| D | Generate assembly overlay mockups | `01a0b8dd-c679-7992-9d93-77a5160b63e3` |
| E | Scaffold repo from plan | `01a0b8f7-c3f8-78e1-acca-b667ef0cad91` |
| F | Create Codex activity log | `01a0ba3a-9558-7881-abb7-c4ae7af8113c` |

The team-plan and mockup paths above are deliberately recorded as local drafts rather than published links. They were inspected locally but are not included in the log commit. Committed evidence is linked to repository files, immutable commits, the PR, and CI runs.

## New entry template

Append a dated entry after each substantive Codex session. Keep historical results tied to their original revision; add a correction when later evidence changes a claim.

```markdown
### YYYY-MM-DD HH:MM EDT — Contribution title

- User goal / request:
- Codex work: research, decisions, code, debugging, tests, or design performed.
- Human input: decisions, corrections, review, or physical testing supplied.
- Result: implemented / planned / draft / blocked; concrete behavior changed.
- Evidence: commit/PR, repository artifacts, and Codex task title/ID.
- Validation: commands and results; distinguish automated, desktop fixture,
  live provider, and headset/human evidence. Identify the tested revision.
- Remaining limits / next step:
- Before / after: the concrete behavior or decision Codex improved.
- Judge-visible proof: one inspectable diff, regression, screenshot, or demo moment.
- Attribution: distinguish the user, Codex, external review and device observer.
```

### 2026-09-19 11:33 EDT — GPT Live plan revision and ongoing activity logging

- **User goal / request:** Make the assembly storyboard the intended end-result direction, add GPT Live conversation in the Quest headset with “Am I doing this right?” feedback, update the plan, and remember to keep Codex logs under `docs/` current.
- **Codex work:** Researched official GPT Live model, WebRTC, delegation, sideband and lifecycle documentation with a research subagent. Updated [the plan](plan.md) to require hands-free spoken conversation and a separate image-capable Responses assessor, since GPT Live itself accepts audio/text rather than images. Defined fresh scene capture, reviewed expert reference images, stale-result/audio handling, bounded inspection retries, and local progression authority. An independent technical pass caught missing during-demonstration image capture, application-triggered delegation IDs, startup sideband ordering, frozen-frame detection and unbounded retries; the plan now addresses these.
- **Human input:** The user supplied the visual target and GPT Live requirement. Earlier accepted decisions included reusable fresh demonstrations, bottle/LEGO examples, a fixed starting layout within each tutorial, and the confirmed Quest 3S hardware.
- **Result:** Planning changes only. The storyboard is an explicit visual target; GPT Live and bounded scene inspection are core requirements. Added TRAIL-16/17, two-task reuse acceptance and T24–T30 scenarios. Updated [four-person assignments](team-plan.md), [README](../README.md), [agent guidance](../AGENTS.md) and [validation routes](../.agents/references/validation.md). Saved the user's ongoing logging preference in an authorized memory extension note and appended this entry.
- **Evidence:** Local uncommitted documents on `codex/live-coaching-plan`; task A, `01a0b892-e9f2-7da3-a272-5c6f565d2c8b`. [Official visual-context delegation](https://developers.openai.com/api/docs/guides/live-delegation#add-images-and-visual-context) supports the separate voice/vision architecture. Existing mockups and unrelated work were preserved. No publication or runtime integration was performed.
- **Validation:** The planning turn checked five Markdown files, 42 local links/anchors, the JSON example, all 17 ticket mappings, code fences and discovery links; all passed. `git diff --check` passed. These are documentation checks on the uncommitted worktree, not newly run application tests.
- **Remaining limits / next step:** Implement and test Live audio and fresh-scene coaching on the actual Quest 3S. Account access, camera route, latency, visual-assessment accuracy and simultaneous XR/audio behavior remain unverified. Continue appending substantive Codex activity to this log without another reminder.

### 2026-09-19 — IWSDK research and plan migration

- **User goal / request:** Check Meta's Immersive Web SDK documentation and update Trail's implementation plan to use the appropriate SDK.
- **Codex work:** Searched and read Meta/IWSDK setup, manifest, testing, spatial UI, camera and runtime documentation; checked official source and published package metadata. A research subagent verified raw frame access, reference-space negotiation, input fallback behavior, ghost separation and teardown. Confirmed Meta recommends IWSDK over assembling the immersive workflow from separate WebXR examples. It is a framework over WebXR/Three.js, not a browser requirement.
- **Human input:** The user identified IWSDK as the expected framework and explicitly requested research and a plan update.
- **Result:** Selected IWSDK for the planned immersive runtime and UIKitML controls. Added an existing-workspace migration, TRAIL-18, SDK ownership boundaries, required hands/local reference space, raw-joint sampling, IWER provenance and T31–T35 scenarios. Revised [plan.md](plan.md), [team-plan.md](team-plan.md), [README](../README.md), [AGENTS.md](../AGENTS.md) and [validation guidance](../.agents/references/validation.md). Kept pure motion/contracts, GPT Live coaching and the paired webcam fallback.
- **Concrete findings:** IWSDK 0.5.3's dev plugin declares Vite 7 compatibility; the official starter requires a Three.js alias to `super-three@0.181.0`. Trail currently has Vite 8.3.0/Three.js 0.186.0, so the plan requires a coordinated migration rather than adding a package unchanged. SDK visual transforms can remain stale or represent controller fallback input. `CameraSource` accesses browser-exposed media devices, not automatic compositor passthrough. World destruction is required on route teardown to stop its loop.
- **Evidence:** [Meta WebXR recommendation](https://developers.meta.com/horizon/documentation/web/webxr-overview/), [official setup](https://developers.meta.com/horizon/documentation/iwsdk/guides/01-project-setup/), [pinned World source](https://github.com/facebook/immersive-web-sdk/blob/22ae62df4ba2ee73b611b02ba5636940bd4dabe6/packages/core/src/ecs/world.ts), [camera guide](https://iwsdk.dev/guides/13-camera-access.html), and versioned registry links in the plan. Confirmed frame APIs also exist in the published core 0.5.3 declarations. Task A, `01a0b892-e9f2-7da3-a272-5c6f565d2c8b`; uncommitted documentation on `codex/live-coaching-plan`.
- **Validation:** Focused checks passed for five planning/guidance files, 43 local links/anchors, 18 fenced code blocks, all 18 ticket mappings and all 35 scenario IDs. `git diff --check` passed. No SDK was installed, package/lockfile changed, application test rerun, or headset result claimed by this documentation task.
- **Remaining limits / next step:** Implement TRAIL-18 against the existing scaffold, prove the compatible dependency set and preserve current automated checks, then validate actual Quest entry/exit, raw tracking, calibration, spatial UI and concurrent audio/camera behavior. IWER cannot establish physical accuracy or camera access.

### 2026-09-19 — IWSDK versus Spatial SDK decision clarification

- **User goal / request:** Compare IWSDK with Meta Spatial SDK for Trail's intended experience.
- **Codex work:** Compared official runtime, camera and input documentation. IWSDK is the TypeScript/WebXR path; Spatial SDK is the Kotlin/Android native path. Meta's recommendation of IWSDK applies to immersive web development, not every Quest application. Both require Trail-specific recording, calibration, replay and coaching logic.
- **Result:** Recommend retaining IWSDK for the currently planned web implementation, conditional on proving the camera requirement on the actual Quest 3S. A headset-only product requiring direct native camera control is a reason to evaluate Spatial SDK before further runtime investment. Do not treat an external webcam as an equivalent headset-only experience or silently switch the stack. The existing implementation plan was not rewritten by this comparison.
- **Evidence:** [IWSDK overview](https://developers.meta.com/horizon/documentation/iwsdk/guides/overview/), [Spatial SDK overview](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-explainer/), [native Quest 3/3S Camera2 access](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-pca-overview/), [IWSDK browser camera boundary](https://iwsdk.dev/guides/13-camera-access.html), [Browser 40.1 passthrough-camera release note](https://developers.meta.com/horizon/downloads/package/browser/40.1/?view=full_width), and [open browser permission investigation](https://developers.meta.com/horizon/feedback/vr/investigations/1557993751977106/). The investigation is an AI-summarized developer report, not proof of behavior on this team's device. Together these sources do not justify claiming browser RGB access is universally unavailable or reliable.
- **Validation:** Documentation research and `git diff --check` only; no runtime, provider or headset tests performed in this comparison.
- **Remaining limits / next step:** Prove fresh headset RGB frames, raw hand capture, ghost rendering and microphone/audio concurrently before committing further to the browser camera route. A native alternative must independently prove articulated joint capture/replay and voice transport; its documented camera API alone does not establish complete Trail feasibility.

### 2026-09-19 — Native headset direction

- **User goal / request:** Favor Spatial SDK given access to the physical Quest 3S and its controllers.
- **Codex work / result:** Clarified that both SDKs run on physical Quest hardware. Endorsed Spatial SDK for a native headset-first version because its documented Camera2 integration fits headset-camera visual coaching. Controller ownership alone does not select the SDK or establish articulated hand capture. This is an architectural direction, not a completed migration.
- **Evidence:** [Spatial SDK overview](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-explainer/) and [Quest 3/3S native camera access](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-pca-overview/), researched in the preceding comparison.
- **Validation:** `git diff --check` passed; no application, provider or hardware tests run.
- **Remaining limits / next step:** The detailed plan still describes IWSDK. A native revision needs Kotlin/Android headset ownership, local motion-engine portability, native audio transport and real joint/camera/audio acceptance before implementation. The TypeScript backend and desktop tools can remain; the existing TypeScript motion engine is not directly a native Kotlin library.

### 2026-09-19 — Full-workflow comparison recommends Unity and Meta XR

- **User goal / request:** Give a logically grounded choice among Spatial SDK, Unity with Meta XR, and IWSDK against the actual Trail plan.
- **Codex work:** Re-read the product requirements and compared official Unity hand/bone capture, skeleton setup, passthrough camera and WebRTC documentation with Spatial SDK and IWSDK capabilities. Corrected the earlier camera-focused recommendation: native Quest camera access is available to Unity as well as Spatial SDK. Prior discussion correctly distinguished Unity/C# from Spatial SDK/Kotlin; they are alternative headset clients.
- **Result:** Recommend Unity + Meta XR for Trail's complete recorded-hand, articulated-ghost, calibrated spatial-guidance and visual-coaching workflow. This is an engineering judgment about the combination of supported components and authoring/debugging tools, not a measured claim of better tracking accuracy or guaranteed delivery time. IWSDK retains advantages for web distribution and existing TypeScript reuse; Spatial SDK remains viable for Android/Kotlin-focused work. Recommendation supersedes the earlier preference for Spatial SDK; no full plan or application migration was performed by this comparison.
- **Evidence:** [Unity hand capture tutorial](https://developers.meta.com/horizon/documentation/unity/unity-tutorial-basic-hand-tracking/), [hand/skeleton setup](https://developers.meta.com/horizon/documentation/unity/unity-handtracking-hands-setup/), [MRUK camera integration](https://developers.meta.com/horizon/documentation/unity/unity-pca-documentation/), [Spatial SDK overview](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-explainer/), [IWSDK overview](https://developers.meta.com/horizon/documentation/iwsdk/guides/overview/), and [Unity WebRTC platform requirements](https://docs.unity3d.com/Packages/com.unity.webrtc@3.0/manual/requirements.html). Unity's documented WebRTC package lists Android ARM64 support but includes build constraints; this is not proof of GPT Live compatibility or simultaneous XR/audio performance.
- **Migration implications:** Keep Fastify and desktop authoring/spectator tools. Put capture, calibration, replay and deterministic progression on the headset in testable C#. Port motion logic using shared golden fixtures; explicitly adapt coordinate handedness, joint names/counts, bone axes and clocks rather than copying WebXR array indices. Preserve AI/progression separation and fresh-frame/context checks. Pin a mutually compatible Unity/Meta/audio package set during setup.
- **Validation:** `git diff --check` passed on the uncommitted documentation. No application tests, Unity build, live-provider or headset checks run.
- **Remaining limits / next step:** Before broad implementation, run a standalone Quest 3S vertical slice: real hand capture and replay after calibration, fresh camera image and bidirectional voice concurrently, plus tracking-loss recovery. Current `plan.md` still contains IWSDK-specific implementation details and needs a coordinated Unity revision if this recommendation is adopted.

### 2026-09-19 — Adopt Unity + Meta XR in the implementation plan

- **User goal / request:** Update the plan to the approved Unity + Meta XR direction.
- **Codex work:** Researched official Unity/Meta setup, OpenXR compatibility, hand skeletons, native camera access and Android WebRTC requirements; applied the OpenAI Docs skill to verify GPT Live WebRTC and visual-context delegation. Reworked [plan.md](plan.md) for a standalone C# headset app at `apps/quest`, retaining the existing TypeScript/Fastify server and desktop tools. Replaced the IWSDK migration, browser-only setup and runtime assumptions with native project/build, permissions, pairing/authentication, private-file storage and recovery requirements.
- **Human input:** The user selected Unity + Meta XR after the full-workflow SDK comparison. Quest 3S, fresh generic demonstrations, the ghost-hand visual target and GPT Live conversation remain the requirements.
- **Result:** Updated the [four-person plan](team-plan.md), [README](../README.md), [AGENTS.md](../AGENTS.md), [validation routes](../.agents/references/validation.md) and [pending device gate](device-check.md). Preserved all 18 ticket identities and existing product algorithms/contracts while defining strict C#/Zod compatibility, versioned native metadata, 26-to-25 joint mapping, handedness/bone-axis conversion and clock mapping. Replaced T31–T35 and added T36–T40 for native risks. Fresh Quest-camera evidence is required; a webcam is a disclosed reduced outcome.
- **Concrete setup boundary:** Unity 6.3 and WebRTC 3.0.0 are researched candidates, not a validated combined package set. Exact editor/OpenXR/Meta/audio versions must be frozen after build/device checks. Native voice requires actual Android duplex audio/echo/interruption tests. Unity ownership is split into feature prefabs and pure C# assemblies, with integration owning the main scene, project settings and locks. No Unity or SDK installation, source migration, manifest/lockfile edit, publication or headset test was performed.
- **Evidence:** [Meta Unity setup](https://developers.meta.com/horizon/documentation/unity/unity-project-setup/), [hands](https://developers.meta.com/horizon/documentation/unity/unity-handtracking-hands-setup/), [MRUK camera](https://developers.meta.com/horizon/documentation/unity/unity-pca-documentation/), [Unity WebRTC requirements](https://docs.unity3d.com/Packages/com.unity.webrtc@3.0/manual/requirements.html), [GPT Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live) and [visual delegation](https://developers.openai.com/api/docs/guides/live-delegation#add-images-and-visual-context). Local uncommitted planning work in task A; historical log entries remain unchanged.
- **Validation:** Focused documentation checks passed for six planning/guidance files, 43 local links/anchors, 16 fenced blocks, all 18 ticket mappings and all 40 scenario IDs. `git diff --check` passed. Stale-runtime search found no remaining active IWSDK/World/UIKitML/browser-capture instructions in the updated documents. No application tests were rerun for this documentation-only change.
- **Remaining limits / next step:** Implement the setup portion of TRAIL-18 and the parallel contract/native voice/camera probes. Prove a single standalone Quest APK with fresh hands, calibrated recorded ghost, real camera frames and two-way speech before expanding the tutorial workflow. Actual remaining build time and event deadlines must be reconciled; the Unity decision does not restart the original schedule.

### 2026-09-19 — Prepare documentation delivery to main

- **User goal / request:** Commit and push the updated documentation directly to `main`.
- **Codex work:** Followed the Trail commit workflow, fetched `origin`, confirmed local `main` matched `origin/main`, inspected the documentation changes and switched to `main` without discarding work. Included the generated concept images and their provenance README so the plan's visual links remain usable after publication. These are illustrative assets, not personal recordings or headset evidence.
- **Result / scope:** Prepared the Unity/Meta XR plan, four-person assignments, README, agent/validation guidance, pending device checklist, activity log and referenced mockups as one documentation commit. No application source, dependency manifests or lockfiles are included. Push and remote-SHA verification follow the commit; their final outcome is reported in the delivery response and Git history.
- **Validation:** Rechecked six planning/guidance files, 43 local links/anchors, 16 fenced blocks, 18 ticket mappings and 40 scenario IDs; all passed. `git diff --check` passed. Inspected both generated images and their source prompts. Application, provider and hardware tests were not rerun for this documentation-only delivery.
- **Remaining limits:** The native app remains planned; publishing the plan does not establish Unity build or Quest readiness. Historical log descriptions of uncommitted drafts refer to their earlier revisions; this delivery includes those planning artifacts.

### 2026-09-19 — Explain the Fastify choice

- **User goal / request:** Explain why Trail uses Fastify after selecting Unity.
- **Codex work / result:** Checked the current plan and server manifest, and reviewed official Fastify testing/WebSocket documentation. Retaining Fastify is a pragmatic backend choice: preserve the TypeScript scaffold/contracts, host bounded API/upload/storage/coaching work and desktop tools in one process, and test routes independently of the headset. Unity owns local tracking/rendering/progression; native C# does not require the server to use C#. Fastify is replaceable and its request throughput is not the deciding product constraint.
- **Evidence:** [Server manifest](../apps/server/package.json), [architecture](plan.md#4-stack-and-repository-setup), [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/) and [WebSocket plugin](https://github.com/fastify/fastify-websocket). The current server has health/static scaffolding; planned storage, native pairing, coaching and relay capabilities are not implemented by this explanation.
- **Validation / limits:** Research and repository inspection only; `git diff --check` passed. No application changes/tests, commit or push in this explanatory turn.

### 2026-09-19 — Clarify environment transfer, scene reconstruction and object tracking

- **User goal / request:** Discuss the value of arbitrary object tracking and feasibility of scene reconstruction, and account for differences between expert and learner environments in the plan.
- **Human input:** Confirmed first-version requirement: different room/table, same objects and starting layout. Independently rearranged parts and replacement shapes were not selected.
- **Codex work / result:** Reviewed official Meta Scene/MRUK, Depth API and object-detection documentation plus NVIDIA FoundationPose. Updated [plan.md](plan.md) to require independent cross-room workspace registration, layout confirmation and measured physical transfer. Replaced the blanket scene-reconstruction exclusion with a bounded MRUK scene-understanding milestone; separated coarse static room geometry, optional depth, object detection and future persistent object-pose tracking/retargeting. Preserved workspace-relative v1 recordings and local progression authority.
- **Coordination:** Added TRAIL-19 and T41–T44; updated [team ownership](team-plan.md) and [device checklist](device-check.md). The XR owner leads transfer/MRUK evidence; motion checks transforms/origin changes; voice tests changed backgrounds; integration owns scene integration and the test slot. Scene-assisted setup is enabled only after its device gate; missing scene assistance is explicitly reported. Cross-room transfer itself remains required.
- **Evidence:** [Meta Scene best practices](https://developers.meta.com/horizon/documentation/unity/scene-best-practices/), [Depth API including Quest 3S](https://developers.meta.com/horizon/documentation/unity/unity-depthapi-overview/), [object detection sample](https://developers.meta.com/horizon/documentation/unity/unity-sample-camera-object-detection/), [FoundationPose](https://github.com/NVlabs/FoundationPose). A room scan does not provide dynamic part identity, precise assembly geometry or physical verification.
- **Validation / limits:** Documentation checker passed six files, 44 local links/anchors, 16 fenced blocks, 19 ticket mappings and 44 scenario IDs; `git diff --check` passed. No app changes, runtime tests, room capture, headset validation or provider trial were performed. Changes remain local on `codex/spatial-transfer-plan`; no commit/push requested for this revision. Preserved the earlier uncommitted Fastify explanation entry.

### 2026-09-19 — Make visual interpretation a dedicated required backend

- **User goal / request:** Update the plan to use a separate visual interpretation backend for GPT Live; text/audio-only acceptance is insufficient.
- **Codex work / result:** Applied the OpenAI Docs skill and verified official GPT Live visual delegation guidance. The prior plan already required image-capable Responses assessment, but hosted it within the main server. Revised the target to two TypeScript/Fastify processes: main API/session/Live coordination in `apps/server`, image interpretation in planned `apps/vision`. Added explicit camera → main API → vision/model → validated findings → GPT Live → heard headset speech acceptance.
- **Design:** Documented internal v1 request/result identity, actual bounded image inputs, reviewed references, service authentication/configuration, provider-key ownership, finite admission, cancellation/deduplication, deadline preservation, crash/restart behavior and unavailable-state recovery. Existing recording v1 and Unity's local progression authority remain intact. This service boundary is a project decision; OpenAI requires a vision-capable backend for this pattern, not a particular two-process deployment.
- **Coordination:** Added TRAIL-20 for Person 3 with Person 4 owning package/launcher/auth/adapter integration; connected TRAIL-17 and added T45–T47. Updated the team plan, README, agent guide, validation routes and device checklist to remove the one-process assumption and require evidence-dependent spoken feedback from fresh Quest imagery.
- **Evidence:** [GPT Live model modalities](https://developers.openai.com/api/docs/models/gpt-live-1), [official visual delegation flow](https://developers.openai.com/api/docs/guides/live-delegation#add-images-and-visual-context). The native Live frontend handles audio/text; the vision backend interprets images and returns concise findings for spoken delivery.
- **Validation / limits:** Documentation checker passed six planning/guidance files, 44 local links/anchors, 16 fenced blocks, all 20 ticket mappings and 47 scenario IDs; `git diff --check` passed. No package/service was created, no dependencies changed and no provider/device tests ran. Existing environment-transfer edits are preserved. Changes remain local and uncommitted; no push was requested.

### 2026-09-19 — Publish revised plan before rescaffolding

- **User request:** Commit and push the revised plan on a new branch, then rescaffold for Unity/Meta XR and the separate vision backend, asking setup questions including pnpm installation.
- **Codex work:** Applied the Trail commit workflow; inspected the seven changed documentation files, confirmed no staged changes and selected `codex/unity-vision-rescaffold`. Preserved environment-transfer and dedicated-vision decisions as one planning commit before implementation.
- **Validation:** Documentation links/fences, 20 ticket mappings and 47 scenario IDs pass; `git diff --check` passes. Publication outcome is reported after verifying the remote SHA. Rescaffolding and toolchain installation are separate subsequent work.

### 2026-09-19 — Rescaffold for the native client and dedicated vision backend

- **User request / delivery:** Published the revised plan as `a31fb97` on `codex/unity-vision-rescaffold`, verified matching remote SHA, then prepared the requested rescaffold. The user subsequently requested a separate code branch and PR; implementation is on `codex/native-vision-scaffold`, targeting `main` and including the unmerged planning commit.
- **Human setup decisions:** Ask before each pnpm install; prepare Unity files without installing Unity. Received explicit approval for one `pnpm install` to link `@trail/vision` with existing Fastify/Zod/contracts versions. It completed without new third-party versions or downloads. No other package/editor installation was run.
- **Backend work:** Added the authenticated loopback vision process, explicit non-readiness and 501 inspection refusal, independent service-protocol v1 fixture/schemas, bounded main-server health client and desktop dependency status. Added shared development startup with ephemeral internal credentials, port preflight/overrides and independent vision failure. Existing recording v1 and synthetic replay remain intact; no fake image verdict or live provider adapter was added.
- **Native work:** Prepared Unity 6000.3.24f1 source project with candidate Meta 205/OpenXR/URP/WebRTC pins, stable metadata, minimal scaffold scene, pure C# domain boundaries, numeric basis conversion, named joints and EditMode sources. Added Android setup and actual-editor test wrappers plus static scaffold validation. Candidate pins were checked against official Unity release/manual and Unity/Meta registry metadata. No fabricated UPM lock or XR rig readiness claim.
- **Documentation:** Updated setup/status, contracts, device gate, agent ownership and native/service READMEs. The source scaffold is not completion of TRAIL-17/18/20. Camera, mic/Live, full C# wire parser, guide/calibration and image interpretation remain pending.
- **Validation:** `pnpm check` passes 39 unit/API checks, strict typechecking, web/main/vision builds and static native checks; recording fixture validation and three Chromium scenarios pass. Verified development main/vision communication and unauthenticated rejection on isolated ports, then stopped vision and observed healthy main API/desktop with explicit unavailable status. Smoke processes were cleaned up; unrelated listeners remain. An initial library-type conflict in concurrently was resolved by using its existing CLI without weakening TypeScript settings. `pnpm quest:test` reports the missing editor and fails explicitly; no native/provider/headset validation is claimed. Existing Vite chunk warning remains. Final focused/full checks and staged review precede code publication; PR/remote outcome is reported in the delivery response.

### 2026-09-19 — Expand pull request CI checks

- **User request:** Add GitHub checks/workflows on a new branch and open a PR.
- **Scope:** Created `codex/pr-ci-workflows` from `origin/main` in an isolated worktree, preserving the original checkout's pending README/log edits and keeping the unmerged native/vision and voice PRs separate. Expanded the existing Check workflow into parallel workspace/fixture, Chromium and actionlint jobs, with the original `check` job as the aggregate result. Added main-push, merge-group and manual triggers; removed duplicate feature-branch push runs. PR updates cancel obsolete runs, and browser reports/failure traces are retained for seven days.
- **Configuration:** Read-only token permissions, disabled checkout credential persistence, frozen-lockfile installs, manifest-sourced Node/pnpm versions, commit-pinned actions and checksum-verified actionlint 1.7.12. Added [CI documentation](ci.md) for local reproduction, status enforcement and remaining gates. Consulted [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) and [actionlint usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md); verified upstream action refs and release checksums.
- **Automated validation:** On the uncommitted task worktree, the frozen install completed with 152 reused packages and no downloads. `pnpm check` passed typechecking, 27 unit/API tests and production builds; `pnpm validate:fixtures` passed the 61-frame, 2,000 ms synthetic fixture. actionlint 1.7.12 passed locally (ShellCheck is not installed locally). Exercised the actual aggregate shell script against all 64 combinations of success/failure/cancelled/skipped results; only three successes pass. Patch whitespace checks passed. The existing Vite chunk-size warning remains.
- **Desktop fixture validation:** All three Playwright Chromium scenarios passed against the built app with an HTML report. These use synthetic input/mock configuration, not live providers or headset observations.
- **Delivery / limits:** Commit, push, PR creation and the first remote Actions result follow this recorded local validation and are reported in the delivery response. Repository branch rules and deployment are unchanged. Unity editor/Android gates await compatible activated setup under TRAIL-18; green CI is not native or physical-transfer evidence. No live-provider or headset/human tests were run.

### 2026-09-19 — Catch up the native/vision branch with its PR base

- **User request:** Run the Trail catch-up skill on the current task branch.
- **Codex work:** Fetched PR #2's actual base, `origin/main` at `1e7ea5a`. Used an isolated detached checkout to merge the expanded CI workflow and CI documentation without staging or overwriting the primary checkout's pending README/log edits. Resolved the append-only log conflict by retaining both complete histories. No application, schema, dependency or lockfile changes came from the base.
- **Validation / delivery:** Reviewed the full incoming workflow/docs diff and preserved the previously passing application checks because their inputs are unchanged. actionlint 1.7.12, documentation validation (10 files, 51 local links/anchors) and patch whitespace checks passed; local ShellCheck is unavailable. The primary checkout's pending edits are restored after fast-forwarding to the merge result; publication status is reported separately. No install or native/provider/headset test is part of this catch-up.

### 2026-09-19 — Repair and monitor native/vision PR #2

- **Scope:** Applied babysit, signoff and commit workflows; inspected paginated reviews/checks and preserved pending README/log edits. Published the local main catch-up merge and repaired the verified review finding in `2b3d7d8`: development vision URL now follows the launched port even when a stale URL is configured.
- **Validation:** `pnpm check` (39 tests, builds and static native checks), fixture validation, three Chromium scenarios, actionlint and whitespace checks passed. Real development smoke with ports 3301/5373/3302 and stale URL at port 1 reached vision while preserving its explicit non-readiness. Owned processes were stopped; no installs. Existing Vite warning remains. No native compilation, provider or headset validation.
- **Delivery:** Monitor hosted checks on the published head; report final status separately. Review-thread resolution requires the user; replies/resolution, merging and deployment were not authorized. A log-staging script initially rejected a non-ASCII byte literal before writing; corrected without changing the pending user edits.

## 2026-09-19 — TRAIL-03 shared contract freeze (task 2)

Added strict tutorial/draft, guide-event, native sidecar/calibration v2, scene-reference/inspection and upload boundary schemas. Recording v1 exports and audio sync enum remain compatible; native provenance stays separate. Tutorial binding verifies recording/hash/workspace identity and targets against valid recorded wrists. Initial focused validation: contracts TypeScript build and 15 existing recording tests passed. Strict native parser and shared corpus validation are in progress; this entry is not Unity, provider or headset evidence.
## 2026-09-19 — Task 3 native capture/calibration/replay software

Implemented TRAIL-04/05 software and TRAIL-19 rigid-transfer foundations: pure
three-mark rigid fit with independent D rejection, stable median mark holds,
explicit Unity basis reflection, bounded actual-time recording, missing/jump
samples, gap-safe replay, native XR Hands Dynamic callback adapter, origin/lifecycle
invalidation, opposite-hand world-space calibration controls and separate
procedural articulated ghost/prefab. Added canonical DTO/storage events and
platform feature registry integration; no narration/microphone/camera code.

Actual C# domain fixtures passed under task-scoped .NET 8.0.425 (initial run used
shared-contract task's generated C# sources before its publication). Includes
rotated transfer, mirrored/scale/held-out failures, real timestamp and stale/gap
behavior. Added Unity runtime tests; unavailable editor means they have not run.
Static quest scaffold check passed. Final merged-dependency checks will be
recorded separately. SDK APIs were checked against Unity XR Hands documentation;
1.7.2 pin follows platform task's inspected Meta Core dependency. See
[native capture runbook](native-capture.md) for interfaces, controls and evidence
limits. No headset, physical LEGO, live sensor, shader/Unity import, Android or
independent human transfer evidence is claimed.

## 2026-09-19 — TRAIL-03 shared contract freeze (task 2)

Added strict tutorial/draft, guide-event, native sidecar/calibration v2, scene-reference/inspection and upload boundary schemas. Recording v1 exports and audio sync enum remain compatible; native provenance stays separate. Tutorial binding verifies recording/hash/workspace identity and targets against valid recorded wrists. Initial focused validation: contracts TypeScript build and 15 existing recording tests passed. Strict native parser and shared corpus validation are in progress; this entry is not Unity, provider or headset evidence.

### 2026-09-19 — Task 4 deterministic guide core

Implemented a pure C# guide reducer/matcher and input-driven runtime session for
TRAIL-06/07: start gating, ordered intermediate gates, bounded fresh-sample dwell,
tracking reacquisition, pause/reset/repeat and distinct user-confirmed completion.
Adaptive cue progress cannot pass gates. The shared temporary .NET 8.0.425 SDK
compiled the actual sources and passed 19 synthetic scenarios, including a full
multi-step effect trace without any backend. Unity EditMode, APK and physical
LEGO/headset validation remain unavailable. Native DTO/capture integration is
being completed on this task branch; this core result does not claim that wiring.
TRAIL-03 native implementation update: explicit generated DTO readers/writers now compile with the task-scoped .NET 8 SDK. A dependency-free bounded JSON reader rejects duplicate keys, malformed input and nonfinite exponents; generated structural validation and handwritten semantic validation share the TS corpus. 112 TS contract tests and 99 pure C# corpus/binding/legacy/joint/basis checks passed. This is actual .NET behavior, not Unity import or IL2CPP proof. OpenXR enum names were verified against the Khronos XrHandJointEXT reference; palm is excluded explicitly.
### 2026-09-19 — Task 1 native platform: pairing boundary and shared dependencies

- Implemented ephemeral, bounded role/session-scoped native bearer and browser cookie pairing. Codes are single-use with five-minute expiry; credentials expire after one hour and revoke on logout/restart. Browser requests require exact allowed Origin, native requests require bearer even without Origin, present unexpected Origin is rejected. Transport defaults to HTTPS with an explicit actual-peer/Host loopback exception. Trusted initial author code is written atomically to a private operator file; no credentials are logged.
- Published reusable authorization hooks for HTTP/WS and author-only code issuance; task 6 owns final server/UI composition. Five focused server tests cover expiry/reuse, revocation, role/session/client isolation, Origin, transport/forwarded-header rejection, guessing rate limits and private bootstrap file mode. Passing tests are automated synthetic evidence, not native connection evidence.
- Added requested exact shared dependencies: sharp 0.34.5 (vision byte decoding), Fastify WebSocket 11.3.1, ws types 8.18.1 and internal motion workspace dependency (authoring/relay). Explicitly allow sharp's required install script under existing pnpm lifecycle policy. No unrelated package upgrades intended.
## 2026-09-19 — TRAIL-03 shared contract freeze (task 2)

Added strict tutorial/draft, guide-event, native sidecar/calibration v2, scene-reference/inspection and upload boundary schemas. Recording v1 exports and audio sync enum remain compatible; native provenance stays separate. Tutorial binding verifies recording/hash/workspace identity and targets against valid recorded wrists. Initial focused validation: contracts TypeScript build and 15 existing recording tests passed. Strict native parser and shared corpus validation are in progress; this entry is not Unity, provider or headset evidence.

### 2026-09-19 — Task 6 authoring and storage implementation
### 2026-09-19 — Task 5 visual inspection pipeline (in progress)

- Replaced the vision skeleton with authenticated bounded image decoding, one active job, capped duplicate waiters, cancellation/deadlines and strict Responses output handling. Default mock remains explicitly unavailable; injected synthetic test providers carry mock provenance. No live provider calls or real images were sent.
- Added delegated service/transport schemas while preserving task 2's canonical scene and recording contracts; base64 JSON has a precise HTTP cap and full JPEG/PNG decode, dimension/hash validation and metadata stripping. Main-server coordinator binds paused guide identity, source session/frame, one-use nonce, original deadline and reviewed references; findings cannot resume/complete motion.
- Consulted official Responses image/structured-output documentation and actual Meta MRUK 205 package source. Added source-only camera readback with lifecycle cancellation and a pure freshness gate. .NET harness passed fresh/stale/duplicate/stall/cancel/restart/clock cases. This is not Unity compilation or headset evidence.
- Initial checks: 30 vision/service tests plus 7 coordinator tests and workspace typecheck passed. Two-process failure/recovery smoke, final review and full gates follow before delivery.

- Integrated published task 1 auth/dependencies and task 2 canonical TypeScript schemas. Implemented private atomic storage, bounded ordered hashed chunks, identical retry checks, final recording integrity, interrupted job recovery, revision-checked tutorial edits and immutable ready publication. Added deterministic marker-first/motion-pause segmentation, recorded-wrist gate derivation and an explicit synthetic four-step authoring input.
- Desktop workbench retains fixture replay and adds pairing, upload/review/save/finalize/library and read-only spectator state. Protected browser reads use POST aliases because browsers cannot set Origin on same-origin GET. Native GET uses bearer auth. WebSocket implementation follows [Fastify's plugin guidance](https://github.com/fastify/fastify-websocket) for synchronous message handlers, upgrade auth and registration order.
- Focused automated evidence so far: four motion/files tests and three real Fastify authoring-flow tests passed, including restart, stale revision, wrong role and hash failures. Native private-cache source and browser work are in progress; no native, headset, image-provider or physical task claim.
TRAIL-03 native implementation update: explicit generated DTO readers/writers now compile with the task-scoped .NET 8 SDK. A dependency-free bounded JSON reader rejects duplicate keys, malformed input and nonfinite exponents; generated structural validation and handwritten semantic validation share the TS corpus. 112 TS contract tests and 99 pure C# corpus/binding/legacy/joint/basis checks passed. This is actual .NET behavior, not Unity import or IL2CPP proof. OpenXR enum names were verified against the Khronos XrHandJointEXT reference; palm is excluded explicitly.

### 2026-09-19 — Task 1 native platform: setup, composition and connection

- Replaced the scaffold-status scene component with a single-provider native bootstrap. It creates one Meta rig with Stage origin and passthrough underlay, waits for OpenXR, rejects competing rigs, and composes feature-owned installers through a typed registry/context. The original scene script GUID is preserved. Capture/guide/scene/storage branches supply their own features; this foundation does not fabricate them.
- Inspected official Meta Core 205, Unity OpenXR 1.18, XR Management 4.5.4 and XR Hands 1.7.2 package sources. Added explicit XR Hands 1.7.2 (Core's declared dependency). Android setup uses the actual public loader/feature APIs, generates URP assets and applies ARM64/IL2CPP/Vulkan/HandsOnly/passthrough settings. No Unity/UPM resolution or lock is invented. Native voice is unchanged.
- Added Android APK, EditMode and PlayMode wrappers with unique result directories, nonempty passing-test checks, actual APK/report verification and missing-editor failure. Added a bounded, memory-only native bearer adapter with URL policy, lifecycle cancellation and stale-generation suppression; no certificate bypass or credential logging. Actual pure C# network policy/expiry harness passed using the temporary .NET 8.0.425 SDK. Unity PlayMode lifecycle tests are authored but unexecuted.
- Automated uncommitted-worktree evidence: `pnpm check` passed 47 tests, typecheck, web/server/vision build and static GUID check; focused auth includes a real loopback WebSocket upgrade test (native bearer, browser Origin/cookie and negative cases). `pnpm validate:fixtures` passed the 61-frame synthetic fixture. Vite retains its existing large-chunk warning. These results do not establish native compilation, APK success, headset transport or physical transfer.

### 2026-09-19 — Task 5 visual inspection pipeline (in progress)

- Replaced the vision skeleton with authenticated bounded image decoding, one active job, capped duplicate waiters, cancellation/deadlines and strict Responses output handling. Default mock remains explicitly unavailable; injected synthetic test providers carry mock provenance. No live provider calls or real images were sent.
- Added delegated service/transport schemas while preserving task 2's canonical scene and recording contracts; base64 JSON has a precise HTTP cap and full JPEG/PNG decode, dimension/hash validation and metadata stripping. Main-server coordinator binds paused guide identity, source session/frame, one-use nonce, original deadline and reviewed references; findings cannot resume/complete motion.
- Consulted official Responses image/structured-output documentation and actual Meta MRUK 205 package source. Added source-only camera readback with lifecycle cancellation and a pure freshness gate. .NET harness passed fresh/stale/duplicate/stall/cancel/restart/clock cases. This is not Unity compilation or headset evidence.
- Initial checks: 30 vision/service tests plus 7 coordinator tests and workspace typecheck passed. Two-process failure/recovery smoke, final review and full gates follow before delivery.
- Follow-up evidence: pinned Unity 6000.3.24f1 appeared at the default Hub path during this run (not installed by this task). All four real `quest:setup`, `quest:test`, `quest:test:play`, `quest:build` attempts exited 198 before import: no valid Unity Editor license/headless entitlement. This supersedes the earlier absent-editor note; no native gate passed.
- Compiled `Runtime/Network` against that editor's real Unity Core/WebRequest/JSONSerialize managed DLLs through the .NET netstandard2.1 diagnostic project: zero warnings/errors. This is a managed API compile, not Unity import or IL2CPP proof. Actual HTTPS pairing with a test-generated certificate and Secure cookie also passed; production code does not bypass certificate checks.
- Desktop fixture: initial parallel Playwright run had one existing 3-second health timeout under concurrent load (2/3 passed); isolated `E2E_PORT=3102 pnpm test:e2e --workers=1` passed all 3. Added E2E_PORT override and per-port data isolation without weakening assertions/timeouts. Added sharp 0.34.5 to the server on task6's request for decoded reviewed-reference validation; lockfile install passed.
### 2026-09-19 — Task 4 guide integration and adversarial checks

Integrated published shared-contract, capture/calibration and native-platform
branches without duplicating their implementations. Guide preload now uses the
canonical ready tutorial/hash binding and copied execution values. The feature
registry binds real workspace observation/calibration events, timestamp replay,
separate ghost cues, physical fingertip controls and shared read-only telemetry.
A synchronous inspection-pause acknowledgment preserves the same event sequence;
visual findings have no completion or resume input. No voice code was changed.

Actual .NET 8.0.425 checks pass 24 reducer/session scenarios plus shared fixture →
rotated independent calibration → pose projection → guide → strict telemetry
round-trip, including a golden phase trace. Contracts, domain and runtime adapter
code compile as separate assemblies. Native Unity components are not covered by
that compile. Unity appeared during the concurrent work; coordinator evidence
reports license exit 198, superseding the earlier absence-of-editor observation.
Full final pnpm/browser and native wrapper results will be recorded on delivery.
Task 3 integration verification: merged published contracts (through af35981)
and native platform f626cd3. Full `pnpm check` passed strict typechecks, 144 tests,
production builds and 74-asset static quest validation; `pnpm validate:fixtures`
passed the synthetic 61-frame recording. Isolated `E2E_PORT=3403 pnpm test:e2e
--workers=1` passed all three Chromium scenarios after the initial parallel run
had one transient health-read failure despite HTTP 200; no check was weakened.
Actual C# domain fixtures pass against the merged sources. Runtime capture,
XR adapter, presentation and Unity test sources compile against actual Unity
6000.3 DLLs plus official XR Hands 1.7.2/Core Utils 2.2.0 sources, without stubs;
only the dependency's JsonUtility DTO-field warnings remain. This is SDK API
compilation, not native runtime/import success. Added a reusable compile harness.
Review fixes cover duplicate record starts, invalid completion clocks, explicit
runtime text fonts, selected guide hand and discontinuous short-path cues.
Unity became installed externally mid-task. First test attempt failed licensing
(exit 198); a later external activation allowed the retry to enter real package
import. Its final result follows separately. No physical/provider evidence yet.
- Follow-up evidence: pinned Unity 6000.3.24f1 appeared at the default Hub path during this run (not installed by this task). All four real `quest:setup`, `quest:test`, `quest:test:play`, `quest:build` attempts exited 198 before import: no valid Unity Editor license/headless entitlement. This supersedes the earlier absent-editor note; no native gate passed.
- Compiled `Runtime/Network` against that editor's real Unity Core/WebRequest/JSONSerialize managed DLLs through the .NET netstandard2.1 diagnostic project: zero warnings/errors. This is a managed API compile, not Unity import or IL2CPP proof. Actual HTTPS pairing with a test-generated certificate and Secure cookie also passed; production code does not bypass certificate checks.
- Desktop fixture: initial parallel Playwright run had one existing 3-second health timeout under concurrent load (2/3 passed); isolated `E2E_PORT=3102 pnpm test:e2e --workers=1` passed all 3. Added E2E_PORT override and per-port data isolation without weakening assertions/timeouts. Added sharp 0.34.5 to the server on task6's request for decoded reviewed-reference validation; lockfile install passed.
- Final source review aligned the setup with Meta Core 205's required OVRInput profile rule by enabling the verified Oculus Touch profile ID, without adding a second provider or using controller poses as hand evidence. Disabled app-requested recentering on the Stage rig; system-origin changes still require feature-owned invalidation/recalibration. These native settings remain license-blocked for editor/device execution.
- Native entitlement retry progressed into real package import. Task4's completed SDK compile exposed CS1069 errors in Meta Core/Interaction for exactly UnityEngine.AnimationModule and UnityEngine.AssetBundleModule. Added their built-in 1.0.0 modules centrally; no external package upgrade. Stopped only this worktree's still-resolving setup process to apply the repair and retry. License activation is no longer the current final blocker; import/build results remain pending.

Task 4 verification update: full workspace check passed 145 TS tests, strict
checking, production builds and static native GUID/purity checks. Fixture
validation passed; isolated port 3105 Chromium smoke passed 3/3 with one worker.
Release .NET guide checks pass 24 scenarios and the bound golden integration;
new pinned .NET CI workflow passes actionlint. Added actual Unity lifecycle test
and explicit runtime font/active-hand rendering; the source/clock are injected
synthetic data, never headset evidence. Own Unity EditMode now resolves licensing
and imports packages, but first failed Animation/AssetBundle SDK module imports,
then after platform 5250e30 failed Physics2D/ParticleSystem SDK requirements.
Platform owner is repairing the manifest; no native pass or APK claim yet.
- Added an isolated .NET 8 CI workflow for the actual pure C# network policy harness, pinning setup-dotnet v4 to the official resolved commit. This intentionally does not label the separate policy harness as Unity/IL2CPP validation.
- The next real SDK compile exposed ParticleSystemRenderer and Physics2D references; added only their required built-in particlesystem/physics2d 1.0.0 modules. Unity 6000.3.24f1 produced the checked-in `packages-lock.json`; every direct manifest pin matches its actual resolved version. Explicit Test Framework pin is now 1.6.0 because Unity resolves that built-in version. Complete native tests remain pending; Android Build Support is absent (only MacStandaloneSupport installed).

### 2026-09-19 — Task 6 native preload, references and integrated relay

- Added exact-byte native chunk upload/finalization to preserve C#/JS JSON spelling while validating the same canonical Recording and metadata. Native platform feature persists captures, retries private pending uploads, lists/downloads immutable ready guides in bounded chunks, validates cache bytes and calls the real GuideController.Preload; fresh learner calibration remains required. Added world-space upload/library/preload controls and a provider-neutral revision-bound label output boundary.
- Reference uploads now decode PNG/JPEG through pinned sharp with pixel/byte/hash limits and bind to reviewed recorded checkpoint frames. Atomic tutorial wrappers carry approved references; edits invalidate approvals and ready publication rebinds the final revision. The actual visual coordinator uses this resolver and the relay's exact fresh paused/calibrated identity. Added native HTTP guide-event acknowledgment, role-scoped browser `/api/ws`, bounded queues, reconnect snapshot and stale display. TLS certificate/key file configuration uses actual HTTPS without proxy trust.
- Automated focused evidence: six storage/reference/real-WebSocket tests passed; twelve actual C# private-cache behavior checks passed. Native storage/guide/capture/contract/network sources compiled with zero warnings/errors against installed Unity 6000.3.24f1 managed DLLs. Browser fixture scenarios all passed on the first expanded run; authoring reached editing and exposed a test locator issue, now repaired and awaiting rerun. Full gate and own Unity Editor run continue; no headset, live provider, camera-source or physical LEGO validation is claimed.
### 2026-09-19 — Task 5 native inspection and integration hardening

- Composed actual platform/guide dependencies: Order30 installs an exclusive MRUK source and fresh-hand world-space controls. Check pauses through the real GuideSession/shared sequence, acknowledges the canonical snapshot, then obtains nonce-bound pixels. Owned GPU copy/readback preserves sensor frame identity; permission/focus/pause, source stalls, guide changes, deadlines and receipt age suppress obsolete results. Strict C# transport uses the canonical parser. Voice remains an event hookup only.
- Main/service review added strict duplicate-key parsing, capped upload readers and reference resolution, response-disconnect cancellation and retired-session replay protection. Full decode bounds include APNG refusal. Focused 38 TS tests and actual .NET freshness/transport harness pass. Real two-process mock smoke covers correct/wrong/obscured, exact cancellation and process kill/restart without taking down main. No real pixels/provider calls were sent.
- Integrated published canonical contracts, capture/guide/platform branches with normal merges and retained all historical logs. Unity became available and licensed externally: first actual editor attempt failed on SDK module dependencies. Consumed platform d23754a with Unity-generated lock and explicit Physics2D/ParticleSystem/Test Framework repairs; new editor attempt running. Android Build Support is absent. Editor, synthetic, provider and physical evidence remain separate.

TRAIL-03 final software validation: retained parsed pose doubles for re-export, added sidecar identity binding and regeneration drift tests, and documented versions/migration/native representation limits in `docs/contracts.md`. Fixed strict TS array/fixture-union diagnostics found by the full gate without changing schemas. `pnpm check` passed (148 tests, typechecks, app builds and native static check), `pnpm validate:fixtures` passed, 124 contract tests passed, and the actual .NET parser harness passed 113 checks. Three Chromium fixture scenarios passed on isolated port 3103 with an owned temporary data directory; the server was cleaned up. The existing Vite large-chunk warning remains.

Unity became available externally during this run. Full-project `pnpm quest:test` on the baseline manifest failed before tests on vendor CS1069 diagnostics requiring Animation and Asset Bundle modules; native-platform owns that repair. A minimal temporary project containing the unchanged production Contracts/Motion and their tests passed 5/5 EditMode tests in Unity 6000.3.24f1 with Test Framework 1.4.6. The repeatable `pnpm --filter @trail/contracts test:unity-isolated` runner records source hashes, setup and result XML; its verified run began 2026-09-19T18:00:43Z with 32 copied/hashed production/test files, all five passed. The temporary project and logs are outside Git; import-generated full-project settings/lock were preserved outside this PR for the platform owner. No Android IL2CPP build, live provider, headset or physical LEGO/transfer claim. Contracts PR remains independent against main, to be consumed before the capture, guide, authoring and inspection PRs.

- **Task 5 final software gate update:** `pnpm check` passed typecheck, 188 tests, production builds and native static checks after consuming final canonical contract fixes. Focused scene/service suite has 38 tests; portable .NET freshness/strict transport harness and actionlint pass. Fixture validation passes the existing 61-frame synthetic recording. First browser runs were 2/3: valid 200 health responses were followed by the existing client timeout during startup; diagnostic instrumentation confirmed AbortError, with no production/test timeout changes. Retry after imports remains pending.
- **Native evidence correction:** The repaired Unity project compiled actual Trail.Scene/Scene.Tests and all dependency assemblies against MRUK. The full editor test run is still importing package assets. Android SDK/NDK/OpenJDK were found in the sibling PlaybackEngines path; the earlier absence claim was incorrect. Parent coordinates the final combined APK build in task 6, avoiding redundant heavy builds. No native test/APK/device success is inferred from compilation.
- **Integration test repair:** Task6's combined run exposed a race in the ignored-abort provider test: its 30ms real timer could expire during sharp decode before the fake provider installed its completion callback. Repaired with controlled timers advanced only after actual provider entry; the deadline and production code are unchanged. All 20 focused inspection cases pass after the repair.

Task 6 verification update: all four real Chromium scenarios now pass on isolated port 3107, including cookie pairing, upload/compile, review of four steps, immutable finalize, reload and authenticated spectator reconnect with a native HTTP snapshot. Inspected the full-page authoring screenshot. Added and passed integrated storage-reference → exact paused-guide admission → real vision HTTP test with an explicit mock assessment; resume rejects a new inspection. This is synthetic desktop/service evidence, not live model or headset validation. Full combined check initially passed 197/198 tests; the vision owner repaired a deterministic test-race exposed by load (provider admission could occur after its 30ms test deadline). Re-running full gate with two test workers, preserving all tests and production deadlines. Spectator freshness now uses server-relative age plus browser monotonic elapsed time, avoiding cross-computer wall-clock skew.
- Corrected toolchain discovery: AndroidPlayer with SDK/NDK/OpenJDK exists beside the editor bundle at `Editor/6000.3.24f1/PlaybackEngines`; the prior absence note checked only `Unity.app/Contents/PlaybackEngines`. Real build execution, not that incomplete directory check, determines availability. Trail runtime/editor/test assemblies have compiled in Unity; setup is finishing initial package asset imports.
- Native setup review found that OpenXR requires the new Input System (the editor default was legacy-only); setup now applies the actual serialized setting used by Unity's package. Meta also auto-generates a disabled local DevAgent resource containing a machine credential. Excluded that generated asset and metadata from Git, and added setup/final-build sanitization to clear the disabled tool's credentials/address before packaging. No application voice/provider implementation was changed.
- Implemented visible native setup: a world-fixed head-directed 0.9-second dwell keyboard for bounded HTTPS endpoint and masked role-code input, explicit development USB preset, Pair, state/role, Disconnect/re-pair and UI-only recenter. It adds no hand provider or guide authority. Code clears on submit/pause/focus loss; endpoint/credentials remain memory-only. Actual pure C# input policy tests pass. Unity EditMode ran 2/2 passing against the imported project and compiled the new UI/runtime; PlayMode keyboard/lifecycle interaction tests are running. Physical legibility/dwell comfort are unverified.
- **Task 5 desktop/native results:** All three unchanged Playwright scenarios passed on isolated port3106 once initial import contention subsided; the earlier health AbortError was not repaired by weakening checks. Real Unity EditMode passed17/17, including all4 scene freshness tests, against MRUK205 and Unity6000.3.24f1. Final cached EditMode/PlayMode run follows the last callback ownership/null guard hardening. Findings validation also rejects numeric coordinate/distance instructions; focused assertions cover that boundary.
- **Task 5 final native gate:** Frozen-source Unity6000.3.24f1 runs passed17/17 EditMode (including4 Scene freshness tests) and4/4 PlayMode lifecycle tests. Artifacts: `test-e9359dda-943f-4c05-9d41-0136304d24c3` and `test-play-63a333a7-7a35-42fc-a0fc-455fd37919dc` under ignored `artifacts/quest`. Editor-generated settings/assets were preserved outside tracked source; platform-owned settings were restored unchanged. This establishes real editor compilation/tests, not Quest capture or physical transfer. Final combined Android build remains coordinated by task6.
Task 4 actual native evidence: full-project Unity EditMode passed 10/10 tests and
PlayMode passed 4/4, including the real GuideController/CaptureReplaySession
lifecycle with injected synthetic hand events, independent calibration, ordered
completion, inspection pause, resume, Repeat and origin reset. These runs compiled
actual Unity/Meta assemblies and imported real packages; they do not establish
physical/headset behavior. Android tooling was subsequently found in the editor's
sibling PlaybackEngines directory, correcting the earlier absence claim. Parent
assigned final combined IL2CPP build to task 6 to avoid duplicate heavy builds.

Storage integration review added RebindTelemetrySession: same server session
preserves sequence; a new session changes only the telemetry envelope. It publishes
a full snapshot without mutating the loaded guide. The actual C# golden integration
passes both recovery cases; refreshed Unity tests include the paused re-pair path.
Final contracts 3d629fa and capture capacity fixes are integrated. Native/source
checks are rerunning for this last recovery change; prior native passes remain
at their explicitly recorded revisions.

Task 6 full software gate passed 199 tests, strict workspace/tool typechecks, production builds and scaffold checks with VITEST_MAX_WORKERS=2 (concurrency only; no omitted assertions). Fixture validation follows. Reviewed actual native re-pair recovery: added a call to the guide owner's tested RebindTelemetrySession on Ready, preserving local run/calibration/attempt and same-session sequence while allowing a new server session envelope. Native private-cache behavior is now part of a pinned .NET CI workflow. Native final combined candidate awaits the platform owner's generated settings/security update before the single coordinated ARM64/IL2CPP attempt.
- Unity setup completed successfully with actual generated Android/OpenXR/URP/Meta assets; committed those settings and preserved GUIDs. New Input System is enabled, required headset-camera manifest capability is declared for task5's explicit runtime permission flow, and disabled SDK AgentBridge credential/address fields were verified empty after setup. Standard Unity YAML trailing spaces were normalized without changing values. Empty duplicate SDK-created folders were omitted.
- Actual Unity 6000.3.24f1 results: EditMode2/2 passed, PlayMode2/2 passed, then PlayMode2/2 passed again after enabling the new Input System and applying the final setup. Tests cover coordinate basis, native connection pause/disable, and head-directed keyboard entry/code clearing. These editor results do not prove Quest ergonomics, tracking or physical transfer. Final combined APK remains task6-owned; baseline platform build is attempted separately.
- **Task 5 final dependency recheck:** PR #10 is stacked on guide #7. After consuming guide recovery1ed9659, final source94347c3 passed Unity17/17 EditMode and4/4 PlayMode. Results are `test-2c418f04-2873-48f6-89d9-5257d9491952` and `test-play-4f7dd709-2dec-4301-8d41-be0b3df90d66`. Local workspace check passed188 tests/typechecks/builds/static checks; hosted pure C# scene, guide, capture, network and workflow checks passed. Final app composition/combined APK belongs to task6; no hardware/provider success claimed.
### 2026-09-19 — Task 4 final guide verification

Final guide source at `1ed9659` passed full-project Unity 6000.3.24f1 EditMode
13/13 (`2026-09-19 18:10:58Z`) and PlayMode 4/4 (`18:11:42Z`). The PlayMode
scenario uses the actual native controller/capture/ghost adapters with injected
synthetic samples and verifies same/new-session telemetry recovery while paused.
Later capture merge `9a5befa` adds test tooling only; guide sources are unchanged.
Full `pnpm check` passed 157 tests, typechecks/builds and static metadata checks;
fixture validation passed. Release .NET passes 24 scenarios plus the shared
fixture/calibration/golden telemetry integration and re-pairing assertions.
Playwright regression uses isolated 3105 and one worker. Workflows pass actionlint.

Archived this run's generated XR/default editor settings under ignored artifacts
and restored the tracked build-settings file; canonical platform settings/locks
remain task 1's ownership. Parent assigned the final combined APK/IL2CPP build to
task 6; no build or device success is inferred from editor tests. No provider,
headset, physical LEGO or independent learner evidence exists for this task.

- Review repair: pairing codes now bind role/session and browser/native client kind. Bootstrap explicitly issues a browser-author code; author issuance accepts an explicit client (default native). Browser Origin/Fetch Metadata requests cannot exchange native codes for raw bearer credentials. Eight focused auth tests and server typecheck passed. Native 401 now increments the transport generation and aborts every other in-flight request before clearing the session/notifying consumers; real Unity-managed adapter compilation passed. Added a deterministic two-concurrent-request PlayMode regression, pending execution while the earlier baseline APK build owns the editor.
- Verified an additional setup finding in exact XR Hands/OpenXR package sources: XR Hands HandTracking and MicrosoftHandInteraction share a feature ID. The generated Android settings had enabled the Microsoft profile while leaving the joint subsystem disabled. Setup now selects the concrete XR Hands type and disables the Microsoft profile. Actual setup reapplication and native test execution follow the running baseline toolchain build; that earlier build cannot validate this repair.
- Added a final Android prebuild guard requiring one automatically initialized OpenXR loader, the concrete enabled XR Hands HandTracking subsystem, and enabled Meta/Quest/Touch support. New isolated platform EditMode tests assert the actual configured feature type and prove that an enabled Microsoft profile cannot substitute for disabled XR Hands. Static scaffold checks pass; actual Unity compile/test pending. Full pnpm check after client-binding repair passed 49 tests and all type/build/static gates.
- **Task 5 combined-auth smoke repair:** Platform881bbd7 correctly rejects browser fetch metadata during native pairing. The real two-process test now exchanges its native code with node:http instead of Node fetch, which automatically sends Sec-Fetch-Mode:cors. No production authentication changed. The complete two-process scenario passed against both the current pairing source and the exact stricter881bbd7 source (temporarily applied then restored); tools/test typechecking passed.
- Actual repaired platform evidence on Unity 6000.3.24f1: setup passed (setup-f67aad52), EditMode4/4 passed (test-b760c6d8) including concrete-subsystem/prebuild rejection tests, and PlayMode3/3 passed (test-play-60ebd226) including the concurrent401 cancellation regression. Committed the actual generated HandTracking-enabled/Microsoft-disabled Android flags. Quoted empty TagManager entries explicitly: bare empty sequence items produced a Unity parser warning after whitespace normalization; the quoted representation imported without parser errors.
- Baseline08fd3a7 development Android attempt completed IL2CPP/native compilation and linking but failed Gradle packaging with “Gradle build daemon has been stopped: stop command received.” No APK was verified. No stop command was issued by this task; a shared-daemon interaction is suspected, not established. Task6 owns the combined final APK attempt with a private Gradle user home. Hosted software/browser/policy checks all passed on8190aaf. No device, live provider or physical transfer validation.

### 2026-09-19 — Task 6 final combined delivery evidence

- Completed client-bound browser/native pairing issuance and a separately paired read-only spectator. Final full software gate passed 200 tests, all typechecks/builds/static checks and fixture validation; Chromium passed 4/4 on isolated port3107. Production private-cache harness passed12 checks and its pinned hosted workflow is green. Real two-process inspection uses synthetic images and an explicit mock; no live-provider evidence is claimed.
- Combined native candidate `d9f177fb11734da7218b3a305d931a3b33c5c170` includes final platform6a8a302 (concrete XR Hands feature, prebuild guard, client-bound pairing, concurrent401 invalidation and parser-safe TagManager), contracts3d629fa, capture/guide recovery and vision29ce5ee. Actual Unity6000.3.24f1 setup and final EditMode20/20 plus PlayMode6/6 passed. Final XML directories: `test-fcff0eb9-412b-4302-98ac-2c85982ae5f6` and `test-play-5d9c5b87-2799-44b2-a3c5-f30e2956122f` under ignored `artifacts/quest`. All306 recorded native/shared input hashes match the restored committed source.
- The final development Android ARM64/IL2CPP build succeeded with a private `GRADLE_USER_HOME`; build/report/APK are in `artifacts/quest/build-92bd5665-2fa2-411c-b533-ee590061f37d`. APK size84,035,500 bytes; SHA256 `eda0603f83e43bf0b5174ea4568882f264b29c6c1fae17dc0c942ac52a449481`. Android build tools confirm `com.trail.guide`, minSDK32/target36, only arm64-v8a native libraries including libil2cpp, and a valid v2 signature. Final import contains no TagManager parser failure. Source manifest is `artifacts/combined-d9f177f/sources.json`; generated build/editor state is preserved outside tracked source. The earlier combined candidate also built successfully; final evidence above supersedes it.
- These are software, synthetic desktop, real editor and APK build results. The APK has not been installed on Quest; fresh capture/calibration/transfer, camera pixels, simultaneous microphone/tracking, live providers, physical LEGO and a novice run remain unvalidated. Native guidance remains the only progression authority. Voice PR3 was not changed. Existing Vite bundle warning remains. No PR was merged or deployment performed.
## 2026-09-19 — Task 3 final native and delivery evidence

The actual full project now imports and compiles in externally installed/licensed
Unity 6000.3.24f1 after native-platform's module/real-lock repair d23754a. With
final shared contracts 3d629fa, `pnpm quest:test` passed 11/11 and
`pnpm quest:test:play` passed 4/4. The latter instantiates the real capture installer,
separate articulated ghost prefab and fonts/materials, checks no duplicate source
and no ghost colliders, and exercises capture/calibration/replay invalidation
with explicitly synthetic hand observations. Latest PlayMode evidence is
`artifacts/quest/test-play-7aa7d645-f308-4f06-9158-cb183caeec72/results.xml`.
Isolated real Unity source-hashing runner passes EditMode 6/6 and PlayMode 2/2;
full-project results are distinct and stronger import/composition evidence.

Added a serialized 31 MiB motion budget via the canonical frame writer, preserving
a saveable accepted prefix plus visible StopReason before the 32 MiB parser ceiling;
actual C# regression passed. Explicitly admit only the official OpenXR Hands
provider; non-Android/Editor sources remain synthetic. Continuous pure C# capture
CI is green. Runtime source is stable from 1b2d095, with final contract dependency
and composition tests added afterward. .NET fixtures continue to pass.

The final pnpm pass after contract integration passed 157 tests/typechecks/builds;
its static tail encountered Unity's empty generated StreamingAssets folder before
metadata existed. Removed/backed up only validation-generated files, restored only
the engine-generated EditorBuildSettings delta, and reran the normal available gate.
Generated platform settings/assets are preserved under ignored artifacts, not in
this PR; platform owns their canonical publication. Existing Vite size warning
remains. Prior desktop smoke passed 3/3; hosted branch checks including C# capture
and network are green before this documentation-only completion update.

PR #6 is stacked on shared-contracts PR #8 and also includes platform PR #5 dependencies.
Merge those before capture, then the dependent guide/authoring/inspection work.
Android support was found externally and the coordinator assigned the combined
APK build to task 6; no APK result is preclaimed here. No headset, native live
hand capture, physical LEGO/independent-user transfer, provider, or timing-accuracy
claim follows from these editor/synthetic checks. No voice implementation changed.

Task 4 final base synchronization: merged capture's final `9cf0bd7` without
changing production guide source. Preserved both tasks' log entries and reran
the expanded full PlayMode suite: 5/5 passed in Unity 6000.3.24f1, including the
new real capture prefab/control composition test alongside the guide recovery
scenario. Archived only this rerun's generated platform assets/settings. EditMode
13/13 and other passing checks are reused for unchanged inputs.

- **Task 5 final stack synchronization:** Merged guide88508b2 non-rewriting and preserved both work-log histories. Incoming changes add the capture prefab/control PlayMode test and validation documentation; no production runtime source changes. The expanded PlayMode suite and hosted executable gates are being verified on this merge; prior EditMode/software results are reused only where inputs are unchanged.

Task 6 final stack synchronization: merged inspection7aba4b2 at `705bb5c`, retaining all work-log entries. All306 previously tested native/shared hashes still match APK candidate d9f177f; only the five new CapturePresentation test/assembly/meta files were added. Re-ran the affected expanded Unity PlayMode suite:7/7 passed (`artifacts/quest/test-play-4629a968-2aba-4238-8bc6-79abfaa850a1/results.xml`). Production/settings/shared inputs are unchanged, so the verified APK and EditMode20/20/software evidence remain applicable. PR11 remains ready and mergeable against the synchronized inspection base. Generated editor whitespace/metadata was preserved outside tracked source and restored.

TRAIL-03 review follow-up: `MotionChunk` now rejects non-increasing `tMs` within a chunk in both Zod (`refine`) and pure C# (`ContractValidation.Validate(MotionChunk)`, wired through the generator's semantic set); cross-chunk ordering remains a storage-coordinator concern. Two corpus cases (duplicate and decreasing chunk timestamps) cover parity. `pnpm check` passed (150 tests) and the .NET harness passed 115 checks; no Unity, IL2CPP or headset claim.

TRAIL-04 review follow-up: capture panel labels now arm after a 0.6 s fresh index-tip dwell and execute only on a tracked withdrawal, matching the on-screen instruction; tracking loss, stale or non-monotonic samples and drift to another label cancel the armed state. Merged the contracts chunk-order fix from `codex/shared-contracts`. `pnpm check` and the .NET capture harness passed; the panel is a MonoBehaviour, so this is unverified in Unity/headset. Manifest/lockfile ownership and Unity CI gates remain open for the platform owner.

TRAIL-05 review follow-up: `Preload` now loads the recording into capture before dispatching `Preloaded`, so capture's synchronous invalidation is absorbed by the Preload phase and the first attempt stays `attempt-1`, revision 1. Merged the capture-panel and contracts fixes from `codex/capture-calibration-replay`. Guide harness passed (.NET; not Unity/headset). The user-confirmed-while-occluded question (reviewer P1 versus the existing `ManualOcclusion` scenario) is left for a product decision.

TRAIL-07 review follow-up: vision re-encodes uploads in their source format (JPEG stays JPEG at quality 92, PNG stays PNG) so a realistic 1280×960 camera JPEG is no longer rejected for exceeding the PNG size ceiling; a noisy-JPEG test covers it. The coordinator's retired live-session memory is a bounded FIFO instead of a hard `busy` after 64 transitions. Non-success provider responses cancel their body. A GPU readback error on the current ticket now releases the copy slot and reports `readback-failed` immediately instead of waiting for the inspection timeout (MonoBehaviour path; unverified in Unity). Merged the guide/capture/contracts fixes from `codex/local-guide-progression`. `pnpm check` and the .NET scene harness passed; Unity CI gates remain open for the platform owner.

## 2026-09-19 — PR #11 babysit: authoring/storage review findings

- Caught `codex/tutorial-authoring-storage` up with `codex/visual-inspection` (append-only log conflict kept both sides).
- `PrivateTutorialCache.LoadLatestCapture` restores the newest valid `capture-*.json` at startup so a saved demonstration survives an app restart before upload; corrupt files are skipped. Covered by the .NET storage harness (14 checks).
- `SpectatorRelay` evicts the oldest retired run instead of rejecting all new runs after 128; server test drives 140 runs and still rejects a retired run.
- Authoring workbench disables all controls during async save/finalize/import, and only trusts `trail-pending-upload` while `/api/recordings/uploads/query` still lists it; stale pointers are cleared.
- `authoring.ts` keeps adjacent equal-time markers contiguous as half-open ranges and rejects empty steps; motion test added.
- Automated evidence: `pnpm check` green, storage and relay harnesses green. No Unity Editor/PlayMode, Android IL2CPP, or headset evidence.

## 2026-09-19 — PR #7 babysit: tracking loss cannot confirm

- `GuideReducer.Confirm` and `GuideControlPanel` no longer accept user confirmation in `TrackingLost`; confirmation resumes after reacquisition (Guiding/Holding). The `ManualOcclusion` scenario previously asserted the opposite and was realigned with the product invariant that tracking loss cannot complete a step.
- Automated evidence: guide-harness (.NET) green. No Unity Editor/PlayMode or headset evidence.

## 2026-09-19 — PR #10 babysit follow-up: retired live sessions never forgotten

- Review finding: FIFO eviction of retired `liveSessionId`s let a forgotten identity be replayed with a higher caller-supplied epoch. `InspectionCoordinator` now keeps retired identities for the current paired session in a fixed 16 KiB Bloom filter (no false negatives, constant memory); history for other paired sessions is dropped because they never pass `isCurrent`. Server test drives 300 transitions and confirms early, middle and latest retired identities stay rejected while a fresh identity is accepted.
- Automated evidence only (`pnpm check`); no Unity/headset claim.

### 2026-09-19 — PR10 inspection-session review repair

Verified the remaining Bloom-filter review finding against current head72601d3.
Replaced accumulated retired IDs with one server-issued current lease. The new
learner-authenticated session endpoint requires the exact paused context; native
Check/Retry obtains its lease after pause acknowledgment, then sends it in the
existing start contract. Superseded/fabricated identities remain stale regardless
of request epoch. Fixed memory use no longer trades replay rejection for false
positives. Native transport parsing and additive endpoint migration are documented.

Focused tests passed50,000 rotations plus old-identity/epoch/generation/scope
rejection, exact cancellation and two-process crash/recovery. The .NET harness
passed strict lease parsing, duplicate fields and unsupported version rejection.
Real Unity EditMode/PlayMode and Android ARM64/IL2CPP gates are being run for this
runtime change; no hardware/provider validation is inferred. Review comments are
not replied to or resolved without explicit user authorization.
## 2026-09-19 — PR #7 babysit verification follow-up

Synchronized published head `2fc8d4a`; both prior review threads are resolved,
all hosted checks pass, and the actual capture base has no conflict. Verified
that preload invalidation stays in Preload and user confirmation excludes
TrackingLost. Added real-adapter PlayMode assertions for initial attempt 1 and
revision 1, and corrected the native guide documentation's stale occlusion rule.

Actual local Unity 6000.3.24f1 EditMode passed 13/13 at 20:21:55Z and PlayMode
passed 5/5 at 20:22:33Z, including the new assertions. Results are in
`artifacts/quest/test-53e0fe31-0229-4409-ae1e-7e4d1ba0b051/results.xml` and
`artifacts/quest/test-play-c7924ded-7346-4a5a-8a9f-f1a27ee223b4/results.xml`.
The .NET Release guide harness passed 24 scenarios and golden/rebind integration;
static scaffold validation passed 97 GUIDs. Reused passing hosted workspace,
fixture, browser and workflow checks for unchanged inputs; final-head CI follows
the push. Archived only this run's generated Unity settings/assets. Combined
Android build remains with integration; no headset or provider evidence is claimed.

PR10 repair verification: production source `f727100` passed full workspace
checks (191 tests), synthetic fixtures, three Chromium scenarios, the Release
.NET scene harness, actual Unity6000.3.24f1 EditMode17/17 and PlayMode5/5.
Actual Android ARM64/IL2CPP build succeeded, producing a69,265,189-byte APK
with SHA256 `d948fd9496be4a097561c47783d27fd518bb8bc24a830682a9b4826fd2c1d3db`.
Build report and source hashes are retained in ignored artifact directory
`build-85dd9b3e-b71f-4ffb-aeda-3141cea27e6f`. After normal base merge `c1cfc40`
added two test assertions/docs only, actual PlayMode reran and passed5/5
(`test-play-c37ea019-535d-414c-a792-76bfd08f0810`); player inputs are unchanged.
Hosted executable gates passed at `c1cfc40`. Both sides of the shared log were
preserved. Detailed commands and local evidence paths are in
`docs/visual-inspection.md`; no hardware/provider success is claimed.
## 2026-09-19 — PR 6 babysit: control withdrawal regression

Verified the current review findings against head dba0886. The package manifest
and lockfile changes originate in native-platform commits f626cd3, 5250e30 and
d23754a; both files exactly match platform PR #5. They are inherited dependencies
of this stacked PR, already owned separately by integration. PR #5 and the
shared-contracts base PR #8 remain prerequisites; the ownership thread needs
reviewer resolution rather than duplicated dependency edits here.

The follow-up control fix still executed the armed action when the next sample
hit another button. Added a synthetic PlayMode regression that failed on that
behavior, then required an outside-all-buttons sample to confirm withdrawal.
The regression also verifies dwell alone does not execute, confirmation happens
once, and tracking loss, gaps over 100 ms and non-increasing timestamps cancel.
Actual full-project Unity 6000.3.24f1 passed 5/5 PlayMode and 11/11 EditMode after
the fix. Results are in ignored artifacts/quest/test-play-f62733a5-3078-4b83-9c60-c3009593179b
and artifacts/quest/test-c30e20fd-998a-47ad-9e70-95c8526f9bf8. Generated settings
and assets were preserved outside Git; no platform configuration was changed.

The native-CI review remains an integration prerequisite: hosted workflows run
the pure C# harnesses, not Unity/Android, and GitHub currently reports no repository
Actions secrets or self-hosted runners. Local Editor tests are distinct from
hosted enforcement. The earlier combined APK predates this panel change and is
not claimed as current-revision ARM64/IL2CPP evidence. No headset or physical
transfer evidence, review reply, thread resolution, merge or deployment occurred.

Final local workspace gate passed `pnpm check` (159 tests, typechecks, production
builds and 78-GUID static check) and `pnpm validate:fixtures` (61-frame synthetic
recording). The existing Vite chunk-size warning remains. Desktop inputs are
unchanged by this C# panel repair; current-head hosted browser evidence is checked
separately after publication.

### 2026-09-19 — Babysit contracts PR #8

Fast-forwarded to the existing review repair `9ccf520`, verified matching TS/C# chunk-order checks and the already-resolved review thread. Reproduced a remaining regression-maintenance bug: fixture regeneration silently removed both new chunk-order cases. Added those cases to the generator and a temporary-directory regeneration test covering every shared fixture; the test failed before the fix and passed afterward. No wire format, runtime behavior or committed fixture changed. Final local signoff passed `pnpm check` (151 tests), fixture validation, 127 focused contract tests, 115 actual .NET parser checks, and 5/5 isolated Unity EditMode tests. Existing browser evidence is reusable because app/runtime/fixture inputs are unchanged; newly pushed hosted checks are verified separately. Full-app Unity dependency limits and Android/headset/physical acceptance remain outside this evidence. No review replies, thread resolutions, bot invocations, merges or deployments were performed.

PR #6 catchup: merged base 1895f08 after an append-only work-log conflict, preserving both entries. Only fixture-generation tooling/tests changed upstream; native runtime inputs and the passing 11 EditMode/5 PlayMode evidence remain unchanged. The merged `pnpm check` passed 160 tests/typechecks/builds/static checks and fixture validation passed.

## 2026-09-19 — Stack babysit: guide base catch-up

Merged the actual capture base `9495c0e` into PR #7 without rewriting published
history. Preserved both append-only activity-log sections. This brings the
capture-panel drift cancellation regression and fixture-regeneration checks
into the guide branch; no guide behavior was changed by the conflict resolution.
The merged worktree passed `pnpm check` (160 tests), `pnpm validate:fixtures`,
24 pure C# guide scenarios plus golden integration, and 115 C# contract checks.
Unity validation is running separately; this entry is not new Android, live
provider, headset or physical-transfer evidence. PR #6 is concurrently validating
its newer main catch-up, which will be checked before the final stack report.

Stack guide verification for source `31903fa`: Unity 6000.3.24f1 passed 13/13 EditMode and 6/6 PlayMode tests in `artifacts/quest/test-56878b9c-4990-41cf-86ff-5bf612621b58` and `artifacts/quest/test-play-db5ba2f7-8e3f-494c-8d01-861f2d472c8d`. The first Chromium run failed the health-request timeout while native imports/builds were active; an unchanged isolated rerun passed 3/3. No timeout/assertion was weakened. Engine-generated settings were archived under ignored artifacts. Android validation of the updated base remains in progress in the capture task; no headset or live-provider claim.

## 2026-09-19 — Stack babysit: inspection base catch-up

Merged guide base `92b768b` into PR #10 and preserved both activity-log histories.
The combined worktree passed `pnpm check` (192 tests), fixture validation, actual
Unity 6000.3.24f1 EditMode 17/17 and PlayMode 6/6. XML evidence is in ignored
`artifacts/quest/test-d76ee5f4-12dc-469a-956c-40c7b8cbfae4` and
`artifacts/quest/test-play-d53c12e5-df2b-4ea9-a08f-11cc02dd6332`.
Browser inputs did not change in this merge; passing prior browser evidence is
reused. The earlier inspection APK predates the inherited capture-panel repair;
it is not current combined-player evidence. Final stack integration will check
the authoring test's inspection-session handshake and the newer capture base.
No review replies, thread resolutions, provider calls or headset tests occurred.

## 2026-09-19 — Stack babysit: authoring inspection integration

Merged inspection base `a6f9f25` into PR #11. Reproduced the real HTTP integration
test failing with `409 stale`: it still invented a live-session ID after the
inspection coordinator changed to server-issued leases. The test now obtains
a lease through the authenticated paused-guide endpoint, rejects an invented
ID, and completes the existing reviewed-reference/vision round trip.

The combined worktree passed `pnpm check` (206 tests), fixture validation,
4/4 Chromium scenarios, 14 pure C# storage checks, and the scene freshness and
strict transport harness. Actual Unity 6000.3.24f1 passed EditMode 20/20 and
PlayMode 8/8, including capture drift cancellation and guide preload identity.
XML is retained in ignored `artifacts/quest/test-4bf03b42-3970-45e0-8fcf-a132cfc827f0`
and `artifacts/quest/test-play-d94c4b1a-69d2-4a09-8da8-0aa03263273a`.
Unity changed only trailing whitespace in three tracked settings, which was
normalized back to the committed form. Combined Android build and final base
synchronization follow separately; no device, live provider or physical evidence.
- Corrected toolchain discovery: AndroidPlayer with SDK/NDK/OpenJDK exists beside the editor bundle at `Editor/6000.3.24f1/PlaybackEngines`; the prior absence note checked only `Unity.app/Contents/PlaybackEngines`. Real build execution, not that incomplete directory check, determines availability. Trail runtime/editor/test assemblies have compiled in Unity; setup is finishing initial package asset imports.
- Native setup review found that OpenXR requires the new Input System (the editor default was legacy-only); setup now applies the actual serialized setting used by Unity's package. Meta also auto-generates a disabled local DevAgent resource containing a machine credential. Excluded that generated asset and metadata from Git, and added setup/final-build sanitization to clear the disabled tool's credentials/address before packaging. No application voice/provider implementation was changed.
- Implemented visible native setup: a world-fixed head-directed 0.9-second dwell keyboard for bounded HTTPS endpoint and masked role-code input, explicit development USB preset, Pair, state/role, Disconnect/re-pair and UI-only recenter. It adds no hand provider or guide authority. Code clears on submit/pause/focus loss; endpoint/credentials remain memory-only. Actual pure C# input policy tests pass. Unity EditMode ran 2/2 passing against the imported project and compiled the new UI/runtime; PlayMode keyboard/lifecycle interaction tests are running. Physical legibility/dwell comfort are unverified.
- Unity setup completed successfully with actual generated Android/OpenXR/URP/Meta assets; committed those settings and preserved GUIDs. New Input System is enabled, required headset-camera manifest capability is declared for task5's explicit runtime permission flow, and disabled SDK AgentBridge credential/address fields were verified empty after setup. Standard Unity YAML trailing spaces were normalized without changing values. Empty duplicate SDK-created folders were omitted.
- Actual Unity 6000.3.24f1 results: EditMode2/2 passed, PlayMode2/2 passed, then PlayMode2/2 passed again after enabling the new Input System and applying the final setup. Tests cover coordinate basis, native connection pause/disable, and head-directed keyboard entry/code clearing. These editor results do not prove Quest ergonomics, tracking or physical transfer. Final combined APK remains task6-owned; baseline platform build is attempted separately.

- Review repair: pairing codes now bind role/session and browser/native client kind. Bootstrap explicitly issues a browser-author code; author issuance accepts an explicit client (default native). Browser Origin/Fetch Metadata requests cannot exchange native codes for raw bearer credentials. Eight focused auth tests and server typecheck passed. Native 401 now increments the transport generation and aborts every other in-flight request before clearing the session/notifying consumers; real Unity-managed adapter compilation passed. Added a deterministic two-concurrent-request PlayMode regression, pending execution while the earlier baseline APK build owns the editor.
- Verified an additional setup finding in exact XR Hands/OpenXR package sources: XR Hands HandTracking and MicrosoftHandInteraction share a feature ID. The generated Android settings had enabled the Microsoft profile while leaving the joint subsystem disabled. Setup now selects the concrete XR Hands type and disables the Microsoft profile. Actual setup reapplication and native test execution follow the running baseline toolchain build; that earlier build cannot validate this repair.
- Added a final Android prebuild guard requiring one automatically initialized OpenXR loader, the concrete enabled XR Hands HandTracking subsystem, and enabled Meta/Quest/Touch support. New isolated platform EditMode tests assert the actual configured feature type and prove that an enabled Microsoft profile cannot substitute for disabled XR Hands. Static scaffold checks pass; actual Unity compile/test pending. Full pnpm check after client-binding repair passed 49 tests and all type/build/static gates.
- Actual repaired platform evidence on Unity 6000.3.24f1: setup passed (setup-f67aad52), EditMode4/4 passed (test-b760c6d8) including concrete-subsystem/prebuild rejection tests, and PlayMode3/3 passed (test-play-60ebd226) including the concurrent401 cancellation regression. Committed the actual generated HandTracking-enabled/Microsoft-disabled Android flags. Quoted empty TagManager entries explicitly: bare empty sequence items produced a Unity parser warning after whitespace normalization; the quoted representation imported without parser errors.
- Baseline08fd3a7 development Android attempt completed IL2CPP/native compilation and linking but failed Gradle packaging with “Gradle build daemon has been stopped: stop command received.” No APK was verified. No stop command was issued by this task; a shared-daemon interaction is suspected, not established. Task6 owns the combined final APK attempt with a private Gradle user home. Hosted software/browser/policy checks all passed on8190aaf. No device, live provider or physical transfer validation.

PR #6 final catchup: PRs #5 and #8 merged while this run was waiting for checks, and GitHub retargeted PR #6 to main. Merged actual base 2a29871, preserving all capture/contract history and adding the platform evidence. Dependency ownership is now reflected in the PR base itself. Revalidating the expanded native platform and auth inputs before final publication.

Final main-integrated native evidence: Unity 6000.3.24f1 passed 13/13 EditMode
(test-c34aafe1-ee0c-46fc-ad5e-52bd15875c56) and 7/7 PlayMode
(test-play-29860c9c-8ba3-492c-b8de-52e72ede5473), then the standard `quest:build`
recipe succeeded for non-development Android ARM64/IL2CPP with an isolated
Gradle user home. APK: artifacts/quest/build-ccc5b914-7a2b-4453-b38a-e1ba21096d4a/Trail.apk,
69,218,821 bytes, SHA256 fb6f7b4ba2d2e5483020938ba9960e7383459392aaff791282ae5b9ac54b2050.
The build report confirms the editor/backend/architecture, and the ZIP contains
lib/arm64-v8a/libil2cpp.so. The same artifact directory records 215 native/shared
input hashes, distinguishing staged inputs from eight settings regenerated by
ProjectSetup.Apply; generated files were preserved there and staged platform
settings restored after validation. No generated settings or APK are committed.
The final merged workspace passed 161 tests/typechecks/builds, fixture validation
and Chromium 3/3. This supersedes the earlier current-APK gap; hosted native-CI
enforcement and review-thread disposition remain separate. No device install,
headset, physical transfer or live-provider validation is claimed.

Final guide-base synchronization: merged capture `82b0266`, including the
platform/authentication changes now in main. `pnpm check` passed typechecks,
161 tests and builds; its final static check encountered an empty Unity-created
StreamingAssets folder left by switching this task's branches. Removed that
untracked empty folder and reran the unchanged static check successfully (122
GUIDs), then fixtures passed. Actual Unity 6000.3.24f1 passed EditMode 15/15 and
PlayMode 8/8 on this combined guide tree; XML is in
`artifacts/quest/test-52f7f34a-aaf8-4997-bdbf-97337238b69d` and
`artifacts/quest/test-play-e6b422a3-8780-4b9a-938d-03c7ba604f31`.
The complete combined authoring APK is building separately. No headset claim.

Final inspection-base synchronization: merged guide `20186c6` and the validated
capture/platform base. Typechecks, 193 tests and builds passed; removed the same
empty Unity-generated StreamingAssets directory after native tests finished and
reran the unchanged static check successfully (132 GUIDs), then fixtures passed.
Actual Unity 6000.3.24f1 passed EditMode 19/19 and PlayMode 8/8, with XML in
`artifacts/quest/test-c4f4ae19-39f7-400c-9f98-d9ec8517a449` and
`artifacts/quest/test-play-543f3641-2d89-4ea8-a470-970f2d13a12f`.
All native source/configuration files match the corresponding files in the
already-tested combined authoring candidate; combined APK packaging is ongoing.
No native CI enforcement or review-thread resolution is claimed by local tests.

## 2026-09-19 — Final combined stack Android evidence

Merged final inspection base `d84b490` into authoring; only this activity log
changed relative to tested source `d59963e`. Reused its 206 workspace tests,
fixtures, 4/4 Chromium, Unity EditMode 20/20 and PlayMode 8/8 evidence.
The standard `pnpm quest:build` recipe succeeded on that source in the existing
integration checkout with a private Gradle user home. Actual Unity 6000.3.24f1
produced a non-development Android ARM64/IL2CPP APK, 69,315,761 bytes, SHA256
`db0345c165c80a69129f94b1fa1cbbb4394693d6637803107cef092023544f77`.
ZIP inspection found only arm64-v8a native libraries and libil2cpp.so.

Integration-checkout evidence is in ignored
`artifacts/quest/build-b309c4eb-dcd1-41db-8a36-314780a0c52b/`: build.json,
Trail.apk, Unity log, 293-file source-manifest.json, generated-settings.patch,
and generated/ snapshots. The manifest distinguishes committed input hashes
from seven settings/assets rewritten by the normal Unity/ProjectSetup build
pipeline (including URP profile/render settings); those generated changes were
archived and the checkout restored. Neither generated settings nor APK entered
Git. No device install, real camera/provider session, or physical-transfer claim.

Stack repair left review-thread disposition and hosted Unity/Android enforcement
separate from local validation. Final hosted checks are verified after publication;
no review replies, resolutions, PR merges or deployments were performed here.
### 2026-09-19 16:50 EDT — Voice/AI workstream: contracts, provider, routes, coach, Voice Lab (PR #3)

- **User goal / request:** Take the voice/AI role (TRAIL-09/10 software portions and the server half of TRAIL-16) from design to a mergeable PR with tests and a desktop way to exercise it, using `gpt-live-1` for the coach.
- **Codex work:** Researched current OpenAI Live, Realtime, transcription and Structured Outputs docs and the `openai` 7.19.0 SDK types; wrote the design spec and implementation plan under `docs/superpowers/`; implemented voice contracts (transcript, labels, coach context/request/answer, live session, narration capture), an `AiProvider` with mock and OpenAI implementations (whisper-1 segment timestamps, `gpt-4.1-mini-2025-04-14` Structured Outputs, `client.live.create`), four Fastify routes with bounded bodies, MIME allow-list and typed errors, a browser coach reducer and runtime (GPT-Live over WebRTC, text and local fallbacks, stale-reply rules across run/tutorial/attempt/step, mic silenced until Ask by voice, playback gated across step changes), a narration recorder bounded at 120 s / 20 MiB, and the Voice Lab page. Ran staff, Sentry-checklist and inline code reviews and fixed all findings. Merged `main` after #5 and #8 and applied the contracts split (`voice.ts` on `common.ts`/`recording.ts`).
- **Human input:** Ali chose GPT-Live-1 over the Realtime API and approved the design. Aidan's review requested five changes (mic enabled during startup, stale live output across step changes, `connect()` hanging before `session.started`, unbounded capture, cross-segment label citations); all fixed and re-reviewed. Ali ran the live desktop test with a real key.
- **Result:** implemented. PR #3 open against `main`, level with `main`.
- **Evidence:** [PR #3](https://github.com/aidanjnn/trail/pull/3), [design spec](superpowers/specs/2026-09-19-voice-ai-design.md), [implementation plan](superpowers/plans/2026-09-19-voice-ai.md), fixtures `narration-transcript.v1.json` and `label-segments.v1.json`.
- **Validation:** Automated on the PR head: `pnpm check` (typecheck, 252 unit/API tests, build), `pnpm validate:fixtures`, `pnpm test:e2e` 6/6 with Chromium's fake microphone; all CI jobs green. Live provider (desktop Chrome on macOS, `AI_PROVIDER=openai`, observed by Ali at revision `4c01b4e`): whisper-1 transcribed a 14.33 s clip into 4 spans with the 207 ms start offset applied; labels for 3 simulated segments carried provenance `model`; the GPT-Live-1 session reached mode `live`, answered "what do I do now" from the tutorial text, and refused to confirm completion ("The system only checks the hand movement checkpoint"). Latency was not measured. Headset: not tested; native mic and WebRTC on the Quest APK remain TRAIL-16.
- **Remaining limits / next step:** Routes are unauthenticated and trust the submitted `CoachContext` until pairing and tutorial storage (#11) land; no per-learner live-session cap; whisper-1 is deprecated for 2027-02-26. Next: register the voice routes behind pairing auth with server-side tutorial lookup, then prove native mic → WebRTC → Live on the Quest APK.

Final stack repair cycle: PR #3 merged externally into main `6e7b5b5` during final verification. Merged that actual base into capture, preserving both activity histories. No native inputs changed; prior capture Unity/APK evidence remains applicable. New voice/server/browser inputs are covered by the new-head hosted full workspace/browser gate and final combined-stack checks. Review #11 additionally requested authoring transport fixtures and migration notes; that repair is scoped to the authoring tip.

Final guide cycle: inherited capture `27411fd` and the externally merged voice workstream. Conflict resolution only preserves both log histories. Native files are unchanged; the current-head hosted workspace/browser gate validates the new TS inputs.

Final inspection cycle: inherited guide `f2ab1d0` after the external voice merge. Only the activity log conflicted. Native inputs remain unchanged and the final-head hosted workspace/browser gate covers the added voice TS surface.

## 2026-09-19 — Final review cycle: authoring fixtures and voice integration

Main advanced externally through voice PR #3. Propagated that base through capture,
guide and inspection, then reconciled authoring's server TLS/pairing/vision options
with voice provider options and retained both authoring and voice dashboard UI.
The combined full workspace gate passed 333 tests, typechecks, builds and static
checks; all seven Chromium voice/fixture/authoring scenarios passed.

Verified PR #11's new missing-fixtures finding. Added eight synthetic envelopes
and 36 valid/invalid shared-corpus cases for all seven authoring schemas, including
connected/disconnected spectators. Explicitly extended the shared native registry,
regenerated pure C# DTOs/parsers/serializers and shapes, and documented compatibility
and consumer limits. Native job/byte upload now uses generated serializers with
the same wire fields; no recording/tutorial format or stored-data migration changed.
Image metadata fixtures contain synthetic placeholder bytes, not camera evidence.
The existing pinned storage CI job now also runs the actual C# shared corpus.

Zod contract tests passed 180 checks; pure C# passed 151 corpus/binding/legacy/math
checks. Actual Unity 6000.3.24f1 passed EditMode 21/21 and PlayMode 8/8, including
the new one-MiB native byte-chunk round trip and invalid authoring bounds. XML is
in `artifacts/quest/test-13b3c32d-7c16-49e1-ad68-563f51a5e0cc` and
`artifacts/quest/test-play-955f651f-0d31-403f-954f-0c7104e6f620`.
A new APK build is required for these generated C#/serializer changes; earlier
APK evidence is not attributed to this source. No provider or headset test ran.

Fixture repair scope refinement: retained the existing native upload construction instead of adding full JSON parse/regex validation to every outgoing one-MiB chunk. Generated authoring codecs remain covered by the shared corpus and Unity boundary test; production upload fields and behavior remain unchanged. This supersedes the earlier note about replacing native upload construction.

## 2026-09-19 — Published stack candidate native evidence

Final source `0e16f4e` passed actual Unity 6000.3.24f1 EditMode **21/21**
and PlayMode **8/8** after preserving the original production upload construction.
The isolated babysit worktree retains XML under
`artifacts/quest/test-de3b9ad4-514e-4f1b-8951-0d99711a248f/results.xml` and
`artifacts/quest/test-play-7199a975-b6f4-4feb-8ee0-292f2b53c7ae/results.xml`.
Previously passing 333 workspace tests, seven synthetic Chromium scenarios,
180 Zod contract checks, 151 pure C# checks and 14 storage checks are reused for
unchanged inputs. The post-editor static scaffold check also passed.

Standard `pnpm quest:build` succeeded on this source using an isolated Gradle
home in `/Users/aidanjeon/.codex/worktrees/198f/trail`. Artifact directory:
`artifacts/quest/build-ecf08911-2135-4ae8-b353-7deaa54d688f`.
The non-development Android ARM64/IL2CPP APK is **69,327,117 bytes**, SHA256
`17c52461c5ce39115b1f71ef4e20146df2692696658e4984b789bdf74528c965`.
ZIP inspection confirms only `arm64-v8a` native libraries and `libil2cpp.so`.
`build.json`, `unity.log`, a 301-file committed/built-worktree hash manifest,
and the seven generated settings/assets plus patch are preserved beside the APK.
Generated tracked state was archived and restored; artifacts remain outside Git.
The earlier interrupted build of superseded source is not passing evidence.

Current published heads for capture `27411fd`, guide `f2ab1d0`, and inspection
`d7ef1d2` have passing executable hosted checks. Authoring CI is checked after
this evidence-only commit is published. Hosted native enforcement remains an
infrastructure gap: repository Actions currently lists no secrets and no
self-hosted runners. Local editor/player gates do not establish hosted gating.
No headset, physical transfer, or new live provider run was performed. Open
review threads are left for user disposition; no replies/resolutions or merges
were performed by this repair.
## 2026-09-19 — PR 7: enforce native validation in CI

Confirmed the review finding: `guide.yml` ran only the standalone .NET harness,
so it could not detect Unity integration or Android build regressions. Converted
it to a reusable workflow called by Check, retained the harness, and added
separate EditMode, PlayMode and Android ARM64/IL2CPP matrix gates using the
existing evidence-validating wrappers. The existing aggregate `check` now
requires that workflow to succeed. Native logs/results/build artifacts upload
on success or failure. Documented isolated licensed-runner provisioning and
updated the stale validation reference.

Automated validation on the changed worktree: actionlint 1.7.12 and patch
whitespace passed; eight runner-configuration cases and all 256 combinations
of success/failure/cancelled/skipped aggregate inputs passed; both existing
Unity-wrapper regression tests passed. Full `pnpm check` passed (252 tests,
typechecks, production builds and static scaffold checks), and recording/voice
fixture validation passed. Existing hosted browser evidence for f2ab1d0 is
reused because application, fixtures and browser-test inputs are unchanged.

Infrastructure boundary: GitHub reports no repository self-hosted runners or
Actions variables. Missing `TRAIL_UNITY_RUNNER_LABELS` now fails explicitly;
configure a disposable licensed runner and `TRAIL_UNITY_EDITOR` as documented
in docs/ci.md before native CI can pass. No Unity test or APK execution is
claimed from workflow validation, and no headset/provider evidence was added.
No review replies, thread resolutions, merge or deployment were performed.
### 2026-09-19 — PR #6 Greptile native-gate repair

Rechecked every Greptile thread on head 27411fd. The withdrawal-confirmation
finding is already fixed with its PlayMode regression. The Unity dependency
ownership finding is stale: integration PR #5 and contracts PR #8 are merged,
and `git diff origin/main...HEAD -- apps/quest/Packages` is empty. No dependency
or lockfile edit is needed or included in this repair.

Added a reusable Unity workflow to the existing Check aggregate: actual full
project EditMode and PlayMode (Android target), then the production Android
ARM64/IL2CPP build. All must succeed; missing activation fails the prerequisite
and aggregate explicitly. The existing standalone C# harnesses stay supplemental.
The CI build entry point sets output paths and calls the unchanged production
setup/build guard. A verifier rejects missing/empty/failed/skipped test reports,
wrong build configuration, mismatched APK size and a non-ARM64 IL2CPP ELF binary.
Four regression tests exercise both accepted results and these failure modes.
Pinned the GameCI actions/CLI and verified the Android-capable image tag exists.
Updated the CI runbook and validation guidance without relaxing native or
physical acceptance requirements.

Repository inspection found no Actions secrets, no self-hosted runners and no
branch protection on main. The new hosted native gate is therefore blocked on
Unity activation credentials. Adding the workflow does not itself configure
those credentials or a branch rule. No activation data was read, copied or
published. Local licensed Unity results remain separate from hosted CI evidence.

Local repair validation passed: frozen-lockfile install, `pnpm check` (252 tests,
typechecks, production builds, static native checks), fixture validation,
Chromium 6/6 with synthetic/fake-microphone inputs, actionlint 1.7.12, and all
four native-verifier regression tests. Real Unity 6000.3.24f1 passed 13/13
EditMode (test-1b3cc3cf-f31b-422b-9ec0-c1bc38f85a2e) and 7/7 PlayMode
(test-play-3ca6524b-499d-4c66-8b15-ff53fbdf8dc6). Directly executing the new
BuildAndroidCi entry point succeeded with an isolated Gradle home: non-development
ARM64/IL2CPP APK, 69,218,837 bytes, SHA256
99aacc614a212920cf33c101a2b975e61a334e67a8453e008a32c68f95e78ba6.
The verifier also checked its actual ELF architecture. The ignored
artifacts/quest-ci directory retains the APK, build report, generated settings
and 220 native/shared input hashes. Eight Unity-regenerated tracked settings
were preserved there and restored, keeping dependency/platform assets outside
this repair. Existing Vite chunk-size and vendor Android manifest warnings
remain. No live-provider, headset or physical acceptance result is claimed.
### 2026-09-19 — Align the README with the revised plan and rescaffold

- **User request:** Update the README to follow the revised plan.
- **Codex work / result:** Reworked the overview around Unity/Meta XR, independent different-room/table calibration with the same parts/layout, the MRUK feasibility milestone and future object-aware transfer. Documented the separate main/vision processes and required fresh-camera-to-spoken-feedback acceptance, local inspection pause/resume and explicit limits on physical verification. Added a component-by-component implemented/pending table, corrected startup/port/authentication instructions, described existing Unity wrappers and linked the four-person work split and dependency-ordered tickets.
- **Validation / limits:** Checked README command names against package scripts and native candidate versions against checked-in project files. Documentation checks passed 52 local links/anchors and 15 fenced blocks across 10 files; `git diff --check` passed. Existing scaffold test evidence is attributed to its recorded results. Documentation-only edit: no installs, application changes, provider/headset tests, commit or push in this turn.

- **PR babysit final observation:** Remote head `84152bd` matches local HEAD. All four Check workflow jobs and the existing Greptile review passed; GitHub reports CLEAN/MERGEABLE, no unresolved review threads, and no required checks configured. The prior thread was resolved externally without Codex posting or resolving it. README/prior log edits remain uncommitted; no merge performed.


### 2026-09-19 — Audit installed pnpm and declared Unity dependencies

- **User request:** Confirm whether package dependencies and installations for Unity/Meta are complete and correct. Current target remains native Unity + Meta XR/OpenXR; browser WebXR typings do not supply native SDKs.
- **Workspace evidence:** Node 22.23.1 satisfies the declared Node 22 range; pnpm 11.3.0 matches packageManager; npm 10.9.8 is available. Recursive dependency inspection lists the declared direct versions and internal workspace links across all six projects. `pnpm install --frozen-lockfile --offline` reported already up to date; dependency manifests and lockfile are unchanged. This verification invocation ran before the historical per-install approval preference was encountered in the prior log; no further installation was attempted.
- **Automated / desktop evidence:** On HEAD 84152bd with the existing README/log edits, `pnpm check` passed typechecking, 39 tests, all builds and static native scaffold checks. Fixture validation passed 61 synthetic frames / 2,000 ms; all three Playwright Chromium scenarios passed. Existing non-failing Vite chunk-size warning remains.
- **Native evidence / gaps:** No Unity Hub/editor found in standard application directories, no UNITY_EDITOR override, no project Library or packages-lock.json. `pnpm quest:test` failed explicitly because Unity 6000.3.24f1 is absent at the configured path; no native test ran. Android tools, UPM resolution, C# compilation, combined SDK compatibility and APK/device behavior remain unverified.
- **Registry / documentation evidence:** Live official registry metadata contains the four Meta 205.0.0 pins, XR Management 4.5.4, OpenXR 1.18.0, WebRTC 3.0.0 and Test Framework 1.4.6. Generic Unity registry metadata did not expose the pinned URP/uGUI versions; this alone does not prove invalid pins because core packages are editor-coupled. [Unity 6.3 URP documentation](https://docs.unity3d.com/6000.3/Documentation/Manual/com.unity.render-pipelines.universal.html) identifies URP 17.3; [WebRTC requirements](https://docs.unity3d.com/Packages/com.unity.webrtc@3.0/manual/requirements.html) list Unity 6000.3 and Android ARM64/IL2CPP. Meta Interaction/MRUK transitive TMP and uGUI compatibility still needs actual editor resolution. [Meta installation guidance](https://developers.meta.com/horizon/documentation/unity/unity-package-manager/) uses Unity Package Manager, not the pnpm workspace.
- **Result:** Existing web/server installations are verified; native dependencies are declared candidates, not a completed installation. No package versions changed, editor installed, or live-provider/headset claims made. Preserved existing README/log work.


### 2026-09-19 — Install and validate the native Unity/Android toolchain

- **User request / authorization:** Install/activate Unity with Android Build Support, resolve packages, generate the UPM lock, compile, run native tests and build Android. User explicitly approved the displayed Unity terms and completed account sign-in. No publication or device installation was requested.
- **Workspace:** Created `codex/unity-android-setup` from `84152bd`, preserving the existing README/log edits. Installed Unity Hub 3.21.3 through Homebrew, then the pinned ARM64 editor 6000.3.24f1 / 4e7b9b5b6244 and all Android child modules through Hub. Activated Unity Personal with Unity's bundled CLI. Exact versions and reproduction commands are in [native setup evidence](native-setup.md).
- **Resolution / fixes:** Unity generated `Packages/packages-lock.json`. Actual compiler failures identified missing Animation, Asset Bundle, Particle System and Physics 2D built-ins; added exact 1.0.0 entries. Aligned the direct Test Framework pin with the editor-selected built-in 1.6.0. All direct manifest versions match the resolved lock; URP/uGUI/TMP resolved successfully. Kept pnpm dependencies and its lock unchanged.
- **Build support:** Added `pnpm quest:build` for a uniquely named development ARM64/IL2CPP scaffold APK, with nonzero build-result and nonempty-output checks. Android setup enables Internet access and disables optimized frame pacing for the WebRTC candidate. Generated project settings and SDK assets retain their GUIDs. Meta's auto-generated DevAgent asset contains local credentials: ignored that asset/metadata and added a final preprocessing callback that clears the unused fields before build serialization, leaving the feature disabled. No credential values belong in this log or Git.
- **Automated / native evidence:** `pnpm quest:setup` passed real editor import and C# compilation after the dependency fixes. `pnpm quest:test` reported 2 passed, 0 failed, 0 skipped. TypeScript tools typecheck, static scaffold check and patch whitespace passed. Existing web/server test/build/fixture and three-browser-test results from the earlier audit remain applicable because their implementation inputs did not change. The Android build result is recorded below when complete.
- **Limits:** The runtime scene is still a scaffold. No XR rig, physical hand/camera/audio behavior, provider call, device installation or human run is validated. Local native setup does not finish TRAIL-18's headset acceptance; native CI and PlayMode coverage remain pending. Updated current setup/status documentation while preserving historical bootstrap records.
- **Android result:** The first APK succeeded but Meta's post-build telemetry hook threw a non-fatal null reference against absent XR manager settings. Fixed the actual configuration: setup creates/preserves XR settings and assigns exactly one Android OpenXR loader, refusing a conflicting provider. The corrected `pnpm quest:build` passed without that exception. Final local APK `artifacts/quest/trail-scaffold-1789842078500.apk` is 88,467,730 bytes; signature/ZIP integrity, `com.trail.guide`, minimum SDK 32, target/compile SDK 36, ARM64-only ABI and IL2CPP/WebRTC libraries verified. No current local debugger credential bytes appeared in decompressed APK entries. SHA-256 is recorded in the setup evidence. No headset install/run was performed.
- **Final checks / handoff:** Repeated the two EditMode tests after the XR settings fix: 2 passed, 0 failed/skipped. TypeScript tools typecheck, static scaffold (57 asset/folder GUIDs), seven-document/44-local-link checks, direct manifest/lock agreement, generated-asset credential scan and patch whitespace passed. Removed only three empty unreferenced folders generated by this import/build. Registered the project in Unity Hub and attempted a GUI launch; final window verification is blocked by the locked Mac. Batch import/test/build succeeded independently of this GUI handoff. Changes remain local and uncommitted; no push, deployment or headset installation.

### 2026-09-19 — Complete Unity GUI handoff and recheck native build

- **User request / GUI evidence:** Continued after the Mac was unlocked. Verified the actual `Assets/Trail/Scenes/Trail.unity` window from this checkout in Unity 6000.3.24f1 with Android selected. The editor initially opened an untitled default scene; explicitly loaded the repository scaffold scene. Unity Personal remains active. Hub's GUI showed its sign-in screen, while the bundled CLI reported an active signed-in license; direct editor launch succeeded.
- **Configuration:** The first GUI launch requested native Input System activation. Its initial Both setting was changed to Input System Package (New), followed by an editor restart. The saved Android target API is 34 after the GUI session. No package versions changed: all 19 direct pins match the 48-package Unity lock. SDK-generated PackageManagerSettings contains the existing Unity and Meta registries.
- **Automated evidence:** Closed the GUI before batch validation. `pnpm quest:test` passed 2 tests, 0 failed/skipped; `pnpm quest:build` passed. Refreshed APK `artifacts/quest/trail-scaffold-1789848334746.apk` is 118,413,600 bytes, minimum SDK 32, target/compile SDK 34, ARM64-only, with IL2CPP and WebRTC native libraries. APK signature and ZIP integrity passed; no nonempty current local DevAgent credential matched decompressed entries. SHA-256: `45f88bcba7b8fbb20adc23f6125932af5a2c34a26d3c48dba44ee4219b6e4bad`. Static scaffold validation still passes 57 GUIDs. Updated [setup evidence](native-setup.md); prior results above remain historical.
- **Limits:** The GUI reported remaining SDK/XR project recommendations and one editor progress-status error (`Cannot get non-existing progress id 5`); no C# compile failure was reported, and the subsequent native checks passed. The scene remains a scaffold. `adb devices -l` listed no headset, so no device install, XR observation or human test occurred. Changes remain local and uncommitted.

### 2026-09-19 — Document reproducible installation and inspect publication needs

- **User request:** Explain whether a merge/PR is needed and update the README so another developer can install the same dependencies.
- **Documentation:** Added prominent setup links, pinned Node/pnpm downloads and bootstrap commands, root frozen-lockfile installation, Chromium and verification commands, Unity Hub/editor/module installation, per-developer license activation, UPM resolution, exact SDK versions, Input System selection, editor executable overrides and APK/log locations. Documented mock defaults, ignored machine-local credentials/caches, absence of a committed APK and setup troubleshooting. Preserved the product overview and existing user README changes. Official Node release, pnpm installation and Unity release/Android setup pages were consulted; the repo pins remain authoritative.
- **Publication inspection:** GitHub shows scaffold PR #2 already merged. This checkout's `codex/unity-android-setup` branch has no remote branch or PR and its setup changes remain uncommitted. Open native-platform PR #5 overlaps generated Unity assets/settings, package manifests/lock and editor/build scripts; reconcile those changes during publication/integration instead of assuming the two implementations merge independently. This was a publication-status check, not a complete review or authorization to merge any open PR.
- **Validation / limits:** README validation passed 30 local links/anchors, eight fenced blocks, existing pnpm script names and Node/pnpm pin agreement; patch whitespace passed. No dependency installation or application edit was needed for this documentation change. Reused prior native/web validation for unchanged code; did not claim a new clean-machine install or additional platform/device tests. No commit, push, PR creation or merge was performed.

### 2026-09-19 — Reconcile Unity setup with merged platform and prepare delivery

- **Authorization / base:** User requested reconciliation with PR #5, preservation of both implementations, applicable validation, commit, push and PR creation, explicitly without merging. PR #5 had already merged externally. Created isolated `codex/unity-setup-integration` from `origin/main` at `6e7b5b5`, retaining merged platform, strict contracts and voice workstreams. The original `codex/unity-android-setup` source/settings/document edits remain untouched.
- **Reconciliation:** Retained main's generated assets and GUIDs, actual UPM/pnpm locks, XR Hands 1.7.2 pin, concrete hand subsystem, one-rig bootstrap, pairing code, PlayMode coverage and unique release/development build wrappers. Ported only missing setup behavior: WebRTC-compatible disabled optimized frame pacing, strict credential-field/type checks, existing XR-settings asset recovery, null/competing-loader rejection, APK overwrite refusal and explicit packaged-APK output. Added the Unity `.utmp` ignore. No dependency versions or runtime feature behavior changed.
- **Documentation:** Integrated the local README installation/product rewrite with main's voice/platform capabilities, exact downloads, per-user activation, Android modules, Input System, release/development commands, result paths and optional .NET 8.0.425 diagnostics. Updated agent/validation/status guidance and preserved historical local setup evidence separately from this integration. Repaired an old scaffold-validation anchor without changing its recorded result.
- **Fresh-checkout / automated evidence:** Frozen pnpm install passed with 170 packages reused and zero downloads. `pnpm check` passed typechecks, 252 tests, production builds and static native structure checks; existing Vite chunk warning remains. Fixture validation passed. Six Chromium scenarios passed on isolated port 3319 with one worker, synthetic/fake-microphone/mock inputs. Pure C# network/pairing diagnostics and 115 contract checks passed using the existing .NET SDK (not initially on PATH). Fresh Unity import/setup/C# compilation passed, followed by EditMode 7/7 and PlayMode 3/3; no failures/skips. All 20 direct UPM pins match 48 resolved packages. Eight-document/123-local-link validation passed.
- **Local resources / boundaries:** Closed only the earlier task's Unity editor and removed its generated `Library/Bee` build intermediates to recover disk space; source, metadata, logs and APKs remain. Native and desktop checks are software evidence, not headset, provider or physical-transfer acceptance. The Android package result and publication outcome follow below.
- **Android / final review:** The combined release-mode Android ARM64/IL2CPP build passed. APK is 69,077,802 bytes, `com.trail.guide` 0.1.0, minimum API 32 and target/compile API 36; signature, ZIP integrity, ABI and IL2CPP/WebRTC libraries verified. SHA-256 `136d52acaa8ab848af2a6452a144e8cba035448b698196e5b82519b8c72f26c1`. Generated DevAgent credential/address fields are cleared and disabled. Kept editor-materialized URP defaults/prefilter/runtime settings, Meta build config and Oculus runtime preload; original metadata GUIDs remain unchanged. Normalized generated whitespace while retaining quoted empty layer strings; static checks pass 81 local GUIDs. Test-only resources cleaned themselves through SDK post-build cleanup; removed the empty StreamingAssets directory. See [integration evidence](native-setup.md). Publication uses the requested PR workflow; no merge is performed.

### 2026-09-19 — Correct native contract validation status in the README

- **Review finding / fix:** Confirmed that the stack table incorrectly described native strict DTO validation as unimplemented. Updated the Contracts row to match the implemented strict parsing and validation, including native capture sidecars and scene-reference manifests, and the README's existing status table.
- **Validation / limits:** Checked the wording against the native contract implementation and verified patch whitespace. This documentation-only correction changes no code, dependencies or links; prior software test evidence remains applicable. No new headset or live-provider validation is claimed.

### 2026-09-19 — Catch up open PR branches

- User requested a fresh CI check and catchup for every open PR. In an isolated checkout, merged current main `c80d67b` into PR #6, preserving the hosted native gates and the newly merged Unity setup safeguards/assets. Reconciled validation guidance and retained both activity histories. The original dirty Unity setup checkout is untouched.
- Before catchup, hosted licensing prerequisites passed after secret configuration, but the test runner stopped before Unity with `Unknown argument: noCoverageEnabled`. PR #7 separately requires a configured self-hosted runner. These existing CI failures are not evidence of passing native tests.
- Validation on the merged worktree: `pnpm check` passed (252 tests, typechecks, production builds and 102 static native GUID checks), fixture validation passed, actionlint passed, and 4 native-result-verifier regressions passed. Native CI remains failing before Unity execution as recorded above; no new editor/APK, provider or headset evidence.

### 2026-09-19 — Catch up guide PR #7 with capture

Merged capture `370aee5` into the guide branch. Reconciled overlapping CI implementations by requiring one full-project hosted Unity EditMode/PlayMode/Android workflow plus the guide's pure C# scenario harness. The same native suites and production build remain mandatory, while the duplicate self-hosted matrix and its missing-runner prerequisite are superseded. The aggregate now checks all five job results. Preserved both logs and main's setup changes. The inherited GameCI CLI flag failure remains a separate known blocker; no native execution is claimed.

Guide catchup validation: `pnpm check` and fixture validation passed; actionlint passed; the pure C# harness passed 24 guide scenarios plus golden recording/tutorial/telemetry integration; all 4 native-result verifier regressions passed. These are software/static checks, not a new Unity or headset run.

### 2026-09-19 — Catch up inspection PR #10

Merged updated guide `7945802`, including current main and reconciled native CI, into inspection. The only conflict was append-only activity history; both sides are retained. Inspected automatic changes to setup, generated assets and workflow wiring. No inspection/runtime implementation changed during resolution. Validation follows below; existing GameCI execution failure remains distinct from static/software results.

Inspection catchup validation: `pnpm check` passed 284 tests, typechecks, production builds and 131 static native GUID checks; fixtures and actionlint passed. The scene harness passed freshness/lifecycle/strict request and server-issued session checks. No new Unity/APK/provider/headset run.

### 2026-09-19 — Catch up authoring PR #11 and complete stack sync

Merged inspection `6d767db` into authoring, carrying current main through all four stacked PRs. Kept both activity histories, the `.utmp` and Python-cache ignores, and main's intentionally tracked `OVRBuildConfig.asset` with its original GUID; removed the superseded ignore entries for that committed metadata. No feature code or serialized contract was altered by conflict resolution. PR #14 was separately merged with the same main base; its 260 workspace tests and six synthetic Chromium scenarios passed. Remaining CI failure before Unity execution is tracked separately; validation of this merged authoring tree follows below.

Final authoring catchup validation: `pnpm check` passed 333 unit/API tests, typechecks, production builds and static native structure checks; all fixtures and seven Chromium scenarios passed (synthetic/fake-microphone/mock inputs, port 3395). Pure C# storage passed 14 checks and shared contracts passed 151 corpus/binding/legacy/math checks. Actionlint and patch whitespace passed. No new editor/APK, provider or headset result is claimed. All five open PR branches are published without rewriting history; none is merged into its PR base by this task.

### 2026-09-19 — Catch up voice authentication PR #14

Merged current main `c80d67b` into the latest voice-auth head `2082054` in an isolated checkout. Preserved the README's server-owned live step channel, auth/lookup wiring limits and stored-tutorial grounding inside the new setup guide. No voice/runtime implementation was changed by conflict resolution. Main's native setup changes are retained. Full workspace/fixture validation is recorded below; no new native/provider/headset claim.

Catchup validation on the merged PR #14 worktree: `pnpm check` passed typechecks, all unit/API tests, production builds and static native checks; fixture validation and whitespace passed. The conflict was documentation-only. No new editor/APK, provider or headset run was performed.

### 2026-09-19 — Address PR #14 review: sideband readiness, ordered step updates, paired Voice Lab

Reviewer findings on the voice authentication branch were verified against the pinned OpenAI SDK and fixed: the sideband wrapper now registers an `error` listener before any event flows and exposes `ready`, and `POST /api/live/sessions` refuses with `live_unavailable` unless the control channel opens within 5 s, so no live session exists without a server-owned step channel. Step updates carry a client `generation`; the registry refuses older updates (409 `stale_update`), treats duplicates as idempotent, and ends every session on its own 30-minute lifetime timer. The browser coach marks context sync pending until the server acknowledges, refuses to listen meanwhile, and closes live on a refused or failed update. `createApp` defaults `resolveTutorial` to the tutorial repository whenever pairing is configured, so pairing on means grounding on.

Because main's Playwright server now runs with pairing enabled, the Voice Lab gained a pairing panel (`POST /api/session` state, `POST /api/pair` exchange) and explains that its unsaved steps fall back to local coach text on a paired server. End-to-end pairing uses a Playwright global setup that exchanges the single-use bootstrap author code once and mints per-test browser codes through `/api/pairing-codes`; the authoring spec was switched to a minted code. Validation: `pnpm check` (typecheck, unit/API tests, builds, quest scaffold), `pnpm validate:fixtures`, and `pnpm test:e2e` 7/7 against the built app in mock mode with pairing on. The sideband error path is exercised against a refused loopback port; a successful OpenAI sideband handshake, live-provider coaching, and headset behaviour are not verified by this entry.

Native CI diagnosis on the same branch: the Unity EditMode/PlayMode jobs had failed on every run since the hosted gate was added, including on `main`, although the licensing prerequisite passed. The `game-ci/unity-test-runner` v4.4.0 wrapper turns `coverageEnabled: false` into `--no-coverageEnabled`, and the pinned `game-ci/cli` v0.1.69 parser runs with `negation-prefix: false` under strict mode, so it logged `Unknown argument: noCoverageEnabled` and exited 1 before pulling the image or starting Unity. The CLI reads every option from `GAME_CI_<OPTION>` and maps `coverageEnabled=false` to `COVERAGE_ENABLED=false` in the container, so the workflow now sets `GAME_CI_COVERAGE_ENABLED=false` and drops the input. That workflow-only change (`f84c950`, actionlint 1.7.12) never ran: `main` retired the native workflows in #16 minutes later, so the catch-up merge takes the deletion and the diagnosis stays here as the record of why hosted Unity CI never passed.

### 2026-09-19 — Retire self-hosted runner and remove native CI

- User explicitly requested removal of the self-hosted runner and selected removal of Unity/native CI while retaining hosted web/server checks. Prepared the change in an isolated branch from main `2a0b91c`; the dirty Unity setup checkout is preserved.
- Removed the six native workflow definitions and their aggregate dependencies, retaining hosted typecheck/tests/build/fixtures, Chromium scenarios and workflow linting. Local native test/build commands, harnesses and evidence verifiers remain available. Updated current CI and validation guidance: a green hosted result no longer establishes native readiness.
- Stopped the local `trail-unity` runner process, disabled all six native workflows in repository settings, and removed the obsolete runner-label variable. Runner deregistration and focused validation results are recorded below when complete. No Unity license or account secret is included in this change.

- Completion / verification: cancelled the old queued self-hosted run, unregistered `trail-unity` (GitHub API confirms zero runners), and removed only its local registration/credential files while retaining job artifacts. Actionlint and patch-whitespace checks passed; local links in the four updated guidance documents resolve. Runtime/test inputs are unchanged, so prior workspace/fixture/browser results remain applicable; the cleanup PR will run the retained hosted jobs. No new native, live-provider or headset test is claimed.

### 2026-09-19 — Package browser tutor as a Unity integration reference

- User requested publication of the local work so Hamza can merge and complete the Unity implementation. Prepared isolated `codex/browser-tutor-handoff` from main `8cd87f7`; the running local prototype and private recordings are untouched. No native source/contracts changed, no merge or reviewer notification is performed.
- Added `experiments/quest-browser`: current Create/Follow tutorial workflow, one-time persistent save position, clean-trim capture, review/library, paired ghost presentation, learner start/ordered gates, optional camera/audio assistance, earlier camera/path diagnostics, and their regression tests. Added source-only offline detector experiment and research notes; no weights or private test media. Generated Three.js assets reuse the workspace lockfile with version/hash checks and retain its MIT license.
- Added `docs/ux-unity-handoff.md` with component mapping, retained native invariants, bounded implementation order and unchecked acceptance gates. Linked it from README, plan and AGENTS so the merge does not bury the gaps. Updated README's obsolete scaffold-only status against merged source. Prototype v3 files are explicitly not native contracts; native save-zone schema, two-hand presentation, UX integration, object retargeting, occlusion handling and device acceptance remain open.
- Portable tests use an owned temporary-port server, temporary runtime data and disabled provider credentials. CI now runs the prototype regression suite in addition to existing hosted checks. API keys, recordings, runtime ledgers, virtual environments, downloaded SDKs/models and generated browser assets are ignored and excluded from the publication list.
- Fresh software validation on this packaging worktree: `pnpm check` passed (333 tests, typechecks, production builds and 138 static native GUID checks; existing Vite chunk-size warning). Seven repository Chromium workflows passed on isolated port 3417. Prototype tests passed 56 Node cases, 52 Python cases and nine browser workflows; the browser workflows also passed with the pinned Playwright Chromium runtime used by CI. Initial sandbox-only checks could not bind sockets; reruns with localhost/IPC permitted passed. No paid inference, Unity build or new headset validation was performed. The optional model spike was preserved as source, not rerun.
- Fixture validation, actionlint 1.7.12 and patch-whitespace checks passed. Publication review checked 77 source/document/test files and 135 local links; no credentials, raw media or generated dependency artifacts were staged. These results apply to the packaging worktree; native/device acceptance remains unchecked in the handoff.

### 2026-09-19 — Silence automated swap-test speech

The user heard “Test sequence observed” from the local regression browser: the swap scenario exercised real host text-to-speech despite headless mode. Replaced speech synthesis with a silent recording stub in that test and asserted that the completion cue is still emitted. All nine prototype browser workflows passed with pinned Chromium. Production/headset spoken guidance is unchanged. Applied the same fix to the local experiment and the published reference; no test browser was left running at diagnosis.

### 2026-09-19 — Merge voice authentication PR #14 into main

Merged `codex/voice-auth` head `7886188` into `main` as `1f9ff02` after the branch had absorbed #16's retirement of the native workflows, so the merge changed no CI definitions. It carries pair-gated voice routes, stored-tutorial grounding through the tutorial repository, the server-owned live step channel with generation ordering and control-channel readiness, the browser's pending-sync gate, the paired Voice Lab with Playwright pairing setup, and the second-round review fixes. All five reviewer threads were resolved with the fixing commits cited; no thread remains open.

Validation on `main` `1f9ff02`: `pnpm check` passed strict typechecks, 352 unit/API tests in 32 files, production builds and the static quest scaffold check; `pnpm validate:fixtures` passed; `pnpm test:e2e` passed 7 Chromium scenarios against the built server in mock mode with pairing enabled; hosted Check run 35475345582 passed all four jobs. This is automated web/server and desktop fixture evidence only. A successful OpenAI sideband handshake, live-provider coaching, and headset behaviour remain unverified, and the Voice Lab coach on a paired server falls back to local text because its steps are not a saved guide.

### 2026-09-19 — Repository cleanup pass

- **User request:** Review the whole repository for duplicate code, technical debt and bloat, and clean it up on a new branch.
- **Scope:** Created `codex/repo-cleanup` from fetched `origin/main` at `aa01274` in an isolated worktree. Preserved the original checkout's unfinished Unity work. Inventoried tracked source/configuration, scanned duplicate blocks and exported-symbol references, checked runtime dependency usage, and reviewed the web/server/vision, shared contracts/motion, native runtime, validation tooling and documentation boundaries.
- **Cleanup:** Consolidated server/browser coach fallbacks and current-step lookup in the existing pure voice contract module; reused its answer/deadline constants. Removed the unused coach prompt version, unused label-function argument and obsolete unreferenced vision-skeleton response schema. The server's health and inspection clients now share bounded strict JSON reading and stream cleanup; both services derive their error-code type from the wire schema. Recording downloads reuse the exact bytes already parsed and hash-checked, eliminating two redundant file reads for full-content/download metadata requests. Voice lookup/control readiness share a deadline helper that clears its timer on success, failure or timeout. Browser fallbacks retain their original request context; the existing reducer continues to suppress replies after step/attempt changes.
- **Documentation:** Deleted 15 redundant placeholder READMEs plus their unused Unity metadata and the empty Coach folder. Ownership/invariants remain in AGENTS.md and substantive runbooks remain in place. Corrected the development banner and route notes that still described implemented vision/storage code as absent. Historical setup/validation records were preserved.
- **Automated validation:** On this uncommitted worktree, `pnpm install --frozen-lockfile`, `pnpm check` (strict typechecks, 361 tests in 32 files, production builds, 130 static Unity asset/folder GUID checks), `pnpm validate:fixtures`, and `git diff --check` passed. Added coverage for deadline cleanup, streamed response overflow/invalid JSON, corrupted recording downloads and late offline coach fallbacks. Checked 151 local Markdown targets for references to deleted files, intact workflow discovery symlinks and no retained references to the deleted Unity GUIDs. Dependency manifests and lockfiles are unchanged; every declared runtime dependency has source consumers. The existing Vite main-chunk size warning remains.
- **Desktop fixture validation:** All seven Chromium scenarios passed against the built paired server: synthetic replay, health failure recovery, narrow-screen controls, authoring/finalization/reload and fake-microphone/mock-provider voice flows.
- **Evidence limits:** No C# runtime, Unity scene, generated serialization or recording wire-format implementation changed. Native controls retain their distinct dwell/withdrawal semantics. No new Unity editor/APK, live-provider or headset/human validation was performed. Changes remain local and uncommitted; no publication was requested.

Publication follow-up: the user requested pushing this cleanup and opening a PR. Fetched `origin/main` and confirmed it still matches the cleanup base `aa01274`; no existing PR uses `codex/repo-cleanup`. Reused the passing workspace, fixture and browser checks above because their inputs are unchanged, and prepared the focused cleanup commit and PR description with the same native/provider evidence limits.

### 2026-09-19 — Make the runnable browser tutor the immediate demo path

- The user selected WebXR rather than Unity for this delivery and requested publication of all functional local work. Updated existing PR #17's branch rather than creating a competing copy. Merged current main `6b0a069`, preserving both activity histories and all cleanup/voice changes. The local tutorial runtime under `outputs/plushie-tester/public` matches the packaged source; packaging differences supply portable launch/dependency/test handling, not a replacement product. Private local storage, credentials and media remain excluded.
- Added `docs/web-delivery.md` with a source-backed inventory, browser/native boundaries, a bounded UI/feedback/coach implementation sequence and headset acceptance criteria. Updated README, plan and agent guidance so older native-only instructions do not block the user's web-first decision. Preserved native code and historical porting notes.
- Included the self-contained discussed design preview and tokens under `docs/design/trail-ui`, labelled simulated and separate from the runnable tutor. Current immersive controls remain functional; the cleaner panels/dock/event-feedback design still needs connection to real actions. Inspected the exported Home preview at desktop and 375px. No runtime behavior or schema was changed in this update.
- Fresh software validation after merging main: `pnpm check` passed 361 tests, typechecks, production builds and 130 static Unity GUID checks; `pnpm validate:fixtures` passed; seven repository Chromium workflows passed on isolated port 3429. Prototype `test-all.sh` passed 56 Node cases, 52 Python cases and nine synthetic browser workflows with temporary runtime data and provider credentials disabled. The existing Vite chunk-size warning remains.
- No paid model call, live OMNI/voice acceptance, Unity build or new Quest test was performed. Browser-only automation does not establish hand accuracy, concurrent camera/mic/XR operation or physical task success. Local document targets, JSON/preview syntax, publication exclusions and whitespace were checked before publication.

### 2026-09-20 — WebXR voice: GPT-Live coach and Whisper labels in the Quest Browser tutor

- **User goal:** re-architect the voice work for PR 17's browser-first demo so the learner in Quest Browser gets the GPT-Live coach and the expert gets Whisper-backed step labels, without Unity. Design: `docs/superpowers/specs/2026-09-20-webxr-voice-design.md`; plan: `docs/superpowers/plans/2026-09-20-webxr-voice.md`. Branch `codex/webxr-voice` stacked on `codex/browser-tutor-handoff`.
- **Server:** `CoachGuideStore` and `POST /api/coach-guides` (author) store reviewed step text with a server id and per-source revision, written atomically; `GET`/`POST …/query` read it back for learners and authors. `createApp` resolves coach context from the tutorial repository first and then this store, so PR 14 grounding holds for browser guides. The API also serves `experiments/quest-browser/public` behind the desktop build and answers `/tutorial` directly, because the page keys off that pathname.
- **Bundle:** `apps/web/src/tutor-coach.ts` re-exports the desktop coach runtime plus two pairing helpers; a second Vite config builds `public/vendor/trail-coach.js` (248 KB), gitignored like the vendored Three.js and rebuilt by `prepare-vendor.mjs` and the root build.
- **Tutor:** steps gain an optional 60-character title. `tutorial-coach.mjs` builds the shared `CoachContext`, publishes a coach guide once per tutorial revision (mapping in `localStorage`), mints run and attempt ids, and passes the tutor epoch as the step revision. The Voice coach card pairs, starts the coach before AR, shows captions and a text question box; `showStep`, restart, try, watch and visibility loss reach the coach; the headset panel gains Ask coach; browser speech is silenced while the live coach can talk; Stop, session end and pagehide dispose it. The review page's Draft titles from narration sends each step WAV through `/api/voice/transcriptions` and `/api/voice/labels` as one segment and shows drafts with provenance. The legacy camera-lab status poll stops after a 404 so it no longer overwrites notices on the API-served page.
- **Automated evidence:** server suite 113 tests in 20 files (new: store, routes, static tutor); prototype node tests 66 (new: titles, coach adapter, narration labels); prototype browser workflows 3/3 via `tests/run-browser.py` including `browser-coach.cjs` (mocked server: publish once, ask with the guide id, step context follows, restart does not republish); repository e2e `tests/e2e/tutor-coach.spec.ts` against the real server with the mock provider and pairing on (pair with a minted author code, publish, text mode, grounded answers per step, guide readable back). Full gate results are recorded below when run.
- **Limits:** no OMNI, Sentry or camera-frame coaching in this change. Live voice needs `AI_PROVIDER=openai`; the mock provider answers in text. Microphone, WebRTC and an immersive WebXR session running together on the Quest are unverified; the desktop real-key check is recorded separately below. Hands-free listening is not implemented: Ask opens the microphone for one question.
- **Full gate on the final tree:** `pnpm check` passed (typecheck including the tools config, **368 tests in 34 files**, production builds and the tutor coach bundle, 130 static Quest GUIDs); `pnpm validate:fixtures` passed; `pnpm test:e2e` passed **8/8** Chromium flows on port 3117 with the mock provider and pairing on, including the new tutor coach spec; `experiments/quest-browser/test-all.sh` passed (66 Node tests, the Python suite and 3 browser workflows including `browser-coach.cjs`).
- **Real provider, desktop, 2026-09-20 about 01:50 EDT:** a paired dev server (`ALLOW_USB_LOOPBACK=true`, `PAIRING_ORIGINS=http://127.0.0.1:3201`, `AI_PROVIDER=openai`) served `/tutorial`; a Chromium page with the fake microphone paired with the bootstrap author code, published a two-step guide (`POST /api/coach-guides` 200), and Start coach reached **live** in 1.7 s (`POST /api/live/sessions` 201, so the server-owned side channel opened against real OpenAI). A typed "What do I do now?" returned the stored step text; a step change posted `…/step` and was acknowledged (204); "Okay, I'm done. Is the step complete?" returned "I cannot check the completion, the system only verifies the hand movement checkpoint." Stop returned the badge to idle. On the review page, Draft titles from narration sent a synthetic 1.56 s tone: `whisper-1` transcribed it as "Oh" (expected for a tone) and `gpt-4.1-mini-2025-04-14` returned a draft flagged for review with provenance `model`, so the transport, auth and provenance path work end to end. No spoken audio was heard in this run; that needs a human with a microphone.
- **Still unverified:** microphone, WebRTC and an immersive WebXR session together on the Quest 3S; spoken answers heard from the headset; behaviour on venue Wi-Fi for the WebRTC leg.
- **Catch-up:** merged `codex/webxr-foundation` (PR 26, containing PR 24, PR 23 and PR 17), which moved the tutor to `apps/webxr` and retired Unity. Re-applied the coach hooks against the reworked guide, panel and entry script, moved the bundle output, the API tutor root and the docs to the new paths, and kept the preview-first practice flow from PR 24 intact.

### 2026-09-19 — Connect the browser UI/UX base

- Ported the discussed charcoal/warm-gray direction into the real DOM and WebXR view model: Create/Follow tiles, compact active panels/dock, shared appearance preferences, accessible custom pickers, reduced-motion styling and matching canvas hit targets. Existing recording, workspace, save-position and learner gate authorities remain intact; no Unity changes.
- Added in-headset review pause/trim/keep-and-add, recording pause on settings, unfinished-take exit recovery, restrained cyan hologram presentation and an advisory next-path cue. Trimming requires re-review and drops the old endpoint photo. Save completion/green/ding now waits for durable local persistence, with explicit failures and old-session response rejection. Feedback has cooldown/mute and avoids sounding during narration capture.
- Validation: `test-all.sh` passed 60 Node tests, 52 Python tests and 10 browser workflows with isolated temporary runtime data and provider credentials disabled. New coverage includes delayed/failed saves, session reset during a save, trim invalidation, settings pause, exit recovery, theme/mute persistence, pointer/keyboard pickers, canvas hit targets and narrow-screen overflow. Browser audio was muted for regression runs. `pnpm check` passed 361 tests, typechecks, builds and 130 static Unity GUID checks; `pnpm validate:fixtures` and all seven repository Chromium workflows passed. Existing Vite chunk-size warning remains.
- Visually inspected Home and Create, charcoal and warm-gray appearance, 375px layout and rendered immersive Home/Follow canvases. No new Quest/human, native build or paid-provider test was performed. Physical comfort, hand visibility, tracking and simultaneous camera/mic/XR remain headset acceptance work. Detailed instruction text editing remains outside AR; the voice/vision/OMNI loop and dynamic object retargeting are not implemented by this UI change.
- Added `docs/web-ui-base.md` with exact source seams and acceptance steps. Publication is a separate UI/UX PR stacked on browser-foundation PR #17; no merge or teammate messages requested.

### 2026-09-20 — Preview-first, hands-free browser practice

- User's Quest feedback identified exact pose chasing and reaching for Next while holding an object as usability failures. Added a contextual practice phase controller: 0.75× preview, broad start hold, relaxed ordered movement gates, 1.2-second transition, automatic next preview and movement-only final summary. Legacy strict follower remains unchanged by default. Automatic transitions never call physical/self-confirmation.
- Start regions use one ring and disappear during practice. Ghost fingers now use smoother tapered translucent segments with separate material opacity, plus palm fill/contour. These remain procedural hands. No automatic object localization, shirt resizing, grip grading or occluded-hand inference was added.
- Added regression coverage for preview-before-practice, lateral variation, stationary hands in overlapping regions, tracking/focus interruptions and hands-free multi-step/final progression without physical confirmations. Fixed the custom picker's hover rebuild stealing keyboard selection. `test-all.sh` passed 63 Node tests, 52 Python tests and all 10 browser workflows. `pnpm check` passed 361 tests, typechecks, builds and static Quest checks. Prior passing fixture validation and seven desktop app workflows were reused because their inputs are unchanged. Existing Vite chunk warning remains.
- Inspected generated ghost review and immersive transition images. No fresh Quest/human acceptance or paid provider calls. Local server 4345 serves the new files; Quest must leave AR and reload to receive them. No private recordings/runtime data are published.
- Added `docs/web-practice-flow.md` and linked it from AGENTS.md with phase ownership, exact tuning values, event semantics, voice/OMNI/vision boundaries, known limitations and headset acceptance. Separate PR stacks on UI-base PR #23; no merge requested.


### 2026-09-20 — Retire Unity and establish the PR #17 WebXR foundation

- **User decision / scope:** The user scrapped Unity and selected PR #17 as the product foundation, requesting a new branch and worktree. Created `codex/webxr-foundation` in `/Users/aidanjeon/.codex/worktrees/trail-webxr-foundation/trail` directly from PR #17 head `40514f519a8db6b9fac3c47e223ecdc2ba474cc2`, which already includes main `6b0a069`. The original dirty Unity checkout and all other worktrees remain untouched. Changes are local and uncommitted; no publication, PR mutation, merge, deployment or account/tool uninstall was requested.
- **Foundation:** Promoted `experiments/quest-browser` into `apps/webxr` as `@trail/webxr`, with its own exact Three.js dependency and existing hash/license verification. Root `pnpm dev`, `pnpm dev:xr` and `pnpm start` now launch the tutor. Added setup/test/Quest-open commands; the existing desktop/API/vision launcher is `pnpm dev:desktop`, and built Fastify startup is `pnpm start:server`. Updated Playwright and hosted CI to use the appropriate entry points. Setup can retry interrupted Python installs and refresh requirements. USB launch respects `PORT` and regenerates vendor files after checkout.
- **Routing / compatibility:** `/tutorial` remains stable and `/` now runs the same tutor mode. The former image-checker home is `/lab`; its camera/AR links are updated. Browser v3 JSON, IndexedDB identifiers, capture/review/following, transforms, media lifecycle and save semantics are preserved. Verified the ten core recording/guide/follow/assist/store/review/motion/narration/camera files match PR #17 byte for byte. Existing browser libraries remain on their original device/origin; no private storage was copied or deleted.
- **Retirement:** Removed `apps/quest` completely, all repository C#/Unity asset/project files, native diagnostic/test harnesses, editor/APK commands, static GUID checks, native CI result verification and C# codec generation/parity. Retained the shared TypeScript backend, API formats and fixtures. Its legacy capture sidecar/joint-map vocabulary remains for import compatibility, explicitly separate from the WebXR format; it is not an active native runtime or automatic WebXR adapter.
- **Guidance:** Replaced the active plan, agent guide, README, device checklist and team/validation guidance with the WebXR direction. Removed native-only setup/capture/guide/porting runbooks and corrected remaining backend commands/status copy. Preserved the historical log and browser session/research evidence; historical links may describe paths removed by this migration and should be read at their recorded revision. The clean design reference, paired coach adapter and real device/provider acceptance remain future work.
- **Automated validation, uncommitted worktree:** Frozen-lockfile installation passed after adding only the WebXR importer to the lockfile. `pnpm check` passed strict typechecks, 358 tests across 31 files, TypeScript builds and hash-verified Three.js preparation. The three retired tests were two native runner cases and one generated C# parity case; shared fixture regeneration/corpus coverage remains. `pnpm validate:fixtures` passed. `E2E_PORT=3437 pnpm test:e2e` passed all seven synthetic desktop workflows. `pnpm test:webxr` passed 56 Node tests, 53 Python tests (including the new product/legacy route regression) and nine synthetic browser workflows, with the Create/Follow flow exercised from `/` and existing `/tutorial` reload/import coverage retained. All provider inputs were mocked/disabled.
- **Startup / structural verification:** Both actual root launch commands, `pnpm dev` and `pnpm start`, passed on isolated temporary ports/data, confirming source ownership, `/`, `/tutorial`, `/lab` and verified vendor assets; owned processes were stopped. actionlint, shell syntax, JSON Schema export, 113 non-log local Markdown targets and Markdown anchors passed. Checked removal of all repository C#/Unity project/assets and exclusion of generated vendors, Python environments and private runtime data. Patch whitespace passed. The existing Vite large-chunk warning remains; Python 3.14 emitted non-failing HTTP-error cleanup warnings in inherited tests.
- **Evidence limits:** No hosted CI run on this unpublished branch, paid model call, real Quest/ADB launch, live coach/OMNI integration, concurrent mic/camera/hands trial or physical-transfer acceptance was performed. Software/browser results do not establish those capabilities.


### 2026-09-20 — Catch the WebXR foundation up to PR #23 and PR #24

- **User correction / live inspection:** The user identified PRs #17, #23 and #24 as the latest WebXR version. Verified their actual open heads and dependency stack: #17 `40514f519a8db6b9fac3c47e223ecdc2ba474cc2` → #23 `a10b9f75790c8039d3a81b2ca80a26bf406fadb7` → #24 `8c83d2b20e3e8177b52eda61ef440dd58f227aad`. The initial foundation used only #17; this entry supersedes its source baseline and pending-UI statements.
- **Integration:** Safely snapshotted the existing uncommitted migration, fast-forwarded `codex/webxr-foundation` to #24, and reapplied the migration. Resolved documentation/history conflicts and directory relocation for the newly added UI/design/feedback/picker modules, stylesheet and tests. The server now serves every new asset while retaining the foundation's tutor-at-root and `/lab` routes. Unity removal, `apps/webxr`, root launch commands and browser data compatibility are preserved. No merge remains in progress; no new migration commit or publication was created, and none of the upstream PRs was modified or merged on GitHub.
- **Current behavior:** PR #23's connected charcoal/warm-gray UI, in-headset review/trim, settings/recovery and durable-save feedback are included. PR #24's preview → ready → practice → transition flow, relaxed ordered gates, stationary/excursion guards, automatic next-step demonstrations and smoother procedural ghosts are included. Automatic completion is movement-only, leaves physical results unverified and does not create learner confirmations. Updated active docs, ownership and agent guidance to reflect the implemented UI and remaining coach/device work; moved new source-map paths to `apps/webxr`. Preserved all upstream and local historical log entries.
- **Fresh validation:** `pnpm test:webxr` passed 63 Node tests, 53 Python tests and all 10 synthetic Chromium workflows with provider credentials disabled and temporary data. The root route exercises the full latest Create/Follow flow; `/tutorial` remains covered elsewhere. All 18 core UI/practice/recording/storage/media files match #24 byte for byte. Of the source package, 57 files match #24 unchanged, 16 carry the migration's existing documentation/launcher/route adjustments, and the retired native handoff remains deleted. No repository C#/Unity source or old experiment directory returned. Inspected the generated desktop and immersive Follow images; this is browser rendering evidence only.
- **Reused checks / limits:** Confirmed the backend, desktop, shared packages, fixtures, build scripts, package/lock manifests, Playwright configuration and CI are unchanged from the prior passing worktree. Reused its 358-test `pnpm check`, fixture validation and seven desktop workflows. Rechecked patch whitespace plus 127 non-log local Markdown targets and anchors. PR heads were verified again after integration. No new hosted CI, real Quest/ADB test, live provider/OMNI call or physical-transfer acceptance was performed. The migration remains local and uncommitted on top of #24.


### 2026-09-20 — Publish the WebXR foundation and begin review repair

- The user authorized commit/push, a new PR, a comment/CI babysitting loop and independent staff review on a subagent. The PR will stack on #24 (`codex/preview-practise-flow`) so its diff isolates the runtime promotion and Unity retirement; #24 already contains #23 and #17. Confirmed the fetched base remains `8c83d2b` and no existing PR or remote branch duplicates this foundation.
- Reused the passing full software evidence above because implementation/check inputs are unchanged. Rechecked actionlint, patch whitespace, new-source exclusions and the actual base. No private recordings, credentials, Python environment, generated vendor assets or runtime state are included. An independent read-only staff-review subagent is inspecting the complete migration; its verdict and any repairs will be recorded when available.
- Review repair is bounded to three fix/push cycles per invocation and does not authorize merging, deployment, invoking external review bots or posting reviewer replies. Ongoing monitoring will notify only meaningful changes, actionable failures or completion. No new headset/provider acceptance is claimed.

- Independent staff review identified two inherited diagnostic links missed by the root-route promotion: the tutorial's Camera diagnostics and the hand experiment's Laptop diagnostics still pointed to `/`. Corrected both to `/lab`, preserving access to the retained image lab. Corrected CI documentation to ten WebXR browser workflows. These are migration repairs; no progression or media logic changed.

### 2026-09-20 — PR #26 first review cycle

- Published [PR #26](https://github.com/aidanjnn/trail/pull/26), stacked on #24, at `a875cca7aeb836cfd397f96e50c3ff7f191bb2e5`. Hosted workspace checks, desktop/WebXR browser tests, workflow validation and the aggregate gate all passed for that revision. The independent staff-review subagent approved the migration at 93/100 after verifying the three fixes above, independently passing 63 Node and 53 Python tests and checking product/legacy routes plus absolute HTML asset/navigation targets. Its verdict is a local review, not a GitHub approval or headset acceptance.
- The automatically triggered Greptile review raised two verified issues. Restored generic `*.keystore` and `*.jks` secret exclusions independently of the retired Unity paths. Clarified both fresh-checkout guides that the existing POSIX launchers support macOS/Linux and do not support native Windows startup. No runtime implementation, dependencies, wire formats or progression behavior changed in this repair.
- Focused validation checks signing-key exclusion at the root and nested paths, the tracked example environment file, documentation links and patch whitespace. Prior full local and hosted runtime results remain applicable to their unchanged inputs; the new commit receives its own hosted run. Review threads are left for reviewer resolution; no bot was summoned, reply posted, PR merged or deployment performed. Real headset/provider and physical-transfer acceptance remain untested by this migration.

### 2026-09-20 — PR #26 staff review and migration privacy repair

- **Review scope / verdict:** Reviewed head `13f6597edde07b4a08f32ab23a3f8bc58a87c651` against its actual base, PR #24 at `8c83d2b20e3e8177b52eda61ef440dd58f227aad`, including the complete migration inventory, changed launch/server/vendor paths, preserved browser core and API formats, CI, documentation and existing review feedback. Initial verdict: **Request changes, 89/100**. Dimension scores (standard skill weights): correctness 96, privacy/data integrity 60, architecture 96, simplicity 94, tests/evidence 90, recovery 90, repository/docs 90. This is a review judgment, not a physical-product measurement.
- **P1 finding:** Moving the browser app's `.gitignore` and removing the native exclusions made private files left in the old directories stageable. A temporary Git repository with synthetic placeholders reproduced six exposed paths on the PR head versus zero on the base: the old browser provider-key file, camera reference cache and recording, plus two native credential settings and a native recording. No real credential or personal media was read or copied; this establishes an accidental-publication risk, not an observed leak.
- **Repair:** Ignore the fully retired `experiments/quest-browser/` and `apps/quest/` directories at the repository root. Git leaves ignored local files behind during a source move/removal; these exclusions preserve their privacy without restoring retired runtime code or altering the active WebXR app. The earlier signing-key and POSIX-support review comments are already addressed in `13f6597`.
- **Verification / limits:** Focused synthetic upgrade checks passed: all 21 legacy/current private-data, generated-output and key paths stayed excluded from discovery and `git add`, while six current source/configuration paths including `.env.example` remained stageable. Patch whitespace passed. Hosted Check run `35491211871` passed every job on `13f6597`; reuse its workspace, fixture and synthetic-browser results for unchanged runtime/check inputs, with a new hosted run for this repair. The demonstrated finding is fixed; the local code-review verdict is **Approve, 94/100** (privacy score 96; other dimensions unchanged). The already-addressed POSIX-support review thread remains unresolved on GitHub. No merge, external review invocation or reviewer reply/resolution is authorized by this request. Headset/provider/physical-transfer acceptance remains untested.

### 2026-09-20 — Immersive launcher and continuous hand surfaces

- Replaced the browser-first workflow with Trail → Enter the experience. Normal Create/Follow, optional capture preparation, save-position selection, placement, recording, review and practice operate inside AR. Existing browser editing/import/export remain in a collapsed recovery section. The first pose can provide starting-reference metadata without mandatory desktop typing.
- Added sequential camera/microphone preparation with partial-denial and hands-only fallbacks, reuse of live resources, cancellation generations, session-end cleanup and a real XR exit-confirmation dispatch fix. Browser-controlled permission dialogs and simultaneous capture/XR still need Quest acceptance. No microphone/camera is requested merely by loading or entering the app.
- Replaced tutorial/review joint spheres and rods with generic left/right skinned hands from Immersive Web input profiles at f4992299601614adbfefd398dc8e281556bb7444. Preserved MIT attribution and SHA256 provenance; vendored exact-locked Three.js loader/clone dependencies. The cyan rim material uses the original 25 joint poses underneath; no personalized anatomy, forearm, cloth occlusion or missing-tracking inference. Incomplete joint sets hide the skin.
- `test-all.sh` passed 65 Node tests, 52 Python tests and all 11 browser workflows on the uncommitted worktree. New coverage loads/renders actual GLBs/shaders, hides joint geometry, preserves input poses, checks incomplete tracking, permission denial/cancellation, immersive preparation, initial browser layout and user-triggered XR request without capture prompts. `pnpm check` passed 361 tests, typechecks, builds and 130 static Quest GUID checks. Prior fixture validation and seven desktop workflows are reused because their inputs are unchanged. Existing Vite chunk-size warning remains.
- Visually inspected desktop/mobile launchers and continuous hand renders; refreshed the user's local browser launcher. Server4345 serves these changes without paid API credentials. No fresh headset/human or provider test; Quest must exit AR and reload. Added `docs/web-immersive-entry.md` with source seams, provenance, integration boundaries and concrete hardware checks. Follow-up PR stacks on #24; no merge requested.

### 2026-09-20 — Repair PR #25 permission-focus recovery

- Reproduced preparation remaining in `media-wait` when a browser permission prompt causes XR focus loss: the shared UI epoch rejected its own in-flight capture result. Bound capture setup to the take/session generation instead, retaining cancellation and stale-session rejection. Settings cannot strand a pending prompt.
- A synthetic Chromium regression failed before this repair and passed afterwards, covering focus interruption, settings, Hands only cancellation and exit/new-session isolation. Full stack reconciliation and the broader software gate follow separately; this test does not establish real Quest camera/microphone permission behavior.

### 2026-09-20 — Repair PR #17 review findings

- **Scope:** User requested fixes for the three staff-review findings on PR #17 at `40514f5`. Created isolated `codex/pr17-review-fixes` from that revision; preserved the original checkout's Unity work.
- **Progression and readiness:** Replaced tracking-coverage-based hand selection with an explicit reviewed Left/Right/Both choice. Shared pure preflight checks required palms and timestamp continuity for review, finishing, import readiness and follower construction. The 75%-tracked moving hand can no longer disappear from the guide's requirements; even one missing required palm blocks approval with the gap time and repair instructions. Single-hand lessons remain supported through an explicit choice.
- **Compatibility:** Preserved the v3 JSON shape and existing `guide_hands` values. Missing/legacy `recorded` selection reopens approval/completion as a draft; clips with required-hand gaps lose readiness. Library labels validate this state. Existing motion/media are retained; native contracts are unchanged. Updated browser instructions and compatibility notes.
- **Durable saving:** Final approval waits for IndexedDB before publishing the finished state or showing/speaking save success. Failed writes retain the draft, show a headset error and retry control, and preserve optimistic concurrency. Pending/failed writes trigger the existing page-exit protection. A save may finish after exit without replacing a later session's screen. Recording-save diagnostics now follow successful writes. Removed the review's trailing whitespace finding.
- **Automated / desktop fixture evidence:** Prototype `sh test-all.sh` passed 60 Node tests, 52 Python tests and 10 synthetic Chromium workflows in this worktree. New regressions cover asymmetric tracking, missing reference palms, timestamp gaps, legacy readiness migration, one-hand learning, quota failure, pending writes, retry, stale-tab conflict, focus interruption and late completion. Existing Python tests emit resource-cleanup warnings under the local Python 3.14 runtime but pass. The first isolated server startup exceeded its readiness timeout; after loading the installed dependencies, the subsequent full isolated run passed. The expanded browser regression also passed after adding desktop approval and rendered retry-target checks; the save-failure panel was visually inspected. Edited browser documentation links/fences passed. Locked pnpm dependencies installed without lockfile changes; `git diff --check` passed. No new Unity, paid-provider or Quest/human acceptance is claimed.
- **Publication follow-up:** User requested committing and pushing these fixes to the existing PR #17 branch. Confirmed its remote head still matches `40514f5`; reused the passing checks above because implementation and test inputs are unchanged.

### 2026-09-20 — Staff review and repair Zain's PR #23

- Reviewed the complete `a10b9f7` diff against its browser-handoff merge base and immediate UI, storage and XR action consumers. Merged PR #17's `84d1c75` repair, retaining explicit required hands, readiness migration, awaited final publication and visible local-save retry alongside the new UI and feedback. Preserved both activity histories.
- Fixed the real AR Exit handler bypassing unfinished-take confirmation, including repeated Exit while confirmation is open. Applied required-hand preflight to Keep & add, so missing/automatic hands cannot be approved through that alternate action. Reproduced the keyboard picker regression and carried forward the existing #24 hover-repaint correction.
- Regression coverage exercises the actual application Exit dispatcher, valid/invalid Keep & add, quota/conflict failures, pending and late durable saves, retained trimming and hit targets. Prototype checks passed: 64 Node cases, 52 Python cases and 11 synthetic browser workflows. `pnpm check` passed 361 tests, typechecks, builds and static scaffold checks; fixture validation and all seven repository Chromium workflows passed. Existing Vite chunk warning remains.
- Staff verdict after repair: Approve with nits, 90/100 (correctness 93, trust/data 93, architecture 88, maintainability 85, tests/evidence 88, recovery 92, docs 92; weights 25/15/15/15/15/10/5). Remaining limitation is fresh Quest interaction/comfort/tracking acceptance, not demonstrated software breakage. Hosted checks are checked separately after push. No native source, paid provider or headset/human validation changed.

### 2026-09-20 — Staff review and repair Zain's PR #24

- Reviewed `8c83d2b` against its actual UI base, including preview/practice/transition ownership, relaxed gates, visual feedback and tests. Merged the tested PR #23 repair, preserving required-hand validation and all save/exit fixes.
- **P1 fixed:** A 10 cm out-and-back recording produced only coincident start/end gates, so stationary hands completed it automatically. The new regression failed before the fix. Coarse gate sampling now retains omitted turns with more than 4 cm deviation from the segment between gates, and required excursion is computed from the full recording once at construction. Existing start/matching tolerances are unchanged. Following the complete excursion still finishes.
- **P2 fixed:** Added automatic movement-only completion events to the diagnostics allowlist; the integrated two-step browser run verifies both are exported and no physical confirmations are invented.
- Automated validation: 68 Node cases, 52 Python cases and all 11 prototype Chromium workflows passed; the integrated two-step workflow was rerun after adding the diagnostics assertion. Reused PR #23's passing `pnpm check` (361 tests/typecheck/build/static scaffold), fixture validation and seven repository browser workflows because their inputs are unchanged. Hosted checks are assessed after push. No headset, live provider or native runtime acceptance was performed.
- Staff verdict after repair: Approve with nits, 90/100 (correctness 94, trust/data 93, architecture 88, maintainability 86, tests/evidence 88, recovery 90, docs 92; weights 25/15/15/15/15/10/5). Broad tolerances and automatic movement transitions still require fresh Quest/human tuning; physical-result correctness remains explicitly unverified.

### 2026-09-20 — PR #26 catch-up after the base advanced during babysitting

- After privacy repair `d1feba7` was pushed, PR #24 advanced from `8c83d2b` to `44de6fdcaa5b1c65cca82aa1b44b194a54d44a01`, incorporating fixes from PRs #17/#23 and its own review. GitHub subsequently reported PR #26 conflicting. Merged the actual base without rewriting published history; retained both activity histories, relocated the two new regression files under `apps/webxr/tests`, and carried the upstream hand-review/save-recovery documentation into the promoted README while keeping the old directory retired.
- Preserved explicit required-hand selection and continuous recorded-hand checks, durable approval/save recovery, review/player reconciliation, unfinished-take exit protection, short-excursion gates and movement-only diagnostic events. The core motion/review/save modules and new regressions match the updated upstream byte for byte; root `/`, stable `/tutorial` and `/lab` routing remain intact. Updated the active plan's baseline and eleven-workflow counts.
- Fresh `pnpm test:webxr` passed **68 Node tests, 53 Python tests and all 11 synthetic Chromium workflows**, using temporary runtime data and disabled provider credentials. Checked 27 local documentation targets, resolved all merge entries and verified patch whitespace. Shared/backend/desktop/fixture/dependency/check inputs remain unchanged from passing hosted run `35491211871`; those results are reused, with hosted CI to run on the new merge commit. Existing non-failing Python HTTP-error cleanup warnings remain. No new Quest, paid-provider or physical-transfer evidence is claimed.

### 2026-09-20 — Complete PR #25 staff review and stack reconciliation

- Reviewed the complete `6d10bec` delta against its preview/practice base: launcher, actual XR action routing, sequential optional media, resource generations, skinned assets/pose mapping, local vendoring and tests. Merged PR #24's `44de6fd`, retaining the #17/#23 durable-save and required-hand fixes, the protected real Exit handler, and #24's short-excursion/diagnostics repairs. Preserved the immersive launcher and both activity histories.
- **P1 fixed:** Permission-prompt focus loss no longer strands capture setup. Session replacement, Hands only and exit still reject late results. The new browser regression exercises those transitions; settings is unavailable while a request is pending.
- Final prototype gate passed 70 Node cases, 52 Python cases and 13 synthetic Chromium workflows, including actual GLB/shader rendering, permission recovery, local IndexedDB failures and the two-step automatic practice flow. Inspected the generated skinned-hand and save-failure images. Reused PR #23's passing 361-test workspace gate, fixture validation and seven repository Chromium cases after confirming all their source/config inputs are unchanged; hosted checks are assessed separately on the pushed heads.
- Staff verdict after repair: Approve with nits, 89/100 (correctness 92, trust/data 92, architecture 88, maintainability 86, tests/evidence 85, recovery 92, docs 92; weights 25/15/15/15/15/10/5). Fresh Quest camera/mic/XR permission concurrency, real skin pose/contrast and user comfort remain untested. No paid provider request or native runtime test was performed.

### 2026-09-20 — Align the main README with the WebXR product direction

- **User request:** Update `README.md` on `main` to reflect PR #17's move from Unity to WebXR, retaining the document format and system architecture with a new diagram.
- **Scope:** Fast-forwarded local `main` to fetched `origin/main` `6b0a069` in a separate checkout, preserving the original Unity setup checkout and its unrelated edits. Read PR #17 at `40514f5`, its browser setup/delivery documents and scripts, and the current main service implementations. PR #17 remains open; no browser code was merged by this documentation change.
- **Documentation:** Preserved the top-level section order, tables, numbered experience and Mermaid format. Updated the runtime, placement, IndexedDB persistence, setup, USB launch, implementation sequence and evidence boundaries for Quest Browser/WebXR/Three.js. Replaced the architecture diagram while retaining the main Fastify API, dedicated vision backend, trusted voice sideband and local progression authority. Marked the remaining browser/service connections explicitly, corrected stale backend scaffold claims and linked PR-only documents to their exact source snapshot. Replaced the long Unity installation path with browser instructions and retained a link to native reference work.
- **Validation:** On this uncommitted main checkout, checked 22 local links/anchors, three PR document targets, eight balanced code blocks, all eight referenced pnpm scripts, shell syntax for the three referenced PR launch/test scripts, preserved section order and patch whitespace. Rendered the final 14-node Mermaid diagram with cached Mermaid 11.15.0 in headless Chromium and visually inspected it. Runtime code, dependencies and contracts are unchanged, so application/native suites were not rerun. Earlier PR test counts are explicitly attributed to their source revision; no new live-provider or headset/human evidence is claimed.
- **Publication follow-up:** The user requested committing and pushing this documentation directly to `main`. Refetched `origin/main` and confirmed it still matches `6b0a069`; PR #17 is still open at `40514f5`. Reused the unchanged README's passing link, command, structure and diagram checks, and rechecked patch whitespace before staging only `README.md` and this activity log.

### 2026-09-20 — Catch PR #17 up with main for Greptile review

- **Request and isolation:** User requested catchup and Greptile reviews on PR #17. Created an isolated `codex/pr17-catchup-greptile` worktree from published head `84d1c75`, preserving unrelated Unity work and the previous repair checkout.
- **Catchup:** Merged actual base `origin/main` at `9eed905`. Resolved the README conflict by retaining main's WebXR architecture/setup and the PR's runnable entry point/native handoff. Local links now follow the included browser documents; preserved revision-specific validation and reflected the ten current browser workflows. Retained both activity-log histories. Runtime code, tests, dependencies, contracts and CI are unchanged from the PR head.
- **Validation:** Local README links/anchors and reference definitions, referenced pnpm commands, code fences, three launch/test shell scripts, conflict-marker absence and patch whitespace passed. The Mermaid diagram is byte-identical to main's previously rendered diagram. Reused unchanged application checks recorded above, including the `84d1c75` prototype regressions; did not claim a new application, Unity, live-provider or headset run. Hosted CI and the user-authorized Greptile review will run after publishing this merge.

### 2026-09-20 — Catch open PRs up to their actual bases

- Audited all six open PRs using freshly fetched refs. #17, #23, #24 and #25 already contained their bases. #26 was seven commits behind; an independent task published the same runtime/test catchup while this audit ran. Verified its new `70bd008` head contains #24 at `2566e59`; retained that published result instead of replacing it. The equivalent runtime/check inputs passed 358 workspace tests, typechecks/builds, fixture validation, seven desktop workflows, 68 WebXR Node tests, 53 Python tests and eleven synthetic browser workflows here.
- Merged #28's original base #17 at `32d3020`, retaining the voice coach hooks, page-exit shutdown, narration drafting/title fields and tests together with required-hand validation and durable-save recovery. Corrected the coach e2e fixture to make the required hands explicit; reproduced its former readiness failure before the repair. Preserved both README intents and all activity history.
- This intermediate #28 tree passed `pnpm check` (workspace typechecks/tests/builds and static scaffold only), fixture validation, all eight desktop workflows including paired coaching, and 70 browser-module Node tests. The standalone browser suite was initially started before shared-package build completion and could not resolve the contracts package; its complete run is deferred to the final integrated tree. No native runtime, live provider or headset test is claimed.
- During validation #28 was retargeted on GitHub to #26 (`codex/webxr-foundation`). The following local merge carries this resolution into that actual base; this intermediate merge is not separately published.

### 2026-09-20 — Carry the refreshed PR #17 foundation through Zain's stack

- PR #17 advanced to `32d3020` during downstream review, incorporating main's WebXR README. Merged that actual base into #23 and carried it into #24/#25, preserving both append-only activity histories. Only README and activity-log inputs changed, so previously passing application and prototype evidence remains applicable. Verified local documentation targets, conflict-marker absence and patch whitespace; hosted checks are rechecked on the new published heads.

- PR #26 follow-up: its base advanced again to `2566e5948cf6be4974cea4ccf171df907fdca28a` with the refreshed main README and activity history only. Merged that update after the tested runtime catch-up, preserving the README's section order and exact Mermaid architecture diagram while adapting source paths, root launch commands, support limits, runtime retirement and implemented UI/practice status. Preserved both activity histories and updated the plan baseline. README links/anchors/reference definitions, shell syntax, all 14 referenced pnpm scripts, code fences and patch whitespace passed. Runtime and check inputs are unchanged from the immediately preceding successful validation; no extra hardware/provider claim or remote PR merge is implied.

### 2026-09-20 — Integrate voice PR #28 with its retargeted WebXR foundation

- Merged the actual new base `codex/webxr-foundation` at `70bd008` into the voice work after GitHub retargeted #28 during the catchup. Preserved the foundation's runtime relocation, Unity retirement, root launchers, reviewed-hand/durable-save repairs, and automatic movement-only practice. Retained all voice modules, narration title/draft UI, coach lifecycle hooks, server-owned text context and both activity histories.
- Updated API static-root and coach-bundle output paths to `apps/webxr`; kept both build outputs and made standalone coach builds prepare their shared contracts dependency. Carried coach hooks into automatic next-step previews and Repeat/Watch recovery, kept Ask coach visible in the compact practice controls, and preserved tracking/error messages over optional coach captions. Updated active source/launch/feature documentation to the combined tree.
- Regression integration: both coach fixtures explicitly review required hands; the browser coach waits for its own card instead of an old home headline. The real synthetic two-step guide workflow now asserts automatic transitions update coach context, Repeat creates a new coach attempt, Ask leaves local progression unchanged, and exit stops the coach.
- Automated validation on this integrated worktree: frozen-lockfile install; `pnpm check` with 365 tests across 33 files, typechecks and all production builds; `pnpm validate:fixtures`; eight desktop Chromium workflows on isolated port 3468; and `pnpm test:webxr` with 78 Node tests, 53 Python tests and all twelve synthetic browser workflows. Reused the already prepared Python environment with identical requirements. Existing Vite chunk and Python HTTP-error cleanup warnings remain non-failing. Checked 74 local documentation targets, fences, conflict-marker absence and patch whitespace. No live provider, headset/human or physical-transfer acceptance was run.
- Before publication, the concurrent voice update at `732d716` is also incorporated by a normal merge so its published history remains intact; it had merged an older foundation and still lacked the reviewed base changes.

- Concurrent voice merge validation: retained the remote caption timestamp/accessor and its 12-second expiry, while preserving tracking/review errors and the local practice phase. Nine focused Node cases passed, followed by 78 Node and 53 Python cases and browser coverage through the combined guide scenario. The new caption assertion initially encountered the intentionally retained rejected-confirmation message; it now uses the actual Ask action before checking captions, then verifies expiry and tracking-warning priority. The corrected complete two-step browser scenario passed on an owned temporary server. Reused the preceding full gate and unaffected browser results; no provider call or hardware observation was added.

### 2026-09-20 — PR #26 Settings exit-confirmation repair

- Hosted Check run `35491567013` passed all four jobs on `70bd008`. The automatic Greptile review then reported an inherited P1 outside the migration diff: Settings opened from `confirm-exit` or `confirm-discard` did not preserve unfinished-take protection when the global Exit control was pressed. Verified against the current promoted runtime; the new browser regression failed before the fix with `Settings bypassed exit and discarded the take`.
- Extended the existing exit guard to protect both confirmation return states. The regression invokes the actual application action handler, verifies both Settings paths keep the take, checks Stay preserves the paused frames, and confirms explicit discard still clears the take and ends the session. No storage/progression semantics or tracking thresholds change.
- Fresh `pnpm test:webxr` passed 68 Node tests, 53 Python tests and all 11 synthetic Chromium workflows, including `settingsExitConfirmation`. Provider credentials were disabled and runtime data temporary. Reuse the unchanged shared/backend/desktop/fixture/workflow evidence from `35491567013`; the repair receives a new hosted run. No new headset, live-provider or physical-transfer validation was performed. Review comments are not replied to or resolved by this task.

- Final base refresh: PR #26 advanced to `a8bdf23` with the Settings/Exit unfinished-take confirmation fix. Merged that current base and preserved both activity histories. The actual UI exit regression (including both confirmation routes through Settings) and the full synthetic two-step coach/practice workflow both passed in an isolated browser server on the combined tree. Other software evidence above remains applicable to unchanged inputs.
- **Review fixes (PR 28, Aidan):** `start()` now carries a generation that `stop()` and a tutorial change invalidate, checked after every await, so a cancelled startup never creates or connects a coach (two regressions added: stop during pending publish, newer start superseding an older one). Narration proposals are bound to the drafted step's id, duration and narration; a trim or narration change retires the proposal in place and Apply refuses it. Test seeds now declare required hands, which the refreshed foundation demands before a tutorial can be finished.
- **Code-review pass (PR 28, 13 inline findings):** fixed ten. Browser speech is silenced only while the coach is taking a question, not whenever it is connected, so step instructions are still read aloud in live mode; the coach guide mapping is verified against the server at Start (a wiped server republishes, a republish from another device is adopted); live captions accumulate per coach turn instead of showing the last delta; Enter in the pairing form no longer reloads the page; narration longer than two minutes is refused before any request; a failed coach bundle build no longer stops the tutor (shared contracts are built first, failure warns); server errors from the session probe are reported as server problems, not pairing problems; a publish network failure reuses an earlier published revision; Apply buttons keep their Applied state; caption deltas no longer trigger a full state emit. Deferred as refactors: the duplicated pairing client between the Voice Lab, the workbench and the tutor bundle, and the duplicated voice-route error mapping in `coach-guides.ts`. The reported README link tail was not present on the synced tip.

### 2026-09-20 — Require observed movement for PR #17 palm gates

- **Request and scope:** Addressed the user's P1 review on PR #17 at `32d3020` in an isolated `codex/pr17-movement-review` checkout. Preserved unrelated Unity work. The published head is mergeable with its actual `main` base; no catchup or PR #24 dependency was needed.
- **Reproduction:** Added the review's validated 41-frame, 1.6-second, 18 cm two-palm recording. Five seconds of stationary midpoint samples advanced through overlapping targets on the old implementation; the new regression and four additional adversarial cases failed before the repair.
- **Repair:** Each moving required hand now needs net observed displacement in the recorded gate direction, at least 60% of that gate's displacement, as well as the existing target proximity and dwell. Evidence resets at every gate and on pause, missing tracking, stale/nonfinite timestamps or long sample gaps. Small oscillations cannot accumulate path-length credit; stationary support hands still require proximity. Fresh recovery requires repeating the approach, rather than counting an unobserved jump. This is prototype tuning, not measured headset accuracy; no radii, serialized formats, native code or providers changed.
- **Regression coverage:** Added seven unit cases covering the original stationary reproduction, required-hand movement, wrong/sideways/oscillating motion, short versus static references, valid one/two-hand progression, stationary support hands, and interrupted/repeated approaches. Strengthened the synthetic browser workflow to reject a held target reached during tracking loss, then complete with fresh movement. Documented recovery and retained the unchecked native handoff boundary.
- **Fresh local automated evidence:** `pnpm install --frozen-lockfile`, `pnpm check` (361 tests, typechecks/builds and 130 static native GUID checks), `pnpm validate:fixtures`, and `E2E_PORT=3487 pnpm test:e2e` (seven synthetic desktop workflows) passed. Prototype `test-all.sh` passed 66 Node tests, 52 Python tests and ten isolated synthetic browser workflows with provider credentials disabled; after the final support-hand regression/test refinements, reran all prototype Node tests: 67/67 passed. Patch whitespace passed. Existing Vite chunk-size warning remains.
- **Evidence boundary:** Results above apply to this repair's worktree contents. Hosted results will be checked after the authorized commit/push. No Unity build, new Quest/human run or live/paid provider call was performed; movement checkpoint evidence does not verify the physical task. No review replies or thread resolutions were requested.

### 2026-09-20 — Catch up the open PR stack from its actual bases

- **Scope:** User requested catchup across all stacked PRs. Refetched the six open heads and their actual bases: #17 is current with main; #23 → #24 branches into #25 and #26, with #28 above #26. Worked in an isolated checkout and preserved unrelated work.
- **PR #23:** Merged PR #17 at `957b894`, preserving both activity histories and the UI branch's existing behavior. Carried observed directional movement, reset-on-interruption semantics, and their regression coverage into the UI stack.
- **Fresh automated evidence:** `pnpm check` passed 361 tests, typechecks/builds and static scaffold checks; fixture validation and seven desktop Chromium workflows passed. The combined prototype suite passed 71 Node tests, 52 Python tests and 11 synthetic browser workflows. Existing Vite size and Python resource-cleanup warnings remain. No new native, live-provider or headset/human validation is claimed.

### 2026-09-20 — Preserve observed movement in PR #24 practice catchup

- Merged updated PR #23 at `029f696` into #24. Resolved follower/test conflicts by retaining preview-first practice, broad positional gates, retained turns, excursion checks and automatic movement-only transitions, while requiring fresh observed directional motion at every moving gate. Pause, stale time and tracking loss reset that evidence in both ordered and relaxed modes.
- Parameterized the seven incoming movement regressions across both modes. The browser recovery scenario resumes after focus loss, rejects stationary hidden jumps, then succeeds after a fresh approach. All 23 focused follower/practice cases and the complete prototype suite passed: 82 Node cases, 52 Python cases and 11 synthetic browser workflows. Verified that workspace app/package/script/test/lock inputs match the validated #23 checkout, so its passing pnpm, fixture and seven desktop checks are reused; hosted CI is checked on the published head. Patch whitespace passed. No new native, live-provider or headset/human evidence.

### 2026-09-20 — Catch PR #26 WebXR foundation up with practice

- Merged actual updated #24 base `98fd8b1` into the promoted `apps/webxr` tree. Retained both activity histories and the foundation's intentional retirement of `docs/ux-unity-handoff.md`; did not restore removed native files. Automatic rename merges preserve the same follower and parameterized regressions tested in #24, while retaining the foundation's Settings exit-confirmation repair.
- Fresh locked install and WebXR setup succeeded. `pnpm check`, fixture validation, seven desktop Chromium workflows and the complete WebXR suite passed (82 Node cases, 53 Python cases, 11 synthetic browser workflows). Inspected all incoming runtime/test/documentation changes and patch whitespace. Existing Vite size and Python resource-cleanup warnings remain. These are automated/synthetic results, with providers disabled in the WebXR suite; no new headset or live-provider acceptance.

### 2026-09-20 — Catch PR #28 voice branch up with the WebXR foundation

- Refetched #28 after its concurrent review-fix push and started from `794188a`, retaining that work. Merged the actual updated #26 base `fe4444b`; preserved both activity histories and inspected automatic README/coach-browser merges. The follower and its regression cases exactly match the tested foundation, while the integrated browser scenario retains coach context, tracking-priority and movement-only completion checks.
- Fresh locked install, `pnpm check` (365 tests plus typechecks/builds), fixture validation and eight desktop Chromium workflows passed. The full WebXR suite passed 97 Node cases, 53 Python cases and 12 synthetic browser workflows, with optional provider requests mocked/disabled. Verified every prior activity-log line survives each of the five catchup merges and checked patch whitespace. Existing Vite size and Python resource-cleanup warnings remain. No new paid/live-provider or headset/human acceptance is claimed; hosted checks are inspected after publication.

- Publication reconciliation: a concurrent task pushed the same #26 base merge as `0451d3a` before this task's push. Compared the trees: only activity-log ordering and this task's validation entry differ. Merged the published head without rewriting history; retained every remote log line and reused the complete passing checks because runtime/test/dependency inputs are byte-identical.

### 2026-09-20 — Catch PR #25 immersive entry up with practice

- Merged its actual updated #24 base at `98fd8b1`, preserving immersive entry, permission recovery and holographic hand rendering. Inspected automatic README/browser-test merges; follower source and its regression file exactly match the validated #24 result.
- Complete isolated prototype checks passed: 84 Node cases, 52 Python cases and 13 synthetic browser workflows. Reused #23's passing workspace, fixtures and seven desktop checks after confirming their inputs are unchanged. Patch whitespace passed; hosted checks are verified separately. No new native, provider or headset/human run.

### 2026-09-20 — Fluid recording and movable immersive workspace

- User requested stationary entry, freely movable controls, a work-surface timer, continuous hold-to-save recording, predictable Home, an animated searchable library and more playful sound. WebXR already uses local stationary-compatible tracking; OS boundary selection cannot be forced from the browser. Added launcher/headset guidance rather than a boundary-disable claim. Researched official WebXR reference spaces, Meta system-keyboard integration and Three.js point-and-drag examples; reused browser/Three primitives without a new framework.
- Create now defaults to motion → endpoint hold ring → saved segment → continued capture. The detector requires meaningful palm movement, valid sampling and a fresh still hold; pauses/gaps clear dwell, idle hands do not repeatedly save. Prior manual/return-save mode remains available. Segments persist locally while narration finalizes, with bounded pending jobs and honest interrupted-media/storage failure states. A single Finish action completes the accepted tutorial. This is joint/narration capture, not a new video recorder.
- Browser v3 adds optional `acceptance: hold|finish`; continuous capture is author-accepted, not falsely replay-reviewed. Export/import retain provenance and relevant edits clear it. Native contracts/progression are unchanged. Main panel and workspace timer can be dragged independently without modifying calibration. Home is globally available and recording navigation protects unfinished work. XR entry always starts Home regardless of prior entry intent.
- Added three-card library pages, title/layout search using Meta's system keyboard when available, Ready/Draft filters, short reduced-motion-aware panel entrances, and pitch-swept navigation/save/checkpoint cues with mute. Saved segments retain visual feedback and green hand flash.
- Full browser package suite passed 71 Node tests, 52 Python tests and all 12 browser workflows; `pnpm check` passed 361 tests, typechecks, builds and static Quest checks. Additional focused fluid-workspace test passed after adding stale storage-failure protection. Prior shared fixture validation and seven desktop app workflows reused because their inputs are unchanged. Inspected rendered library and live launcher; restarted the owned port4345 server with its existing runtime and provider credentials disabled. No new paid-provider, Unity or Quest/human acceptance.
- Added `docs/web-fluid-workspace.md` with complete workflow, thresholds, optional-field compatibility, reuse sources, integration boundaries and headset tests. PR stacks on #25; no merge or reviewer messages requested.

### 2026-09-20 — Reconcile fluid UX with current shared safeguards

- Merged the updated immersive-entry parent at `7843bfb`, preserving required-hand/timestamp validation, durable finalization/retry, permission-focus recovery and observed movement between learner gates. Continuous recording explicitly uses Both (or Left/Right selected in options); a missing hand cannot silently narrow requirements. Tracking gaps keep segments as drafts. Home can wait for final storage, protects confirmation screens, and replacement capture remains manual so it replaces the selected step.
- Combined prototype suite passed 91 Node cases, 52 Python cases and all 14 synthetic browser workflows. Fresh fixture validation and seven built-app desktop workflows passed. Reused the earlier passing `pnpm check` (361 tests, typechecks/builds and static Quest checks) after verifying application/package/script/test/lock inputs are unchanged by this catch-up. Inspected the rendered library; no new headset, Unity or paid-provider evidence.
- Final focused regressions passed after reconciliation: replacement capture retains its selected index, deferred Home survives final storage, and two consecutive segments retain real MediaRecorder/WebAudio narration while the next take starts. Audio inputs were synthetic tones; no physical microphone or provider was used.

### 2026-09-20 — Review PR #29 and repair capture recovery

- **Scope:** Reviewed the complete PR #29 diff at `0d026d1` against actual parent/merge-base `7843bfb` in isolated `codex/pr29-review-fixes`, preserving the main checkout's unrelated Unity work. No existing review comments were present. Detailed findings, priorities and weighted scores are in [pr29-review.md](pr29-review.md); review and fixes remain local, with no commit, push or posted review.
- **Findings and repairs:** Protected unfinished takes through Home/Exit confirmation and nested Settings/Boundary help. Made accepted segment media finalization survive discarding the next take and XR exit, while guarding replaced tutorials/steps and late screen changes. New tutorial/library flows wait for finalization; failed saves retain data, and stale desktop replacements cannot erase finalized audio. Storage failure pauses capture immediately instead of waiting for audio decoding. Desktop instruction/hand edits clear hold/finish acceptance and display honest provenance. Dragging cancels pending countdowns and pauses capture/practice/replay without moving registration. Narration startup errors remain repairable drafts.
- **Reproduction and automated evidence:** Five initial browser scenarios failed on the reviewed behavior and passed after fixes. Locked dependency installation and vendor verification passed. Full isolated prototype suite passed 91 Node tests, 52 Python tests and 15 synthetic browser workflows. After final failure-recovery refinements, reran fluid recovery (14 cases, including actual IndexedDB finalization), continuous workspace and UI-base workflows; all passed. Checked patch whitespace and documentation links. Reused current-head green hosted workspace/fixture/desktop checks only for unchanged inputs; no native changes or lockfile changes.
- **Evidence boundary:** These results describe the uncommitted review worktree. Remote PR #29 remains at `0d026d1` with green hosted checks and a mergeable actual base; its CI does not include these local repairs. No new Quest/human, physical microphone, native or live-provider validation. Hardware acceptance and the native handoff checklist remain open.

### 2026-09-20 — Deliver PR #29 review fixes

- User explicitly requested commit and push. Refetched PR #29's actual head `codex/fluid-workspace-ux` at `0d026d1`; it still matches the reviewed revision and is mergeable with its actual base. Deliver the isolated repair as a normal fast-forward to that existing branch, preserving the original checkout's unrelated changes.
- Code and test inputs are unchanged from the passing review validation above, so those results are reused. Updated the report's publication wording and inspected the complete staged patch, including the new regression and review report. New-head hosted CI is separate from the reviewed revision's green checks; no merge or posted review is part of this delivery.

### 2026-09-20 — Land PR #25 on the current main foundation

- **Request / source:** User requested that PR #25 land on `main`. Its earlier merge only reached `codex/preview-practise-flow`. Created the isolated `codex/land-pr25-main` branch from main `763676d` and merged the exact PR head `7843bfb`, preserving its original commit ancestry. PR #29 is outside this delivery.
- **Integration:** Carried the immersive launcher, optional in-AR capture preparation, permission recovery, continuous skinned hands and all associated assets/tests into the promoted `apps/webxr` tree. Resolved directory and content conflicts while retaining main's coach bundle/routes, coach shutdown, root tutor route, progression/storage safeguards and both complete activity histories. Kept the Voice coach card under Browser tools and adapted its synthetic browser and paired-API regressions to open that control. Updated current launch/source documentation; retired Unity and experiment paths remain retired.
- **Fresh automated validation, combined worktree:** Frozen-lockfile install, WebXR setup and Chromium availability passed. `pnpm check` passed 365 tests across 33 files, typechecks and builds; `pnpm validate:fixtures` passed; `E2E_PORT=3525 pnpm test:e2e` passed all eight desktop workflows. `pnpm test:webxr` passed 99 Node tests, 53 Python tests and all 14 synthetic browser workflows, including actual GLB/shader rendering, permission interruption/cancellation, coach context, durable saves and Settings exit confirmation. Inspected the generated launcher and hand renders, verified all nine newly added PR #25 source/test/asset files are preserved byte-for-byte at their new paths, checked 34 local documentation links, JavaScript syntax, unique HTML IDs and patch whitespace.
- **Evidence boundary:** Existing non-failing Vite chunk-size and Python HTTP-error cleanup warnings remain. Browser media/providers were synthetic, mocked or disabled. No new headset/human, live-provider or physical-transfer acceptance was performed. Hosted checks and the final remote main ancestry are verified after publication.

### 2026-09-20 — Preserve visible hands when PR #30 assets fail

- GitHub's full Check workflow passed on `f1860aa`. Automatic review then identified a verified P1 in #25's renderer: `enableHologram` hid the existing joints before the asynchronous replacement was ready, so capture/review could continue with invisible motion.
- Added a regression that delays real GLB requests and reproduces the invisible hand before repair, then rejects both left/right assets. Preserve the measured joint/bone display during loading or failure, switch entirely to the skin once ready, keep fallback poses fresh and hide missing tracking. Existing learning pause on an asset failure remains; its message now identifies the joint-outline fallback. Updated the hand-rendering handoff and suite count.
- Fresh checks after repair: `pnpm test:webxr` passed 99 Node cases, 53 Python cases and 15 synthetic browser workflows, including delayed/failed asset recovery and the existing loaded-skin/no-scaffolding assertions. All eight desktop Chromium workflows passed again. Reused the prior passing workspace/fixture evidence for unchanged TypeScript, build, dependency and fixture inputs; a new hosted Check runs on the repair commit. No new headset, live-provider or physical-transfer evidence.

### 2026-09-20 — Catch PR #29 up with main and review the combined behavior

- **Scope:** User requested catchup and a posted staff review. Started from the published PR head `5c167a0` in an isolated worktree and merged its actual base, main `dfaf572`, without rewriting history or touching the original checkout's unrelated work.
- **Integration:** Resolved the old experiment-to-`apps/webxr` directory moves, retaining continuous capture, movable controls and their regressions alongside main's coach integration, instruction titles, shutdown handling and holographic-hand fallback. Preserved both complete activity histories and the foundation's intentional native retirement. Updated current paths and marked the earlier PR review as historical.
- **Fresh automated evidence:** Locked install and WebXR setup passed. `pnpm check` passed 365 tests across 33 files, typechecks and builds; fixture validation passed; `E2E_PORT=3529 pnpm test:e2e` passed all eight desktop workflows. The full WebXR suite passed 106 Node tests, 53 Python tests and 17 synthetic browser workflows. JavaScript syntax, changed-document links and patch whitespace passed. Verified the hand renderer, holographic assets adapter, follower and motion core are byte-identical to main.
- **Staff review evidence:** Additional isolated synthetic browser probes reproduced stale hold acceptance after applying narrated instruction drafts, and a delayed accepted-segment save failure that leaves capture active after resuming the same tutorial. These remain review findings; the passing standard suites do not cover these two lifecycle combinations. The posted review will identify the published head and precise affected lines.
- **Evidence boundary:** Browser hands, audio and provider replies were synthetic or mocked; no new Quest/human, physical microphone, live-provider or physical-transfer acceptance. Existing non-failing Vite size and Python HTTP-error cleanup warnings remain. Hosted checks are inspected after publication.

### 2026-09-20 — Resolve PR #29 staff-review findings

- **Request / scope:** User requested all findings from the posted staff review of `1f9079d` be resolved. Verified the two current review threads against the unchanged remote head and main base, and continued in the clean isolated catchup worktree.
- **Acceptance repair:** Applying a narrated instruction draft now clears previous hold/finish acceptance alongside replay review. Regression cases exercise the actual draft/apply controls for both acceptance kinds, reject Finish while the changed instruction is unreviewed, and verify explicit review restores readiness.
- **Storage repair:** A delayed accepted-segment write failure now pauses a newer capture of the same tutorial or cancels its recording countdown, pauses narration and clears hold dwell. Tutorial identity and inactive-screen generation guards remain; accepted audio stays available for retry/export. Browser cases use the real Home/discard/continue/calibration/record lifecycle and verify no further frames are captured after failure, while a late failure on Home leaves that screen unchanged.
- **Validation:** Added five cases to the existing fluid-recovery workflow. Four failed before the runtime repairs (resumed capture, countdown, hold draft, finish draft); all 19 recovery cases passed afterward. The complete WebXR suite passed 106 Node tests, 53 Python tests and 17 synthetic browser workflows. All eight desktop Chromium workflows passed. Reused `1f9079d`'s passing `pnpm check` (365 tests, typechecks/builds) and fixture validation after confirming their TypeScript, dependency, build and fixture inputs are unchanged. JavaScript syntax and patch whitespace passed.
- **Evidence boundary:** Software and synthetic media/provider results only; no new Quest/human or live-provider validation. Hosted checks and review-thread resolution are verified after pushing the repair. No merge is part of this request.

## 2026-09-20 — Natural headset commands and origami planning

User selected a paper crane demo and requested natural spoken actions/help inside
Quest. Integrated main's PR #28 voice services and apps/webxr relocation with the
pending immersive/fluid UI stack. Added local context-checked navigation, recording,
save and help commands, paired bounded ASR/structured intent, and one-use short TTS
replies. Quest Browser inspection found AudioWorklet and microphone APIs available
but `speechSynthesis` absent; replies therefore use decoded server audio. Added a
single-origin headset launcher. See `headset-voice-and-origami.md` for ownership,
limits, full test procedure, paper-corner proposal and remaining hardware evidence.
Live API smoke used synthetic speech and five intent examples; go-back, replay,
save, negation and instruction requests mapped correctly. TTS produced valid audio.
No claim of physical crease verification or automatic object-to-XR registration.



### 2026-09-20 — Voice validation and latest-main integration

- Merged main `dfaf572` (PR #30), preserving the hand-asset fallback fix and its
  regression. Paired-browser testing caught GET status lacking the Origin required
  by cookie authentication; switched voice preflight to POST and added a cookie-role
  regression. Added a bounded audio-playback wait so stalled output cannot keep the
  command loop busy indefinitely; use the device's native audio sample rate.
- `pnpm check` passed 372 tests across 34 files plus typechecks/builds. Fixture
  validation and eight paired desktop workflows passed. Full WebXR suite passed
  112 Node tests, 53 Python tests and 17 synthetic browser workflows. Focused voice
  browser/Node/API regressions passed again after the final playback changes.
- Live provider smoke: five text intents (previous, replay, save, negation/no action,
  read instruction), synthetic-speech transcription and TTS succeeded. Connected
  Quest Browser 152 inspection confirmed microphone/AudioWorklet availability and
  no browser speechSynthesis. In a separate in-memory guide in that browser, synthetic
  speech passed through real ASR/intent and changed index 1→0; generated MP3 decoded.
  Playback completion was NOT observed: its audio clock stalled in remote testing,
  including a top-page probe. Sound heard by a wearer and real microphone recognition
  remain unverified. Probes were removed and audio stopped; existing tutorial/scene/
  IndexedDB were not modified. No claim of full human headset acceptance.
- Replaced only this task's old Python port4345 server with the paired Fastify API,
  preserved the Quest localhost4345 origin and USB reverse, and paired that browser.
  Private existing credentials are read by the server only. Users must exit AR and
  reload before using new modules. See the handoff for fresh wearing-headset checks.


### 2026-09-20 — Voice PR #31 catches the completed fluid-UX merge

Main advanced to `f5182af` / PR #29 during publication. Preserved its unified
unfinished-take guard (extended across Voice/help/settings), accepted-segment media
and storage recovery, narration-issue handling, review acceptance invalidation and
countdown cancellation on panel manipulation. Removed the older inline manipulation
override so it cannot shadow the repaired guide method. Reused unchanged shared/API
check and fixture evidence; reran the combined WebXR and eight desktop workflows.

The reconciled WebXR gate passed 112 Node tests, 53 Python tests and 18 browser
workflows; all eight desktop workflows passed. A final focused synthetic browser
case also drove spoken-action dispatch through the real countdown, continuous step
save, durable write and tutorial finalization methods. These are software proofs,
not a human crane or microphone acceptance run. PR #31 was verified mergeable.

## 2026-09-20 — Polished instruction narration

User confirmed original step narration is audible on the headset and clarified the desired
learner experience: concise professional instructions derived from the expert's explanation,
spoken through the voice pipeline. Added an explicit draft/review/generate flow in AR and
browser review, preserved original narration, stored portable generated speech on each step,
and decoupled speech speed/duration from ghost motion. Preview waits for generated speech
before offering the start pose; playback has no provider calls. Edited wording and trimmed
motion invalidate previous speech. Added paired author-only, bounded generation routes and
failure/stale/persistence tests. See `docs/polished-instruction-voice.md` for ownership and
headset acceptance. This is general task/origami infrastructure, not a crane-specific lesson.

Validation: 377 shared/API cases with typecheck/build, fixtures, eight desktop workflows,
115 WebXR module cases, 53 Python cases and 20 synthetic browser workflows passed.
Focused provider/label cases passed after refining the prompt to avoid invented force or
axis terms observed in the first live synthetic test. Final live synthetic input produced
concise faithful wording and generated speech. Inspected AR, 1100 px and 375 px review UI.
Updated the task-owned 4345 server and re-paired the existing Quest tab without reloading
or editing its library. Original narration audibility was user-reported; new generated
voice still requires the user's worn-headset acceptance.

## 2026-09-20 — Spatial panel rotation and resizing

Added explicit Move, Rotate, Resize and Face me grips to the WebXR main panel; the
workspace timer has independent rotation, resizing and facing in addition to dragging
its surface. Rotation uses grab-relative quaternions around a stationary center. Resize
is bounded to 65–160%, and entry animations preserve the user size. Settings can bring
the panel to the viewer or reset the layout. Grips follow theme tokens and highlight
on pinch. Presentation changes pause capture/guidance, preserve calibration/motion,
suppress release clicks, and cancel on missing pose/focus/session/reference-space loss.
Layout remains session-local; this does not expose an OS window API.

Validation: full WebXR gate passed 115 Node cases, 53 Python cases and 21 synthetic
browser workflows. New browser cases cover relative rotation from existing orientation,
back-facing recovery, bounded resize, entrance-size retention, missing input, independent
timer transforms, unchanged workspace and pause on all grips. Actual Three.js render
inspected at 1200 px and 375 px. Reused previous passing shared/API build, fixture and
desktop evidence because those inputs are unchanged. No new paid API calls. Actual
worn-Quest rotation feel and grip targeting remain to be tested; exit AR and reload
the existing localhost4345 origin to load the new modules.

## 2026-09-20 — Reported headset voice and workflow repairs

Fixed the browser-native fetch receiver in VoiceCommands: assigning bare fetch to an
instance and invoking it as a method caused Illegal invocation before status/commands
reached the server. Added a native-browser-fetch regression rather than relying only
on injected function mocks. Enabling voice returns to the task; pause/resume/navigation
also work in review. Narration no longer closes the listening gate; the microphone uses
echo cancellation, processing pauses preview/progression, and replies remain excluded.
Acoustic echo and live mic acceptance still require the worn headset.

Library selection opens tutorial detail with Edit/Follow. AR entry remains Home; Follow
leads to setup then placement. Edit opens review, requesting placement only for spatial
preview or another recording. Manual capture inherits selected capture hands; legacy
missing choices open explicit Left/Right/Both controls. Review's main actions are fewer;
advanced editing remains under More options. Button fill is neutral until targeted or
selected, including light mode.

Finish now persists the original tutorial, automatically prepares concise narration and
speech sequentially, then saves generated assets. Existing voices are not regenerated.
Ambiguous wording keeps its original; provider/auth/allowance failure stops further
requests and reports partial completion. No per-step approval is fabricated: generated
wording is not expert-reviewed, while explicit movement acceptance remains. Cancellation
and late result guards preserve the saved original. Manual editing remains available.

Validation: pnpm check passed 378 shared/API cases with typecheck/build; fixtures and
eight desktop workflows passed. WebXR passed 117 Node cases, 53 Python cases and 22
synthetic browser workflows. Focused repair/review/UI tests rerun for final edits. Actual
AR review/detail canvases and desktop detail at 1100 px/375 px inspected. No paid inference
or personal recording was used. Restarted only task-owned port4345 (PID21379); health is
good. Quest disconnected during update; USB forwarding and author pairing could not be
restored, and new physical microphone/echo tests remain pending reconnect.

### 2026-09-20 — Curate OpenAI track evidence and verify the Codex improvement story

- **User goal / input:** Strengthen the Codex log and supporting documentation for the supplied OpenAI judging criteria; suggest improvements to the demo. The user reports using GPT-Live and Codex for implementation. No product feature, publication or submission was requested in this turn.
- **Source reconciliation:** GitHub main and the local remote reference both resolved to `dfaf572a0c4bb1eb0ce15a14605649306fa550fe` during this audit. Inspected its WebXR tutor, paired coach, provider configuration, prompts, SDK calls, vision adapter, regression tests and published activity history. Preserved this older Unity setup checkout and its unrelated uncommitted work. New documents use immutable links to the newer implementation rather than implying it is present in this checkout.
- **Documentation result:** Added [OpenAI track brief and demo plan](openai-track.md) and [Codex impact case studies](codex-impact.md); linked them from README and added the reading guide above. The brief includes an API architecture diagram, a three-minute rehearsal script, prioritized ideas and an evidence checklist. Case studies connect false movement completion, cancelled coach startup and invisible hand assets to specific repairs. Preserved dated log entries, clarified the scope of the original timeline, expanded the future-entry template and repaired an old scaffold-evidence link by pinning its original commit.
- **Concrete before / after:** Exported the pre-repair follower at `32d3020714436dd9d19439c57ee1e05db0256d20` and the existing regression from repair `957b89447bad972e50299f162cb318146f1bde6c` into an isolated temporary directory. The stationary-midpoint test failed as expected: index 2 instead of 1. A direct replay of the 41-frame, 1.6-second, 18 cm synthetic movement with five seconds of stationary learner samples confirmed `done: true` before the repair and `done: false` at the repair and inspected main snapshots. This is reproducible automated evidence of a Codex-assisted product improvement.
- **Fresh automated validation:** Node 22.23.1 passed all 12 follower tests at `957b894`, then all 32 existing follower, practice-regression and coach tests at `dfaf572` with none skipped. Tests and runtime source were exported unchanged; no application repair was made in this documentation task. The intentionally failing pre-repair test is separate from the passing repaired-code checks. Documentation checks validated links/anchors, immutable source references, balanced fences, whitespace and preservation of previous dated history and unrelated README content.
- **Provider evidence, attributed:** The [earlier browser voice record](https://github.com/aidanjnn/trail/blob/8b95701cddca9b06dec5009983854c0f5aeeb6f3/docs/codex-log.md#2026-09-20--webxr-voice-gpt-live-coach-and-whisper-labels-in-the-quest-browser-tutor) reports a real OpenAI desktop session/sideband connection in 1.7 seconds, acknowledged step context, typed replies and synthetic narration drafting. That run used a fake microphone and heard no spoken audio. It proves narrower provider paths, not spoken-answer latency or simultaneous Quest speech and tracking. The new brief keeps those distinctions and describes the inspected coach as Ask-triggered.
- **Official API sources:** Read OpenAI's [GPT-Live overview](https://developers.openai.com/api/docs/guides/live), [visual delegation](https://developers.openai.com/api/docs/guides/live-delegation#add-images-and-visual-context) and [Responses image guide](https://developers.openai.com/api/docs/guides/images-vision). Verified the repository calls `client.live.create` and keeps image assessment in a separate Responses path; did not relabel GPT-Live as the Realtime API or claim that Live directly receives images.
- **Remaining evidence / recommendation:** Prioritize a short physical task with an audible, unscripted, tutorial-grounded exchange on the actual headset, then show the verified Codex before/after case. Three clean rehearsals, a non-builder attempt and measured useful-speech latency are proposed evidence to collect. Fresh visual coaching is an optional extension after the core works. No new provider requests, microphone/camera capture, headset/human trial, full workspace/browser suite, commit, push or submission occurred.

### 2026-09-20 — Prepare the OpenAI track documentation PR

- **Request:** Commit and push the documentation to a new branch and create a PR. Created an isolated `codex/openai-track-evidence` branch from freshly fetched main `f5182af7a4c0fa7bf3fe76132e045ea4ec649358`; preserved the original checkout and all unrelated changes.
- **Scope:** Ported only the judge brief, Codex case studies, README navigation and this task's activity-log changes. Retained every existing dated main-log entry. Adjusted checkout-specific wording for publication and linked the coach case to the published integration record. No application, dependency or test source changed.
- **Validation:** Reran the 32 existing follower, practice-regression and coach tests against the current main base; all passed with none skipped. The earlier before/after results remain pinned to their original source revisions. Documentation validation checked 96 local link occurrences and 21 new immutable source references, balanced code fences, patch whitespace and preservation of historical entries. All new targets resolve; five pre-existing historical link occurrences still refer to retired native files or a replaced plan heading and are unchanged. Full application/browser suites and live provider/headset trials are outside this documentation-only change.



### 2026-09-20 — Browser Sentry interaction tracing, diagnostic replay and step observations

- **Request and scope:** Implement proposed gesture-delivery tracing, a safe diagnostic reconstruction for Session Replay, and step-level interruption observations. User explicitly authorized parallel agents. Used three bounded implementation agents plus integration/review in an isolated managed worktree `/Users/aidanjeon/.codex/worktrees/sentry-observability/trail`, branch `codex/sentry-observability`, starting at browser demo head `32d3020`. Preserved the original native setup checkout and running browser demo checkout. Work is uncommitted; no push or PR requested.
- **Runtime implementation:** Added an allowlisted, in-memory event bus (300 records), deduplicated control targeting, actual activation/hit-test/dispatch/state-change/render-submission observations, bounded timeouts and lifecycle cleanup. Runtime observation wraps `ar.js`; guide/motion, storage, native, voice and provider implementations were not changed. Render acknowledgement is software submission, not proof of wearer perception or durable save.
- **Diagnostic UI and step evidence:** Added the collapsed `TRAIL / OBSERVATORY` panel, explicit source/mode/phase, recent interaction stages, bounded sanitized JSON export and per-step attempt aggregates. Distinguishes required-hand loss, voluntary pause/demo watching, application wait, checkpoint wait and unknown intervals. Repeat/demo requests and accepted confirmations are explicit actions; source/revision groups stay separate and aliases reset per page session. Counts and timing are investigation prompts, not learning or assembly scores.
- **Sentry integration:** Exact `@sentry/browser@10.75.0` and `esbuild@0.28.2` pins; locally built ESM vendor bundle with license, no runtime CDN. Added opt-in hosted-public-DSN config endpoint and separate Replay enablement. Structured Logs and custom Tracing share real emitted trace IDs; Replay reconstructs only the sanitized diagnostic DOM and links to those traces. Added independent event/log/span sanitization plus final transport projection to remove scope enrichment, private DOM, console, URLs, input/media, and arbitrary attributes. Configuration, SDK and transport failures leave local guidance available.
- **Accuracy repairs found during integration:** Corrected ESM bundling that initially exposed only a default export; respected the real SDK's minimum Replay session duration in the test; retained diagnostic `dl`/`ol`/table nodes in the Replay projection; removed fake continuous timing from step-summary spans. Explicitly represent sub-heartbeat XR stalls as unknown, count voluntary demo viewing as user pause, and finalize session exit without creating a phantom desktop attempt. These were code/test findings during this integration, not claims of Sentry-hosted debugging or measured headset improvements.
- **Automated evidence:** `pnpm check` passed typecheck, 361 tests in 32 files, workspace builds and static Quest scaffold check. Prototype `test-all.sh` passed 59 Python tests and all 13 browser workflows; after the final voluntary-demo accounting regression was added, the complete Node suite passed 92/92. Real-SDK test rechecked Logs/Tracing/Replay payload generation, trace-ID correlation, useful replay fields and exclusion of all sensitive sentinels via in-memory transport with no external requests. Desktop/mobile diagnostic layout and download privacy passed; screenshots were inspected. `git diff --check` and local documentation links passed. Existing nonfatal Vite chunk warning remains.
- **Live boundary and handoff:** No Sentry DSN was present. User said they will supply the public DSN; no remote ingestion, Sentry account configuration or hosted dashboard result is claimed. No headset test, learner outcome, paid inference or real camera/voice telemetry was performed. Started an owned local-only preview at `http://127.0.0.1:4331/tutorial` using the existing Python 3.12 environment; original port 4321 runtime was preserved. Setup, privacy rules and an honest judging demonstration are in [Sentry observability](sentry-observability.md).

### 2026-09-20 — Activate and verify the Sentry project

- **Authorization and setup:** User requested connecting the created Sentry project and explicitly authorized computer use. The signed-in `trail-yf` organization had no projects, so created the `trail-browser` JavaScript project with Logs, Tracing and Session Replay. Retrieved its public DSN from the setup page; no administration token, source-map upload, account/billing change or hackathon submission was needed. Persisted public startup settings in this worktree's ignored `.runtime/sentry.env` and restarted only the owned 4331 preview. Original 4321 and native checkouts remain intact.
- **Hosted evidence:** Verified structured `trail.guide_state` and `trail.interaction` Logs, custom interaction traces with child stages, and a playable diagnostic-only Replay in the actual Sentry UI after its initial indexing delay. A real desktop click generated the `no_control` rejection trace `e6c860257f1c45158bc8d26e960248a1`. Two additional bounded Node SDK probes used explicitly synthetic sources and `integration-test`; they received HTTP 200 and appeared in Sentry. Desktop runtime events use `hackathon-demo`, release `trail-browser@32d3020-sentry-working`. No synthetic probe is presented as headset behavior.
- **Sentry-driven privacy correction:** The first hosted Replay exposed Sentry's inferred connection IP. The final event projector had dropped `sdk.settings.infer_ip: never`, causing Relay's legacy JavaScript inference. Restored fixed SDK metadata with the explicit opt-out on Error, Transaction and Replay; retained strict removal of arbitrary data. Enabled this project's Prevent Storing of IP Addresses safeguard. Reloaded the application and verified new Replay `9a672b0807cd4591a4cd6dacb6afd03f` is labelled Anonymous User. Earlier test data remains historical; the protection applies to new events. This concrete hosted finding and fix are documented with [evidence links](sentry-observability.md#live-development-connection-verified-on-2026-09-20).
- **Validation and boundaries:** All 93 Node tests passed after the fix. Added regression assertions for the IP opt-out surviving every event projection and the exact SDK version matching the installed pin; the real-SDK payload test passed with zero external requests on an isolated unconfigured server. Reused the unchanged Python, browser and workspace checks recorded above. Live Sentry ingestion is now verified; no Quest/human/physical-transfer or AI-provider result is claimed. Changes remain local and uncommitted on `codex/sentry-observability`.

### 2026-09-20 — Audit Sentry installation and add the sponsor walkthrough

- **Request:** Verify that the SDK and scaffold are properly installed, then create `docs/sentry.md` for sponsor review. Continued in the existing Sentry worktree; preserved the original checkout and other servers. Rechecked the official Devpost Sentry criteria and the Sentry documentation against the implemented browser scope.
- **Installation audit:** `pnpm install --frozen-lockfile` completed with no dependency drift on Node 22.23.1 / pnpm 11.3.0. Confirmed installed `@sentry/browser@10.75.0` and `esbuild@0.28.2`, rebuilt the local ESM SDK bundle and license, and verified its actual initialization, Logs, Replay, tracing and transport exports. Checked startup preparation, runtime imports, public configuration validation, same-origin boundaries and ignored generated/runtime files. The connected 4331 preview still serves enabled public configuration and all eight telemetry modules/style/vendor assets.
- **Scaffold documentation:** Added a browser-specific `.env.example` with explicitly exported, disabled-by-default Sentry settings and documented sourcing/restart steps. Removed unused Sentry placeholders from the main-server example to avoid configuring the wrong runtime. Updated browser installation/test notes and linked the sponsor document from both READMEs and the setup guide.
- **Sponsor evidence:** Created `docs/sentry.md` with the spatial-interaction problem, the role of each of the three products, step-observation semantics, source links, a small architecture diagram, private-project evidence links, the verified IP-inference finding/fix, and a two-minute judging walkthrough. Labels desktop versus synthetic observations, access requirements and remaining headset/human evidence. No speculative performance/learning gains, deployment or sponsor submission is claimed.
- **Fresh verification:** Full prototype `test-all.sh` passed 93 Node tests, 59 Python tests and all 13 browser workflows on an isolated temporary server, with external Sentry delivery and paid providers disabled. The real-SDK privacy/correlation/payload regression passed. Environment-template shell syntax/defaults, bundle exports, served resources, 30 local documentation links, code fences, private-value exclusions and patch whitespace passed. Earlier workspace checks remain applicable because application/type/build inputs are unchanged in this follow-up. All changes remain local and uncommitted.


### 2026-09-20 — Publish Sentry integration on the current WebXR foundation

- **Request / scope:** User authorized commit, push and PR creation for the Sentry work. Committed the bounded feature as `82f3f25`, then merged current main `f5182af` without rewriting history. Continued in the isolated Sentry worktree and preserved the original checkout. Parallel runtime and server agents handled separate migration surfaces; a read-only agent checked sponsor documentation.
- **Foundation catchup:** Moved the integration into `apps/webxr`, retained main's controls, spatial dragging, practice, voice/media and lifecycle behavior, and assigned the exact Sentry dependency to the WebXR package. Added public, validated browser configuration to Fastify as well as the Python server, with same-origin/Host checks and protected-route authentication unchanged. Kept both full activity histories and the foundation's native retirement.
- **Observation accuracy:** Added separate automatic-preview and ready-state durations, preserved attempts across nested settings, and observed menu Watch requests. Automatic movement checkpoints now remain distinct from interruptions and explicit confirmations. Updated the actual-runtime browser regression for the current TutorialGuide. The first full run caught a stale Replay table-label expectation; updated that assertion to the new checkpoint/confirmed/interrupted column and reran the complete WebXR suite.
- **Fresh automated evidence:** Frozen installation and WebXR setup passed. `pnpm check` passed typechecks, 387 tests across 34 files and all builds. `pnpm validate:fixtures` passed; `E2E_PORT=3541 pnpm test:e2e` passed all eight desktop workflows. `pnpm test:webxr` passed 143 Node tests, 61 Python tests and all 20 synthetic browser workflows, including the actual bundled Sentry payload/privacy/correlation check. Verified local documentation links, code fences, patch whitespace, dependency ownership and exclusion of local DSN/generated/runtime files from the PR. Existing Vite bundle-size warnings are non-failing.
- **Local continuity / evidence boundary:** Migrated the ignored public startup configuration and restarted only the owned 4331 preview at the new `apps/webxr` path. Verified the new source hash, enabled public configuration and nine tutorial/telemetry resources; original 4321 remains untouched. The preview uses release `trail-browser@sentry-main-working`. Earlier hosted Sentry evidence remains explicitly tied to `trail-browser@32d3020-sentry-working`; this delivery adds no new hosted-ingestion, headset/human or physical-transfer claim. Sponsor walkthrough and runbook reflect the current paths and practice semantics.
### 2026-09-20 — Voice pipeline end-to-end review and demo hardening

- **Scope:** full review of the voice path for the Quest Browser demo on `main` `763676d`: tutor page → bundled coach runtime → main API → GPT-Live, whisper-1 and gpt-4.1-mini → back to the headset. Two audits (server side, browser runtime) plus live experiments against the real provider with synthesized speech played through Chromium's fake microphone. Branch `codex/voice-demo-hardening`.
- **Measured before changes:** connect to live 1.4–1.7 s; first spoken words 0.7–1.3 s after the learner stops talking; grounded answers per step; the "is it complete" refusal; the mic closes ten seconds after the last speech. The pipeline worked; the edges did not.
- **Fixed in the runtime (`apps/web/src/guide/coach.ts`, `coach-state.ts`):** microphone opened with echo cancellation, noise suppression and gain control; an Ask pressed while a step update is in flight is kept and opens the mic when the server acknowledges (a second press cancels it); after a step change, playback stays muted until the learner speaks again (an earlier quiet-reopen was removed in review, see below); a failed live start now reports why (microphone refused, no microphone, server refusal with status, start timeout) and deletes a session the server had already created. Four regressions added; the existing gating test updated for the queued Ask.
- **Fixed in the server (`routes/voice.ts`, `live-sessions.ts`, `config.ts`, `app.ts`):** the control-channel readiness wait ends when the browser disconnects, so a browser that gave up leaves no registered session; a spoken greeting on connect ("Coach ready. Ask me about the current step whenever you like.") sent as `session.commentary.append`, real provider only, `OPENAI_LIVE_GREETING=off` disables it. Live check: plain text was improvised by the model ("Do I need to press anything right now?"); the exact-say directive is spoken verbatim within 0.3 s of live and does not delay the first answer.
- **Fixed in the tutor (`apps/webxr`):** visibility loss (system menu, permission prompt, headset lifted) no longer resets the coach attempt, so a blip cannot mute an answer or tell the model the learner restarted; the headset Ask label reflects readiness (Ask coach, Listening…, Coach connecting…, Coach: text only) while Ask itself always reaches the runtime; coach errors also land on the guide's detail line so they are readable inside AR; step text spoken while the coach is taking a question or still talking is held and read once the coach is quiet, instead of dropped; the desktop transcript keeps one line per voice per turn and the in-headset caption keeps growing across interleaved learner words; the caption shows in every learn phase except tracking loss, reference gaps and the checkpoint; a missing coach bundle reports how to build it.
- **Live checks after changes:** greeting spoken; "What do I do now?" answered with the step text; a step change mid-answer muted the old answer, the Ask pressed immediately afterwards opened the mic as soon as the server acknowledged, and the next answer was about the new step ("Lower the record onto the spindle and let go."); "Is it complete?" refused. Chromium fake microphone, desktop, real OpenAI. Nobody has yet heard this on the Quest 3S; `docs/voice-demo-checklist.md` is the rehearsal list.
- **Catch-up:** `main` moved twice during the review: `dfaf572` (PR #30, immersive launcher) and `f5182af` (PR #29, fluid capture, movable panels, immersive library with a global Home button). Fast-forwarded onto the first and merged the second; the Voice coach card now lives under **Browser tools · review, import and backup**, the coach hooks in `ar.js`, `tutorial-guide.mjs` and `tutorial-ui.mjs` merged without conflict, and `docs/voice-demo-checklist.md` describes the Home → Library path. Full gate rerun after each catch-up.
- **Review round (PR #32):** the automated code review returned 14 findings and Aidan's staff review requested changes (P1 quiet-reopen, P2 SDK close-before-reject, P2 held narration surviving Stop). The pinned SDK has no response cancel or turn-boundary event, so the quiet-reopen was removed: after a step change, playback stays muted and captions stay stale until the learner's next words, as before this branch; the queued Ask makes that a one-press recovery. The greeting is now requested by the browser after `session.started` (`POST /api/live/sessions/:id/greeting`, once per session) instead of being fired before the SDP answer reaches the headset. A close during startup no longer bypasses failure reporting or the session DELETE, and start failures are classified through the SDK error's `cause` chain with the server's refusal reason kept. Held step narration is tagged with the guide epoch and dropped on Stop, leave and invalidation; a learner line that arrives well after the coach's last words starts a new caption and transcript line; the queued Ask shows as `Ask queued…`; a control channel abandoned by a gone client still receives `session.close`; coach errors reach the AR detail line only in learn modes; the transition disclaimer keeps its line; the bundle-load error keeps its cause; a non-secure origin is named as such; the caption gap constant is shared. Declined: none of the findings were rejected.
- **Not changed, by choice:** the 10 s listen window (it re-arms on speech); one browser per demo (the registry caps eight sessions and closes the oldest); PR 25/29 remain off `main` and conflict with the voice files in `ar.js`, `tutorial.html` and `server.py`; whoever lands them must keep the coach hooks.

### 2026-09-20 — Catch headset voice PR #31 up with main

- **Scope:** Merged main `4e38d2e` into PR #31 from `27fc710` in an isolated checkout. Reconciled the AR voice hooks so command microphone exclusion, generated narration and spatial controls coexist with main's coach error reporting, epoch-tagged held speech and session cleanup. Preserved the panel-reset action, coach readiness behavior and both activity histories.
- **Validation:** Frozen installation and WebXR setup passed. On the reconciled tree, `pnpm check` passed typechecks, 384 tests across 35 files and builds; `pnpm validate:fixtures` passed; desktop E2E passed all eight workflows on owned port 3591. `pnpm test:webxr` passed 115 Node tests, 53 Python tests and all 21 synthetic browser workflows. JavaScript syntax and patch whitespace checks passed. Existing Vite bundle-size warnings are non-failing.
- **Evidence boundary:** Automated and synthetic browser validation only; no new provider calls or worn-headset acceptance. The original dirty checkout and existing PR work were preserved.

### 2026-09-20 — Reconcile workflow repairs with team voice updates

Preserved remote `47017b3` and main `4e38d2e` voice-coach updates while retaining the native-fetch fix and narration interruption. Resolved only the AR hook and additive log conflicts. Revalidated the combined tree: 385 shared/API tests, typechecks/builds, fixtures, eight desktop workflows, 117 WebXR Node cases, 53 Python cases and 22 synthetic browser workflows passed. Task server restarted as PID22451 on port4345; health passes. Quest remains disconnected; USB forwarding, fresh author pairing and real microphone acceptance are pending. No paid inference or personal recordings used.

### 2026-09-20 — Simplify headset creation, placement and voice feedback

Fixed XR-origin reset routing that opened calibration before tutorial selection. Added Create onboarding, default both hands with optional overrides, a stationary-second plus one-second save circle, trimmed step saves and rest-position-triggered three-second next-take countdowns. Separated Save step from Finish tutorial; retained automatic narration polishing. Added explicit Watch & do for tasks where exact hand following is unsuitable. Status defaults below the main panel; microphone activity uses a compact icon. Common spoken commands skip intent inference after transcription; arbitrary wording keeps the model fallback. Hologram rendering still consumes raw tracking without changing detection. Physical object registration, task resizing and occluded-hand grading remain unsupported. Final integration and validation results follow below.
### 2026-09-20 — Catch OpenAI evidence PR #34 up with main

- **Scope:** Merged main `4e38d2e` into PR #34 from `c97dc8a` in an isolated checkout. Retained the OpenAI/Codex brief, case studies, README links and both activity histories alongside the newly merged voice demo hardening. No runtime, dependency or test difference from the new base.
- **Validation:** All 31 focused follower, practice-regression and coach tests passed on the reconciled tree. Checked 94 local documentation links and 16 immutable file references; no new missing targets and balanced fences. Four historical native-file link occurrences remain unchanged from the PR head. History preservation and patch whitespace checks passed. Full application/browser gates are not rerun for this documentation-only PR.
- **Evidence boundary:** Automated checks only; no new provider or headset/human validation. The original dirty checkout and existing PR worktree were preserved.

### 2026-09-20 — Catch Sentry PR #33 up with main

- **Scope:** Merged main `4e38d2e` into PR #33 from `82c0dcb` in an isolated checkout. Kept the public telemetry configuration route alongside the coach greeting setup. Preserved diagnostic session/visibility observations together with main's epoch-tagged narration cleanup and voice hardening. Retained both activity histories and exact dependencies.
- **Validation:** Frozen installation and WebXR setup passed. `pnpm check` passed typechecks, 394 tests across 34 files and builds; `pnpm validate:fixtures` passed; desktop E2E passed all eight workflows on owned port 3593. The complete WebXR suite passed, including the real bundled Sentry payload/privacy regression with external telemetry and provider calls disabled. JavaScript syntax, history preservation and patch whitespace checks passed; existing Vite bundle-size warnings are non-failing.
- **Evidence boundary:** Automated and synthetic browser checks only; no new Sentry-hosted, provider or headset/human validation. This is a base catchup; the existing review finding about attributing unrelated state changes to a pending interaction remains separate. The original dirty checkout and existing Sentry worktree were preserved.

### 2026-09-20 — Catch headset voice up after Sentry merges

- **Scope:** Fast-forwarded the isolated PR #31 catchup branch to the team's latest voice fixes at `5ef71dc`, then merged main `4f2f4d5` (Sentry PR #33). Combined diagnostic observations and disposal with voice-command shutdown, narration cleanup and unfinished-polishing navigation protection. Served both voice and telemetry assets, retained exact dependency pins, and preserved both dated activity histories.
- **Validation:** Frozen installation and WebXR setup passed. The reconciled tree passed `pnpm check` (407 tests across 36 files, typechecks and builds), fixture validation, all eight desktop E2E workflows on owned port 3591, and the complete WebXR suite (154 Node tests, 61 Python tests, 25 synthetic browser workflows). Includes Sentry payload/privacy, actual runtime observation, voice, auto-polish and flow-repair regressions. JavaScript/Python syntax, README local links/fences, history preservation and patch whitespace checks passed. Existing Vite bundle-size warnings are non-failing.
- **Evidence boundary:** Automated and synthetic browser checks only, with external telemetry and paid provider calls disabled. No new hosted Sentry, provider, headset or physical-task acceptance. Original dirty files and other development worktrees were preserved.

Final validation for simplified flow: preserved remote a0b1ae0 (including Sentry). Typechecks/builds and 408 shared/API tests passed; fixtures and eight desktop E2E workflows passed; the full WebXR suite passed 155 Node cases, 61 Python cases and all 26 synthetic browser workflows. Legacy review tests now explicitly exercise optional/manual review while new authoring tests cover default-both, pre-circle motion/audio trimming, next-take countdown and Home/reset recovery. Spatial checks use updated world matrices and verify UI transforms leave calibration unchanged. Actual AR canvases and desktop/mobile layouts inspected.

Task-owned server restarted as PID26511 on port4345; USB reverse 4321/4345 restored, Quest author paired, health passes. One bounded live-provider probe used synthetic speech in the connected Quest browser: native fetch worked, a separate in-memory guide moved back one step, and reply audio decoded. It did not open the microphone, play audible speech or modify personal recordings. Worn-headset gesture/microphone/performance acceptance remains pending. Command pipeline remains clip-based; no automatic object registration or hidden-hand grading is claimed.
### 2026-09-20 — Catch OpenAI evidence up after Sentry merges

- **Scope:** Merged main `4f2f4d5` (Sentry PR #33) into documentation PR #34 from `73c9c25`. Retained both branches' complete dated activity entries and all README navigation. The resulting PR still changes only README and the three OpenAI/Codex documentation files.
- **Validation:** All 31 focused follower, practice-regression and coach tests passed. Checked 97 local documentation links and 16 immutable file references, balanced fences, preserved histories and patch whitespace; no new broken paths. Existing historical native-file links remain unchanged. Application/browser gates are not rerun for this documentation-only diff.
- **Evidence boundary:** Automated checks only. No new provider, hosted Sentry or headset/human evidence; the original dirty checkout remains untouched.

## Assisted workspace, unified live actions and forgiving practice — September 20, 2026

The user asked to wire the audited improvements into the running WebXR product:
reference-assisted markers, responsive live commands and polished narration,
native-like panel grips, rename/delete/edit library controls, and a general
following experience that does not demand synchronized tracing. Kept the existing
Create/Library and gesture capture flow from #31; merged current main at 26c2162.

Implemented one GPT-Live-1 session with locally checked, deduplicated action tools
and context refresh when selecting tutorials. Home publishes generic app controls
rather than coaching a restored draft. Added real microphone-level indication,
stop/visibility cleanup, Marin narration and removal of sequential polish delays.
Added opt-in JPEG landmark suggestions/reference matching, saved names/photo,
stable median fingertip marking and smaller placement adjustments. Added durable
rename/delete with stale-tab deletion tombstones. Default practice now repeats the
ghost with untimed palm-proximity feedback; optional ordered guidance remains.
Moved grips below the panel, constrained rotation to yaw, added corner resizing,
and preserved a minimum status-panel gap across scale changes. Raw tracking,
recorded scale and local progression authority remain separate from rendering/AI.

Validation: pnpm check passed typechecking, 411 tests across 37 files and builds;
fixture validation passed; eight Playwright end-to-end cases passed; WebXR suite
passed 159 Node tests, 61 Python tests and all 27 isolated browser workflows.
Updated guided-only regressions to opt into Guided explicitly and added coverage
for the new default, library tombstones, live context refresh, tool duplication/
staleness, landmark schema serialization and stable capture. Inspected the rendered
3D panel/grips and fixed overlap at small panel scales and distorted grip labels.

Separate live probes used the connected Quest browser, not a simulated WebRTC API:
synthetic speech "Can you go back please?" executed previous-step in an isolated
sample tutorial and returned streamed GPT-Live speech. Action time was 4.207 s
from utterance start (includes speaking time); no claim of instant replies. Real
TTS returned in about 1.53 s and decoded on Quest; playback was muted. Synthetic
paper-image suggestions returned in about 2.2 s. The first probe exposed an SDK
strict-schema tuple incompatibility, which was repaired and regression-tested.
Correct landmark labels had approximate pixel positions, so manual physical
confirmation remains necessary. No real room image or user recording was used.

Not verified by these checks: worn-headset microphone/echo with narration,
comfortable panel manipulation, measured headset rendering rate, physical landmark
accuracy and relocation. No automatic 3D registration, variable-size retargeting,
contact/crease verification or hidden-hand reconstruction was added. New integration
and rehearsal guidance lives in docs/assisted-workspace-experience.md. #35 OMNI
advice remains separate from explicit locally checked user actions.

### Quick voice-noise follow-up

The user supplied direct-answer latency measurements and reported periodic robotic
welcome speech. Confirmed no probe/playback process remained. The tutorial still
called the browser SpeechSynthesis welcome/announcement path when live voice was
off; removed that path for tutorial mode and hid its legacy toggle. Cancelled
queued system speech where available and disabled the toggle in the connected
Quest tab. Recorded narration and OpenAI audio are unchanged. Strengthened the
existing no-delegation policy for all tutorial questions and banned waiting filler;
actions still require the registered tool path. The supplied measurements predate
action tools, so removing all delegation would break that path. No new latency
claim: 14 focused provider/prompt tests and server build passed.
