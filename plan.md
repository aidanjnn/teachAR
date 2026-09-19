# Trail: demonstration-to-guidance implementation plan

> Record a physical task once. Replay the expert's hand movements in another person's workspace, and let the learner progress at their own pace.

**Planning snapshot:** September 19, 2026, approximately 03:35 EDT.

**Status:** Research-backed proposal; application implementation and headset validation have not started.

**Input:** The supplied “Hack the North 2026 AR Physical Skill Tutor” handoff, plus the user's confirmed hardware and direction: **Meta Quest 3S with its joystick controllers**, and the highest-quality version achievable within the available build time.

**Working name:** Trail, matching this repository. “Understudy” in the handoff refers to the same product.

This document is self-contained. The handoff supplies product context; it is not authorization to implement, publish, submit an entry, or contact sponsors. This task produces the plan. Repository initialization, package installation, application code, and deployment below are implementation work to follow.

**Reading routes:** start with [scope](#2-product-scope-and-honest-success-criteria) and [setup](#4-stack-and-repository-setup); implement against [contracts](#6-shared-contracts-to-freeze-before-parallel-implementation); coordinate from [build sequence](#10-dependency-ordered-build-sequence); create work from [tickets](#17-immediate-tickets-to-create).

## 1. Decisions, constraints, and immediate priorities

### What is known

- The local repository is `/Users/aidanjeon/code/trail`, with origin `https://github.com/aidanjnn/trail.git`. It contains Git metadata but no application files or commits. The local branch is an unborn `main`; its upstream currently appears absent. Do not overwrite a subsequently populated remote.
- The machine currently has Node `22.23.1` and pnpm `11.3.0`. Preserve this compatible starting environment rather than spending the first hour changing runtimes.
- Optimize for spatial accuracy, convincing ghost guidance, natural interaction, visual clarity, and reliable end-to-end behavior. Prior XR experience does not limit the target scope or determine the stack.
- **Hardware is confirmed: Meta Quest 3S with its joystick controllers.** Record the installed OS and Browser versions for reproducibility, then validate the required capabilities on that device. The model itself is not an open question.
- Assume four people and one headset until corrected. The headset is a shared test resource; three workstreams must be productive without it.

### Deadline-aware execution

The official 2026 Devpost page lists a **Sunday, September 20, 08:00 EDT** submission deadline and requires sponsor-prize selections **before Saturday, September 19, 14:00 EDT**. These were checked on the live event page; recheck the participant portal for announcements. At this planning snapshot, approximately 28.5 hours remain until submission. [Official event and submission requirements](https://hackthenorth2026.devpost.com/)

Use a **24-hour implementation budget**, with a working physical prototype within four hours, an interactive step within seven, and a feature freeze by hour 18. These are dependency and validation gates; the target is the complete, polished experience described below. Allocate parallel work toward that target and cut features only in response to measured blockers or remaining time. Keep the final submission buffer for verification, rest, and recovery. Assign one person to select applicable sponsor tracks before 14:00 today; do not wait for the final demo.

### Default architecture

| Decision | Choice | Reason |
| --- | --- | --- |
| Headset runtime | Meta Browser, WebXR, TypeScript, Three.js | Documented AR/hand capabilities, direct rendering control, shared replay/runtime code |
| Physical task | Four large pieces on one rigid marked mat | Stable geometry, visible outcome, easy reset |
| XR rendering | Articulated translucent ghost hand, adaptive path cue, target ring | Legible expert movement with controlled visual density; skeleton view for diagnostics |
| Motion logic | Pure TypeScript in a shared package | Tests and replay work without the headset |
| Authoring | Motion-based boundary proposals, narration labels, fast expert review | A natural demonstration becomes an editable tutorial; explicit markers remain a recovery path |
| Completion | Ordered motion gates, relevant hand pose, continuous dwell | Verify meaningful movement progress at the learner's pace without an AI round trip |
| AI | Transcription, structured labels, contextual push-to-talk help | A coherent record-to-tutorial-to-coaching experience |
| Server | One Fastify process on the demo laptop | Simple storage, API, WebSocket relay, optional AI |
| Storage | Local files plus browser IndexedDB | No cloud database or accounts needed for the demo |
| Device connection | USB reverse-port route first; trusted HTTPS for untethered use | Prove the loop before debugging venue networking |
| Sponsor priority | OpenAI first; Sentry and Huawei only after core gates | Natural integrations with explicit eligibility checks |

**Critical path:** device access → valid hand capture → independent workspace calibration → recorded ghost replay → learner completion → four-step transfer. AI, cameras, casting enhancements, and haptics cannot repair a failure on that path.

### Quality target and architecture rule

Build a polished four-step experience: stable workspace alignment, an articulated ghost that makes the movement obvious, learner-paced path progress, concise corrective feedback, automatically proposed steps with quick review, and useful contextual voice help. The authoring screen and spectator presentation should feel finished. Preserve a working checkpoint build throughout, then keep improving toward this target.

WebXR remains the recommended stack because the researched capabilities match this product and its shared TypeScript runtime supports deterministic testing and rapid device iteration. Compare stacks on measured alignment, tracking availability, frame timing, rendering control, and integration cost. If a required core capability fails specifically in the browser, time-box a native Unity/Meta XR proof of that same capability; switch only after the native spike demonstrates the needed improvement and a feasible migration. Team familiarity is not the decision criterion.

## 2. Product scope and honest success criteria

### The intended experience

An expert calibrates the mat, narrates and performs a short task with brief natural checkpoint holds. Trail records hand poses and audio on one timeline, proposes step boundaries and instructions, and lets the expert review them. A different person resets the parts, calibrates the same mat, watches an articulated ghost movement for each step, and follows at their own speed. Guidance responds to their progress along the movement; the system waits for the required motion gates and checkpoint hold before advancing. Explicit markers support authoring corrections and recovery.

The product is **spatial motion guidance**. A successful hand checkpoint means the tracked hand reached the configured pose; it does not prove that a part was grasped, inserted, or assembled correctly. Display “Movement checkpoint reached,” not “Assembly verified.”

### One concrete demonstration

Use a 50 × 35 cm rigid mat or tray with three labeled calibration marks, one verification mark, and outlined starting locations. Prepare four large, lightweight pieces with an obvious final silhouette:

| Step | Expert action | Visible endpoint | Initial matcher |
| --- | --- | --- | --- |
| 1 | Move the base from its outline to the center | Base in center | Dominant wrist over placement area |
| 2 | Insert a large support into the base | Upright support | Dominant wrist near support top |
| 3 | Place a crosspiece across the support | Crosspiece seated | Dominant wrist above crosspiece |
| 4 | Add a cap | Finished silhouette | Dominant wrist near cap |

Use loose, forgiving slots and large surfaces. The expert holds each checkpoint with their hand visible for approximately 0.5–1 second. Prefer a mostly one-handed task with the other hand unobstructed. Substitute equally large available objects immediately if this assembly is unavailable; freeze the exact task after the first physical test.

Use the same physical mat, part sizes, initial layout, and dominant hand for both people. Reset the pieces before every run. Mirroring a right-handed demonstration for a left-handed learner is deferred.

### Release tiers

| Tier | Required behavior | What may be absent |
| --- | --- | --- |
| Physical proof, H+4 | A real recorded hand movement replays on the calibrated mat | AI, semantic labels, automatic progression |
| Interactive proof, H+7 | A second person completes one step; tracking loss pauses correctly | Multi-step task and AI |
| Minimum demo, H+11 | Fresh recording produces 3–5 marked steps; learner completes them locally | Automatic segmentation, questions, haptics |
| Semantic integration, H+15 | Motion proposals plus narration become reviewed steps; save/reload works | Scene vision, open-ended conversation |
| Quality target, H+18 | Polished articulated ghost, ordered path gates, corrective feedback, contextual push-to-talk help, finished review/spectator screens | Haptics, scene vision, always-on conversation |
| Stretch, only after core gates | One grounded multimodal answer, useful sponsor observability, optional haptics | Never required to reach or complete a checkpoint |

The minimum demo is a recovery milestone, not the planned finish line. Explicitly marked steps and a skeleton renderer establish the pipeline early; automatic proposals, polished guidance, and contextual help remain scheduled target work. Any fallback and its effect on the delivered experience must be recorded. Manually edited labels do not satisfy the automatic semantic tutorial generation target.

### Explicit non-goals

No arbitrary object tracking, scene reconstruction, physical assembly verification, universal skill understanding, robotic planning, precision tool use, remote multiplayer, persistent cloud spatial anchors, user accounts, billing, custom hand-model rigging, or production mobile application. No dangerous tasks. No model-generated spatial coordinates or model-controlled progression.

### Definition of done

1. A newly recorded demonstration—not just a seeded fixture—can be saved, compiled, and played back.
2. A second person independently calibrates and completes the chosen 3–5-step task, without an operator advancing steps.
3. Learner speed may differ substantially from expert speed.
4. Tracking loss, session interruption, and reference-space reset do not falsely complete a step.
5. Once a tutorial is loaded, disconnecting AI or the server does not stop local guidance.
6. Spectators can understand the physical action and current guidance.
7. At least one non-builder completes the task with no step-by-step verbal coaching.
8. Claims distinguish motion matching, generated instructions, and actual observed physical outcome.
9. Target steps use ordered movement gates where the path matters; reaching the endpoint by skipping those gates cannot complete them.
10. Ghosts, labels, feedback, review controls, and spectator output pass an in-headset clarity review with the real task.
11. Automatic boundary proposals and contextual voice help each work on a fresh recording; any cut is documented against the quality target.

## 3. Platform research that changes the implementation

| Finding | Consequence | Evidence / validation boundary |
| --- | --- | --- |
| Meta documents immersive AR and articulated WebXR hands | Use `immersive-ar` with `hand-tracking`; read actual joint poses | [Meta mixed reality](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/), [Meta hands](https://developers.meta.com/horizon/documentation/web/webxr-hands/) |
| The hand API exposes 25 joints; occlusion can yield emulated poses or a missing hand | Non-null is API-valid, not a confidence score or contact proof; exact-task testing is mandatory | [W3C hand-input specification](https://www.w3.org/TR/webxr-hand-input-1/) |
| Reference-space origins can reset | Invalidate calibration and pause rather than silently relocating guidance | [WebXR spatial tracking](https://immersive-web.github.io/webxr/spatial-tracking-explainer.html) |
| Entering immersive XR requires user activation; new non-XR permission prompts can interrupt it | Grant mic/camera permissions before XR, then use a fresh Enter AR button | [WebXR specification](https://immersive-web.github.io/webxr/) |
| Secure contexts include trustworthy loopback origins | Use USB port reversal plus headset localhost, or genuinely trusted HTTPS; a plain laptop LAN IP is insufficient | [Meta debugging](https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/), [Secure Contexts](https://www.w3.org/TR/secure-contexts/) |
| Camera documentation is inconsistent across generations | Treat camera access as a capability test, not a core dependency | [Browser 40.1 camera support](https://developers.meta.com/horizon/downloads/package/browser/40.1/?view=full_width), [Browser 146 camera fixes](https://developers.meta.com/horizon/downloads/package/browser/146.0/?view=full_width) |
| MediaRecorder chunk boundaries are not narration timestamps | Keep a complete recording and explicit timestamps; do not transcribe arbitrary chunks as independent audio files | [Media Recording specification](https://www.w3.org/TR/mediastream-recording/) |

Compositor passthrough, a browser RGB camera stream, and WebXR Raw Camera Access textures/intrinsics are different capabilities. Seeing the real room behind a Three.js cube does not establish that the model can receive that room's pixels. Prove actual workspace images during immersive AR; use a laptop webcam if that optional spike fails.

Controllers are useful for setup, menu rays, and recovery. They do **not** supply a bare-hand skeleton. Do not assume controllers and articulated hands can be used simultaneously on the installed configuration. Put controllers down and confirm the switch to hand tracking before recording or learning. Controller-only pose replay is an explicitly reduced demonstration, not completion of the ghost-hand MVP.

## 4. Stack and repository setup

### Package choices

Use TypeScript/HTML/CSS for authoring and spectator screens and Three.js for XR, with reusable components and a coherent visual system. These choices keep the rendering/runtime boundary explicit and avoid infrastructure that does not improve the experience. A framework change needs a concrete benefit to implementation or product quality; a small dependency count is not a reason to accept unfinished UI.

The following versions were observed in package-registry metadata during planning. Their combined integration has **not** been installed or tested. Freeze the resolved working set and lockfile after the setup gate; if a plugin reports an incompatible major, select its documented Fastify-5-compatible release rather than bypassing peer checks.

| Layer | Starting selection |
| --- | --- |
| Runtime / package manager | Existing Node 22.23.1, pnpm 11.3.0 |
| Compiler | TypeScript 5.9.3, strict mode; a deliberate conservative pin |
| Web | Vite 8.3.0, Three.js 0.186.0, matching `@types/three` 0.186.0 |
| XR types | `@types/webxr` 0.5.24 |
| API | Fastify 5.12.5; `@fastify/static` 10.1.4, `@fastify/websocket` 11.3.1, `@fastify/multipart` 10.1.1 |
| Validation / utilities | Zod 4.6.5, `gl-matrix` 3.x in pure math package, exact resolved version pinned |
| Tests | Vitest 5.0.1, Playwright 1.63.0 |
| Node development | `tsx` 4.23.13, `@types/node` 22.20.4, `@types/ws` 8.18.1 |
| AI | Official `openai` Node SDK; pin the resolved version after schema/transcription smoke tests |
| Optional telemetry | `@sentry/browser` and `@sentry/node` after core integration |

Vite and Vitest's documented runtime minimums are satisfied by the observed Node version; that is an engine check, not a tested application build. Zod 4 supports TypeScript 5.5+. Use exact dependencies and `workspace:*` for internal packages. [Vite setup](https://vite.dev/guide/), [Vitest setup](https://vitest.dev/guide/), [Zod requirements](https://zod.dev/), [pnpm workspaces](https://pnpm.io/workspaces)

### Repository tree to create

~~~text
trail/
├── plan.md
├── README.md                    # fresh-clone and headset quickstart
├── AGENTS.md                    # boundaries, conventions, required checks
├── package.json                # private workspace; root scripts
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── .node-version
├── .npmrc                      # save-exact=true
├── .env.example
├── .gitignore
├── .github/workflows/check.yml
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.ts
│   │       ├── xr/              # session, hand-source, calibration UI, ghosts
│   │       ├── record/          # recorder, audio capture, marker controls
│   │       ├── guide/           # runtime adapter, feedback, XR controls
│   │       ├── replay/          # fixture source, desktop 3D viewer
│   │       ├── dashboard/       # record/review/guide/spectate screens
│   │       └── storage/         # IndexedDB recording/tutorial cache
│   └── server/
│       ├── package.json
│       └── src/
│           ├── main.ts
│           ├── routes/         # recordings, jobs, tutorials, coach, pairing
│           ├── sessions/       # WebSocket relay and spectator snapshots
│           ├── ai/             # providers, transcription, labeler, coach
│           ├── storage/        # atomic files, manifest, import/export
│           ├── telemetry/      # structured logs; optional Sentry
│           └── haptics/        # mock first; hardware driver only if earned
├── packages/
│   ├── contracts/src/          # runtime schemas + inferred TS types
│   └── motion/src/             # math, segmentation, matching, reducer
├── fixtures/                   # synthetic plus consented real test recordings
├── tests/e2e/
├── scripts/                    # fixture validation, recording export
├── docs/
│   ├── device-check.md
│   ├── contracts.md
│   ├── demo.md
│   ├── limitations.md
│   ├── sponsor-notes.md
│   └── validation.md
└── data/                       # ignored; recordings, audio, tutorials, jobs
~~~

**Dependency direction:** `contracts` imports Zod only. `motion` imports `contracts` and pure math utilities only. `web` and `server` may import both. Shared packages cannot import DOM/WebXR, Three.js, Node filesystem, provider SDKs, or hardware code. Declare hand-joint names in contracts rather than importing browser-only types into motion.

### Bootstrap sequence, owned by integration

These are instructions for the next implementation task, not commands executed during planning.

1. Inspect `git status` and `git ls-remote origin` before creating the first commit. If a remote history now exists, reconcile it without resetting or force-pushing. Coordinate one initial scaffold commit before developers branch.
2. Create the root package manifest with `"private": true`, `"packageManager": "pnpm@11.3.0"`, `"type": "module"`, and `"engines": { "node": ">=22.13.0 <23" }`. Write `22.23.1` to `.node-version`.
3. Write `pnpm-workspace.yaml` with `packages: ["apps/*", "packages/*"]`. Set `save-exact=true`. Add ignores before recording audio or creating secrets: `node_modules/`, `dist/`, `.env`, `.env.*` except `.env.example`, `data/`, local recordings, logs, traces, and test output.
4. Scaffold web with `pnpm dlx create-vite@9.2.1 apps/web --template vanilla-ts`. Rename package to `@trail/web`; replace generated dependency ranges with the selected exact pins. Create `@trail/server`, `@trail/contracts`, and `@trail/motion` manifests.
5. Shared packages export compiled ESM and declarations from `dist/`. Use TypeScript NodeNext for Node/shared code, explicit `.js` internal import suffixes, and Bundler resolution for Vite. Root builds shared packages before consumers; dev builds once before starting watchers.
6. Install dependencies in their owning packages, with `workspace:*` internal dependencies. Commit one lockfile. Do not independently regenerate the scaffold or lockfile in four branches.
7. Implement root commands below, a health route, one schema round-trip, a pure transform test, and a visible desktop fixture. Run the setup acceptance gate before distributing work.
8. Add CI using the same Node/pnpm pins and `pnpm install --frozen-lockfile` followed by the agreed checks. Keep ordinary CI independent of secrets and XR hardware.
9. Add a README with a two-terminal development path, verified device connection instructions, and the exact known-good commit. Push/PR operations are a later implementation workflow.

~~~json
{
  "scripts": {
    "dev": "pnpm build:shared && concurrently -k \"pnpm dev:shared\" \"pnpm --filter @trail/web dev\" \"pnpm --filter @trail/server dev\"",
    "build:shared": "pnpm --filter @trail/contracts build && pnpm --filter @trail/motion build",
    "dev:shared": "concurrently -k \"pnpm --filter @trail/contracts dev\" \"pnpm --filter @trail/motion dev\"",
    "build": "pnpm build:shared && pnpm --filter @trail/web build && pnpm --filter @trail/server build",
    "typecheck": "pnpm build:shared && pnpm -r typecheck",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "check": "pnpm typecheck && pnpm test && pnpm build",
    "start": "node apps/server/dist/main.js"
  }
}
~~~

Pin `concurrently` as a root dev dependency. Configure Vitest to discover pure-package/server tests, and Playwright to start the desktop app with mock providers. Define matching package scripts; the names above are a contract to implement, not existing commands. Use a formatter/linter only if it does not delay the physical spike.

### Environment contract

~~~dotenv
# .env.example; read by the server, never committed with real values
HOST=127.0.0.1
PORT=3001
DATA_DIR=./data
AI_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_TRANSCRIBE_MODEL=whisper-1
OPENAI_TEXT_MODEL=gpt-4.1-mini-2025-04-14
OMNI_API_KEY=
OMNI_BASE_URL=
OMNI_MODEL=
SENTRY_DSN=
SENTRY_ENABLED=false
HAPTICS_DRIVER=mock
HAPTICS_SERIAL_PORT=
DEMO_PAIRING_SECRET=
~~~

Load `.env` explicitly in server startup; Vite's env loading does not configure a separately started Node process. Set mock providers by default. No provider key belongs in a `VITE_*` variable or browser bundle. Camera frames, raw narration, API keys, and full hand recordings stay out of logs and source control unless a small test fixture was deliberately consented and approved for inclusion.

### Device connection and runtime validation

1. Charge the Quest 3S and controllers. Record Browser/OS versions. Enable hand tracking and validate switching from controllers to bare hands.
2. Open an official WebXR hand example to establish a device baseline for Enter AR, system-menu interruption, exit, and tracking recovery before comparing application behavior.
3. For USB development, enable the account/device's required developer mode, install Android platform tools or Meta Quest Developer Hub, connect a data-capable USB cable, and accept the headset's debugging prompt.
4. Run `adb devices`; the headset must be listed as authorized. Run `adb reverse tcp:5173 tcp:5173`. Start the app and open `http://localhost:5173` in **the headset browser**. Confirm `window.isSecureContext` and `navigator.xr` in diagnostics.
5. Vite binds to `127.0.0.1:5173` with a fixed port; proxy `/api` and `/ws` to `http://127.0.0.1:3001`, with WebSocket proxying enabled. Browser code uses relative HTTP URLs and derives WS/WSS from the page origin. No headset request should accidentally target its own `localhost:3001`.
6. Use Chrome remote inspection to view errors and joint diagnostics. Accept microphone permission before entering AR, then press a fresh Enter AR button. Do not depend on an HTML overlay being available inside immersive mode; render essential controls in 3D.
7. If USB/developer setup exceeds 20 minutes, expose the single development origin through a trusted HTTPS tunnel with WebSocket support. Explicitly allow only its hostname in Vite, pair the headset, and verify HTTPS/WSS. Do not set permissive allowed-host settings globally.
8. For the final wired demo, build once, serve web assets and API together from Fastify on port 3001, reverse that port, and open headset `http://localhost:3001`. Verify XR and audio on that exact origin; permissions are origin-specific.

The USB route is documented by Meta; the fallback tunnel requires venue internet. A certificate trusted by the laptop is not automatically trusted by the Quest. Never assume `http://192.168.x.x` provides a secure context. [Meta remote debugging](https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/)

**Setup pass condition:** another teammate can install from the lockfile, run `pnpm check`, open the desktop fixture, and have the headset reach the health route and enter AR. Save the exact working instructions in `README.md`. A successful desktop build alone does not pass device setup.

## 5. Component ownership and end-to-end data flow

~~~mermaid
flowchart LR
  H[Quest hand poses and narration] --> C[Workspace calibration and recorder]
  C --> L[Local recording cache]
  L --> B[Fastify file storage]
  B --> S[Deterministic step boundaries]
  B --> A[Transcription and semantic labels]
  S --> T[Validated tutorial]
  A --> T
  T --> R[Expert review and local preload]
  R --> G[Local guide state machine]
  H --> G
  G --> V[Ghost path and checkpoint feedback]
  G -. sampled events .-> D[Spectator and telemetry]
  G -. optional question .-> Q[Backend contextual coach]
  G -. bounded pulses .-> P[Optional haptic relay]
~~~

### Record flow

1. Preflight permissions, enter AR, calibrate, and verify a held-out mark.
2. Start audio, establish a monotonic recording clock, then start motion capture. Show a visible recording state.
3. Sample poses from the live XR frame, transform into workspace coordinates, and append into preallocated/bounded buffers at 30 Hz. Render and match at the XR frame rate.
4. Record missing hands as missing; record explicit step markers and tracking-gap intervals. Never fill gaps with stale poses.
5. Stop capture, await the final audio data/stop event, persist the complete local recording, and upload motion metadata and audio separately.
6. The upload is complete only when the manifest, frame data, and required assets validate. A failed upload can be retried without repeating the demonstration.

### Processing flow

1. Validate the recording, produce deterministic step windows, and reject windows without usable start/end samples.
2. Transcribe narration; align words/segments to the same motion timeline using the stored audio offset.
3. Ask the model only for labels/instructions associated with existing segment IDs. Deterministic code owns frame ranges, poses, tolerances, and completion rules.
4. Produce a draft tutorial, display any missing narration or tracking gaps, and let the expert review boundaries, active hand, and instructions.
5. Finalize an immutable tutorial version and preload its recording, instructions, and assets into the learner client.

### Guide flow

Reset parts → enter AR → calibrate → verify → preload → show one movement → arm start gate → track learner attempt and required ordered gates → dwell at checkpoint → advance exactly once. A repeat replays the current step and invalidates pending asynchronous responses. The browser remains the sole progression authority.

### Question flow

A push-to-talk interaction or a simple “What now?” control sends current tutorial/step/revision plus a short question. The backend returns a short answer grounded in approved instructions. The client discards outdated replies. Repeat/pause are local controls; the model has no general command execution or “advance” permission.

### Spectator and haptic flow

The headset sends low-rate state snapshots and optionally downsampled poses to the backend. The laptop renders a schematic scene and step progress. Casting or an external webcam provides the real-world context. Haptics, if added, consume a separate bounded feedback event; failures cannot affect the matcher.

## 6. Shared contracts to freeze before parallel implementation

Implement schemas in `packages/contracts` and infer TypeScript types from them. The examples below specify the intended interface; they are not compiled source. Version the external format independently of internal helper types.

### Coordinate and time conventions

- All positions/distances are meters; all internal angles are radians; all recording times are milliseconds.
- Right-handed workspace: +X to the learner's right, +Y above the mat, +Z toward the learner; the far edge is −Z.
- Quaternions use normalized `[x, y, z, w]`. A pose quaternion maps joint-local axes into its containing frame. `q` and `−q` represent the same orientation.
- A rigid transform is named by its direction: `referenceFromWorkspace`. Prefer position/quaternion serialization; if matrices are serialized later, use column-major order.
- Recording `tMs` uses a browser monotonic clock relative to capture start, never a server receipt time. Store actual timestamps, not frame index divided by nominal Hz.
- Frame ranges are half-open: `[startFrame, endFrameExclusive)`. Checkpoint frames must lie inside them.
- Store explicit validity; zero position is a valid coordinate, not a missing-data sentinel.

~~~ts
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Side = "left" | "right";
// JointName is the literal union of the 25 WebXR skeleton names.
// Put JOINT_NAMES and its schema in contracts; there is no native "palm" joint.
type JointName = typeof JOINT_NAMES[number];

interface Pose {
  positionM: Vec3;
  orientationXyzw: Quat;
}

type HandSample =
  | { status: "missing"; reason: "unavailable" | "nonfinite" | "jump" }
  | { status: "valid"; joints: Record<JointName, Pose> };

interface MotionFrame {
  tMs: number;
  hands: Record<Side, HandSample>;
  head: Pose | null; // optional diagnostic, also workspace-relative
}

interface WorkspaceDefinition {
  id: string;
  version: 1;
  widthM: number;
  depthM: number;
  calibrationMarksM: { A: Vec3; B: Vec3; C: Vec3; D: Vec3 };
  layoutId: string;
  dominantHand: Side;
  calibrationMethod: "three-point-index-tip-v1";
}

interface Calibration {
  id: string;
  referenceSpaceType: "local";
  referenceFromWorkspace: Pose;
  sampledReferencePointsM: [Vec3, Vec3, Vec3];
  verificationErrorM: number;
  valid: boolean;
}

interface AudioAsset {
  assetId: string; // durable ID resolved via storage, never a blob: URL
  mimeType: string;
  durationMs: number;
  audioStartOffsetMs: number;
  syncMethod: "media-recorder-start" | "manual-markers";
  estimatedSyncErrorMs: number | null;
}

interface StepMarker {
  id: string;
  tMs: number;
  kind: "step-start" | "step-end";
  source: "expert-control" | "operator-control" | "review";
}

interface Recording {
  schemaVersion: 1;
  id: string;
  coordinateFrame: "workspace";
  workspace: WorkspaceDefinition;
  jointOrder: JointName[];
  nominalSampleHz: 30;
  durationMs: number;
  frames: MotionFrame[];
  markers: StepMarker[];
  audio: AudioAsset | null;
  source: "live" | "synthetic-fixture" | "recorded-fixture";
}

interface MotionGate {
  frameIndex: number;
  positionM: Vec3;
  toleranceM: number;
  dwellMs: number;
}

interface HandTarget {
  side: Side;
  joint: "wrist";
  startPose: Pose;
  checkpointPose: Pose;
  positionToleranceM: number;
  orientationToleranceRad: number | null; // disabled by default
  gesture: "any" | "pinch" | "open"; // "any" for baseline
  motionGates: MotionGate[]; // ordered intermediate gates, derived from recording
  pathCorridorM: number; // visual correction threshold; tune on device
}

interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  startFrame: number;
  endFrameExclusive: number;
  checkpointFrame: number;
  targets: HandTarget[]; // unique active hands, at least one
  dwellMs: number;
  startDwellMs: number;
  completionMode: "path-and-pose" | "pose-match" | "user-confirmed";
  narrationSpanIds: string[];
}

interface Tutorial {
  schemaVersion: 1;
  id: string;
  revision: number;
  recordingId: string;
  recordingHash: string;
  workspace: WorkspaceDefinition;
  status: "draft" | "ready";
  steps: TutorialStep[];
  provenance: {
    segmentation: "explicit-markers" | "motion-proposals";
    labels: "model" | "manual" | "fallback";
    model: string | null;
    promptVersion: string;
  };
}

interface TranscriptSpan {
  id: string;
  startMs: number; // already converted to recording time
  endMs: number;
  text: string;
}

interface CoachRequest {
  requestId: string;
  runId: string;
  tutorialId: string;
  tutorialRevision: number;
  stepId: string;
  stepRevision: number;
  attemptId: string;
  question: string;
}
interface CoachAnswer extends Omit<CoachRequest, "question"> {
  answer: string;
  grounded: boolean;
}
~~~

`Calibration` belongs to the current XR session; it is not reusable across headset restarts. A recording may retain calibration diagnostics for debugging, but its portable motion remains workspace-relative.

Use a discriminated schema for guide state and events; never expose `payload: unknown` as the final runtime contract:

~~~ts
type GuidePhase =
  | "preloading" | "calibrating" | "showing" | "waiting-start"
  | "guiding" | "holding" | "tracking-lost" | "paused" | "complete";

interface GuideSnapshot {
  phase: GuidePhase;
  tutorialId: string;
  tutorialRevision: number;
  stepId: string | null;
  stepRevision: number;
  attemptId: string | null;
  dwellProgress: number; // [0, 1]
  pathProgress: number; // [0, 1]; cue progress, distinct from completion evidence
  nextGateByHand: Partial<Record<Side, number>>;
  calibrationValid: boolean;
  tracking: Record<Side, "valid" | "missing">;
}
interface EventEnvelope {
  schemaVersion: 1;
  sessionId: string;
  runId: string; // new on every guide start; independent of tutorial ID
  seq: number; // strictly increasing within run
  tMs: number; // run-local; not compared across devices
}
type GuideEvent = EventEnvelope & (
  | { type: "snapshot"; state: GuideSnapshot }
  | { type: "step-completed"; stepId: string; attemptId: string;
      evidence: "path-and-pose" | "pose-match" | "user-confirmed" }
  | { type: "tracking-changed"; state: GuideSnapshot }
  | { type: "guide-ended"; reason: "completed" | "cancelled" }
);
~~~

**Validation invariants:** finite tuples; unit quaternions within a documented tolerance; exact joint names/order; strictly increasing frame timestamps; bounded duration/count/size; valid, non-overlapping step ranges; active-hand data at start/checkpoint; unique IDs; workspace/layout identity; audio offset within a plausible bounded interval; no unknown schema version. Reject semantically invalid model output even when it parses as JSON.

**Contract freeze:** integration owns shared schemas. Propose changes with a fixture and migration note; coordinate before merging. All four workstreams start from the same synthetic recording/tutorial/event files.

### Pure motion API

~~~ts
calibrateWorkspace(points, matDefinition): CalibrationResult
transformPose(pose, transform): Pose
proposeSegments(recording, options): SegmentProposal[]
buildCheckpoint(recording, segment, activeHands): CheckpointResult
buildMotionGates(recording, segment, activeHands): MotionGateResult
initialGuideState(tutorial): GuideState
reduceGuide(state, input, nowMs): { state: GuideState; effects: GuideEffect[] }
~~~

No timers inside the reducer; callers supply time and observations. Effects are typed suggestions such as replay/step-completed/stop-feedback. Rendering, network, audio playback, and hardware adapters execute them outside the pure package.

### HTTP and WebSocket interfaces

| Interface | Request / response | Owner and failure behavior |
| --- | --- | --- |
| `GET /api/health` | Build ID, mock/live provider flags, storage writable status | Integration; no secrets |
| `POST /api/pair` | Short-lived pairing code → session cookie | Integration; rate-limited; do not expose APIs unauthenticated through a tunnel |
| `POST /api/recordings` | Validated manifest → server-generated recording ID | Integration; draft/incomplete until committed |
| `PUT /api/recordings/:id/motion/:chunk` | Ordered frame chunk, hash; retry replaces identical content only | Integration; ≤2 MiB/chunk, conflict on differing retry |
| `POST /api/recordings/:id/audio` | Binary multipart asset | Voice/integration; explicit size/MIME limits |
| `POST /api/recordings/:id/finalize` | Expected asset hashes/counts → finalized recording | Integration; atomic publish, reject missing assets |
| `GET /api/recordings/:id` | Manifest plus authorized asset URLs | Integration; complete recordings only for guide |
| `POST /api/tutorial-jobs` | Recording ID/hash + validated segment manifest (or explicit-marker policy) + segmentation revision → `202` job ID | AI; one active compile per recording revision |
| `GET /api/tutorial-jobs/:id` | queued/running/ready/failed/cancelled and typed reason | AI; visible progress, bounded retry |
| `GET /api/tutorials/:id` | Immutable versioned tutorial | Integration; schema-validated |
| `PATCH /api/tutorials/:id/draft` | Base revision + reviewed step boundaries/active hands/instructions → updated draft revision | Integration; validate edits, recompute targets, reject conflicting revisions |
| `POST /api/tutorials/:id/finalize` | Reviewed draft revision → ready version | Integration/AI; reject stale edits |
| `POST /api/coach` | CoachRequest → CoachAnswer or typed unavailable result | AI; deadline and stale-response protection |
| `WS /ws` | Role-scoped guide events, reduced pose updates, snapshot request | Integration; spectator is read-only |

Generate IDs server-side; do not interpolate supplied paths into filenames. Same-origin cookies and an Origin check protect the demo endpoints; verify Origin on WebSocket upgrade as well. This is one paired demo session, not an account system.

Freeze a `TutorialDraftEdit` schema containing `baseRevision` and an ordered list of `{ id, startFrame, endFrameExclusive, checkpointFrame, activeHands, completionMode, title, instruction }`. The server validates ranges/IDs, recomputes start/checkpoint targets and ordered motion gates from the recording, and invalidates affected narration associations/labels for review. Gate indices must increase inside the step range and reference valid active-hand observations; `path-and-pose` requires at least one reviewed intermediate gate. The client never submits authoritative computed coordinates. Only drafts can be patched; finalization publishes an immutable snapshot. Later edits create a new draft/version. Bind compile results to the segmentation revision so a delayed job cannot overwrite newer edits.

Register the Fastify WebSocket plugin before its routes, attach handlers synchronously, and validate every message after upgrade. Relay state changes immediately, downsample spectator poses to about 10 Hz, bound the send queue, and drop obsolete pose updates. On reconnect, request a full snapshot; ignore older `runId/seq` data. Never send the full recording over WebSocket. [Fastify WebSocket plugin](https://github.com/fastify/fastify-websocket)

## 7. Calibration, capture, and guidance algorithms

### Reusable workspace calibration

Label mat corners A near-left, B near-right, C far-left, and D far-right. Freeze their workspace coordinates in `WorkspaceDefinition`: A=[0,0,0], B=[widthM,0,0], C=[0,0,−depthM], D=[widthM,0,−depthM]. Width/depth denote measured distances between the marks. The `layoutId/version` identifies this geometry; D is used only for verification. Sample each with the index tip held steadily for 300–500 ms; use a median and show a stability indicator. Consistent fingertip posture matters: the reported tip center is not guaranteed to be the surface contact point.

~~~text
origin = A
x = normalize(B - A)
y = normalize(cross(x, C - A))
z = cross(x, y)
referenceFromWorkspace = rigidTransform(columns = [x, y, z], translation = A)

recordedPosition = inverse(referenceFromWorkspace) * referencePosition
recordedOrientation = inverse(referenceFromWorkspace.rotation) * referenceOrientation

learnerReferencePosition = learnerReferenceFromWorkspace * recordedPosition
learnerReferenceOrientation = learnerReferenceFromWorkspace.rotation * recordedOrientation
~~~

This is a proposed rigid registration algorithm, not automatic spatial understanding. Normalize/orthogonalize the basis; never scale the recording to fit noisy samples.

Initial calibration gates to tune on the device:

- At least 20 cm separation between fit marks; reject near-collinear input.
- Approximately ≤1 cm sampling spread; mat edge lengths agree within 2 cm.
- Computed upward axis agrees with the XR reference-space vertical and the expected point order. Reject flipped axes.
- Use a **fourth mark D**, not used in fitting, to measure transferred alignment. Aim for ≤2 cm independent check error and repeat after a 90° rotation and session restart.
- Abort/retry calibration if the tray moves. On reference-space `reset`, session end, or suspicious scene jump, clear calibration and dwell, stop feedback, and require re-registration.

If two people cannot reproduce alignment within roughly 2–3 cm, enlarge geometry and improve mark sampling before changing matcher tolerances. Do not hide calibration failure with a huge acceptance radius.

### Motion capture and rendering

Use `renderer.setAnimationLoop` and obtain poses from the current live XR frame. Set `renderer.xr.setReferenceSpaceType("local")` before attaching the session, then obtain `renderer.xr.getReferenceSpace()` for sampling, calibration, and reset listeners. Ghost rendering must use that same space; do not mix a separate `local` space with Three.js's default `local-floor`. Request `hand-tracking` as a required session feature; expose unsupported/missing input clearly. Identify each source by `handedness`; do not assume array ordering. Read `wrist` and named joints, not `targetRaySpace`. Keep a flat numeric buffer internally; serialize outside the XR hot path. [Three.js WebXRManager](https://threejs.org/docs/pages/WebXRManager.html)

Capture 30 Hz for at most 120 seconds. Rendering/matching continues at headset cadence. Store both hands when available even if only one is active. Persist invalid samples and stop with a clear message on buffer exhaustion; do not silently truncate.

First wire a skeleton renderer to prove pose fidelity, then deliver a translucent articulated hand for the target build. Reuse a maintained hand asset with verified licensing, bundle it locally, and adapt recorded joint poses into its bone hierarchy. Three.js provides mesh, sphere, and box hand profiles; its live-input factory does not remove the need for a recording-playback adapter. Keep the skeleton as a diagnostic/fallback view. [Three.js hand models](https://threejs.org/docs/pages/XRHandModelFactory.html)

Interpolate valid positions and quaternion orientations, preserve original timestamps, and hide the ghost across missing intervals. Use pooled geometry/materials and profile on the Quest 3S. Visual quality must fit the frame budget; avoid per-frame allocations and effects that obscure the physical task.

Show the expert motion once, then use learner progress to position a subtle ghost cue slightly ahead along the demonstrated path. Estimate that progress in a bounded neighborhood of the previous path position so crossing or looping paths cannot jump to their end. The learner can pause or move slowly without the ghost running away. “Again” restarts the demonstration without completing or skipping the physical step.

### Interaction and visual quality

- Keep the action area readable: one active ghost, a short path cue, one checkpoint, and concise step text placed beside the task.
- Use distinct styling for the expert ghost and learner feedback. Encode state with labels/shapes as well as color; fade completed path segments and avoid flashing error states.
- Apply visual smoothing without hiding invalid tracking or adding noticeable lag. Completion uses fresh validated observations, independently of cosmetic smoothing.
- Use comfortable, stable 3D controls for Repeat, Pause, and Help; avoid system-reserved gestures. Check text size and contrast inside passthrough on the actual headset.
- Build a review timeline with boundary handles, playback/scrubbing, narration, and clearly visible active-hand/target settings. Surface uncertain proposals for correction.
- Give spectators a composed view of the physical task, ghost movement, current instruction, and progress. Hide developer diagnostics from the demonstration view.

Person 1 owns in-headset visual quality; Person 4 owns review/spectator quality. Review both at H+11 and H+18, with measured rendering performance and a learner performing the real task.

### Step authoring and segmentation

Bootstrap and fallback: one continuous recording with explicit start/end markers for each step. The expert holds the active hand at the natural action start for at least 200 ms, marks Start, performs the movement, holds the visible end checkpoint for 500–1,000 ms, and marks End. Use the other hand for a large non-system 3D control where practical. An operator keyboard marker is acceptable **during capture** if headset controls are awkward; record that provenance. The learner's later progression is automatic.

Capture `startPose` from the stable hold at the **beginning** of that action and `checkpointPose` from the stable hold at its **end**, before reaching toward marker controls. Never derive both from the end window. Exclude control-reaching motion from the replayed segment, preserve references to the corresponding stable frames, and show both targets in review. If no valid separated start/end windows exist, adjust the boundaries, use an explicit local Start control, or re-record rather than guessing.

Target authoring: the expert records a natural narrated demonstration with brief holds, without needing a Start/End interaction for every step. After the marked pipeline works, propose boundaries from smoothed wrist speed, pauses of approximately 400–600 ms, and useful gesture transitions. Suggested starting speed threshold: 0.04 m/s. Require a minimum segment duration and displacement, merge short pauses, and reject tracking gaps as boundary evidence. These are tuning values, not established tracking characteristics.

Review confirms 3–5 boundaries, the active hand, a valid checkpoint, and instruction text. Voice labels the fixed movement segments. A cue word can suggest a boundary after transcription, but does not provide real-time reliability or override recorded motion.

### Learner state machine

~~~text
PRELOAD → CALIBRATE → SHOWING → WAITING_START → GUIDING → HOLDING → next SHOWING
                                                               └→ COMPLETE

Any active state → TRACKING_LOST / PAUSED
Reference reset or invalid calibration → CALIBRATE
Repeat → SHOWING for current step with a new attempt/revision
~~~

Default matcher parameters, explicitly subject to hardware tuning:

| Parameter | Initial value |
| --- | --- |
| Target | Wrist of active hand; full finger similarity off |
| Start gate radius / dwell | 7 cm / 200 ms |
| End checkpoint radius | 5 cm, reduced if actual transfer supports it |
| End dwell | 500 ms continuously valid |
| Orientation | Off; enable per step at about 30° only if it improves reliability |
| Gesture | Any; pinch/open only for a tested step |
| Sample/stall limit | Clear dwell if no fresh sample for >100 ms |
| Tracking reacquisition | 200 ms of consecutive valid samples before continuing |

Algorithm:

1. In SHOWING, completion is disabled even if the learner happens to be at the endpoint.
2. WAITING_START arms an attempt only after the active hand holds the demonstrated start region. This prevents most accidental endpoint completions. Segments with overlapping start/end regions need review; choose a separated start or an explicit local Start control.
3. In GUIDING, show direction/path feedback. Compare current learner pose in **workspace coordinates** to the next ordered gate and endpoint, independent of expert elapsed time. Only the next unpassed gate can accept evidence.
4. HOLDING accumulates real elapsed time only after required gates have been observed and every required active-hand endpoint condition is satisfied on consecutive fresh observations. Clear dwell on failure. Inactive-hand loss does not block a one-handed step.
5. Cap credited frame delta at 50 ms and reset after a large stall. A tab pause must never return with a completed dwell.
6. Emit exactly one completion for `runId + stepId + attemptId`, then transition. Repeat creates a new attempt and increments `stepRevision`.
7. On missing/nonfinite/jumping active-hand data, enter TRACKING_LOST immediately, clear dwell, suppress directional-error feedback, and stop haptics. Do not interpret disappearance as a large positional error.
8. After valid tracking returns, resume the current attempt with empty dwell and a reacquisition notice. A new calibration invalidates the attempt and returns to SHOWING/WAITING_START. Never extrapolate across the gap.
9. Visibility loss, headset removal, session end, user pause, and tab suspension suspend progression. Cancel outstanding voice requests or invalidate their revisions.

The initial `pose-match` mode verifies only start/end poses. The quality target uses `path-and-pose` for steps whose intermediate movement matters: derive one or two gates from meaningful path changes or arc-length positions, review them, and require them in order before endpoint dwell. Begin with approximately 6 cm gate radii and 100 ms holds; tune from valid recordings and learner attempts. Gates must be separated enough to discriminate progress and must not lie in tracking gaps. A simple straight placement can retain `pose-match` where an extra gate would add no meaningful information.

Keep cue progress separate from completion evidence. Use a local path-search window and bounded lookahead for the adaptive ghost; visual nearest-point projection must never mark skipped gates complete. On tracking loss, retain previously observed gates, clear partial gate/endpoint dwell, and require fresh evidence for the next gate after reacquisition. Do not infer that an occluded movement passed a gate. Offer Repeat if the learner needs to return to the next demonstrated movement.

Ordered gates verify selected motion checkpoints, not every point on the trajectory or the physical assembly state. Hand orientation and gesture can strengthen steps where they are meaningful and consistently observable; enable them based on comparative device tests rather than applying full-finger similarity everywhere.

An explicit “I completed this step” action may exist for a physically occluded step, using `completionMode: "user-confirmed"`. Show that mode visibly and log it. It cannot silently substitute for a failed pose-matched acceptance test.

### Audio timing and semantic labeling

Obtain mic permission before XR. Use `MediaRecorder.isTypeSupported` to select a supported format, preferring WebM/Opus if the device supports it. Preserve the complete blob with its actual MIME type.

Use one browser monotonic epoch. Record the approximate audio start event offset and measure its error; chunk count is not a clock. Check a visible/spoken cue at the start and end of a 30–60 second recording. Initial alignment target is ±150 ms. If that fails, use explicit markers plus review to associate narration instead of claiming sample-accurate synchronization.

For the first implementation, use `whisper-1` with `verbose_json` and word/segment timestamps. The current transcription guide limits `timestamp_granularities` to that model; do not substitute another transcriber and assume equivalent timestamp support. It documents a 25 MB upload limit, so cap narration at 20 MiB and show a size error before upload. [OpenAI transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text)

~~~ts
const transcript = await openai.audio.transcriptions.create({
  file,
  model: "whisper-1",
  response_format: "verbose_json",
  timestamp_granularities: ["word", "segment"],
});
// Convert audio-relative seconds exactly once:
// recordingMs = audioStartOffsetMs + transcriptSeconds * 1000
~~~

Assign transcript spans to deterministic step windows by overlap. Ask `gpt-4.1-mini-2025-04-14` for only `{ stepId, title, instruction, narrationSpanIds, needsReview }` records, using the Responses API's structured parsing with `zodTextFormat`. This supported snapshot is chosen for a small, bounded semantic task, not as a claim about the newest model. [Model capabilities](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

Handle refusal, incomplete output, timeout, parsing errors, duplicate/unknown IDs, unsupported narration references, and factual mismatch. Exactly one label per segment; title ≤60 characters, instruction ≤240. The model cannot alter physical targets, ranges, hand selection, or tolerances. Treat narrated text as task content, not as instructions to alter the application.

Aim for ≤15 seconds to compile the short demo recording, but show truthful elapsed status and allow retry/cancel. Do not wait indefinitely: preserve the recording and offer transcript/manual labels on failure. Cache by recording hash, segmentation revision, model, and prompt/schema version; never label a cached result as freshly generated.

### Learner questions

Implement local Repeat/Pause/What now buttons first, then deliver push-to-talk and concise contextual answers as part of the quality target. Start with file transcription for a short question and measure actual interaction latency. Consider a streaming voice transport only if it produces a material improvement within the remaining integration budget; always-on listening and wake-word detection remain optional. Voice quality includes interruption, stale-response handling, clear listening/thinking states, and a dependable local fallback.

Send only current approved instruction, nearby narration, known part names/layout, and the question. The answer should acknowledge unavailable physical information. A five-second question deadline falls back to the stored instruction. Apply replies only if request/run/tutorial revision/step revision/attempt all still match, including after repeating the same step.

For optional vision, attach a recent timestamped workspace image and explicitly identify its source. Do not treat an old webcam frame as the current state. Only an approved, tested OMNI integration counts as the Huawei sponsor path.

## 8. Persistence, recovery, and performance budgets

### Storage

Use `data/recordings/<server-id>/` containing `manifest.json`, bounded `motion/0000.json` chunks, narration, transcript, and tutorial versions. Write assets to temporary names and atomically rename before finalizing the manifest. On restart, unfinished uploads remain incomplete and unfinished jobs become interrupted/retryable.

Use JSON first; no custom binary codec. The raw numeric lower bound for two hands is:

~~~text
2 hands × 25 joints × 7 floats × 4 bytes × 30 Hz × 120 s
= 5,040,000 bytes before timestamps/metadata
~~~

JSON and in-memory objects will be significantly larger. Initial application limits: 120 seconds, 3,600 frames, 2 MiB motion chunks, 64 MiB aggregate motion upload, 20 MiB narration, one active recording/compile. Measure a real recording before treating those limits as sufficient.

Set Fastify body and multipart limits explicitly; their defaults are too small for this design. Avoid a global unrestricted upload limit. Stream audio to disk, validate hashes/counts, and report a typed size/format error. [Fastify server limits](https://fastify.dev/docs/latest/Reference/Server/#bodylimit), [Multipart plugin](https://github.com/fastify/fastify-multipart)

Cache completed tutorial data and assets in IndexedDB before Guide begins. Keep a last-good exported recording/tutorial on the laptop. Export includes schema version, joint order, coordinate conventions, asset hashes, audio, and provenance; import validates all of them. A browser `blob:` URL is never durable storage.

### Reliability boundaries

- Losing the backend after preload leaves the open guide running locally; spectator/AI/haptics report disconnected.
- A cold browser launch with no server is **not** promised unless an offline app-shell cache is later implemented and tested.
- Server restart preserves finalized recordings but invalidates in-memory connections; the active headset resends its snapshot.
- Headset session restart requires calibration; loading a tutorial does not restore spatial registration.
- Duplicate upload retries are idempotent. Duplicate/stale guide events do not change local progression.
- Telemetry must be bounded and disposable; recording buffers must fail explicitly rather than discard motion silently.

### Proposed measured budgets

| Metric | Initial target | Measurement |
| --- | --- | --- |
| Local motion processing | ≤4 ms p95 per XR frame | Instrument capture + transform + matcher on device |
| Rendering | Sustain selected device cadence; no visible guidance hitch | Record frame intervals; investigate repeated >2-frame stalls |
| Capture | 30 Hz stored, real timestamps | Capture report includes samples, gaps, duration |
| Calibration transfer | ≤2 cm held-out mark error where feasible | Two independent users, three repeated registrations |
| End checkpoint | 500 ms dwell with no false advance | Wrong-pose and interrupted-dwell fixtures plus device test |
| Compile | ≤15 s for chosen demo clip | End-to-end stop-to-ready timing, including upload |
| Question | ≤5 s or visible fallback | Click/utterance finish to visible answer |
| Spectator | ≈10 Hz, stale indicator after 1 s without updates | Disconnect/reconnect drill |

These are acceptance targets, not measured results or vendor guarantees. If performance slips, simplify ghost geometry and serialization before changing runtimes.

## 9. First two hours: feasibility spikes

Prepare a data-capable USB cable, charger, laptop, tape/ruler, rigid mat, four large pieces, and a way to reset them. A downward-facing webcam and haptic kit are optional. One person operates the headset; others work from fixtures and observe its debug output.

| Spike / time box | Owner | Concrete procedure | Pass artifact | Failure decision |
| --- | --- | --- | --- | --- |
| Device and origin, first 20 min | XR + integration | Record Quest 3S OS/Browser versions; hands enabled; headset opens secure app origin and health route | Device/version/URL checklist | Try HTTPS route if USB setup stalls |
| AR and hands, next 20 min | XR | Transparent AR, cube, both hand names/validity, 5 s capture and replay | Real recording fixture and visible replay | Recheck requested features/settings; obtain mentor help before changing stack |
| Exact task, 15 min | XR + motion | Grasp/place intended parts; hold checkpoints; obscure and restore hands | Tracking-gap report and task decision | Use larger/open-hand-friendly parts, simplify task |
| Spatial transfer, 30 min | XR | Two people calibrate independently; verify fourth mark; rotate mat/restart XR | Error measurements and transferred ghost | Fix calibration before adding semantic features |
| Repo/fixture, first 60 min | Integration + motion | Workspace install, schema, transform round-trip, desktop ghost | Passing setup checks and fixture commit | Remove optional tooling; isolate install issue |
| Audio/AI, 30 min | Voice | Mic permission before XR; speak while manipulating/casting; listen to saved blob; transcribe and parse labels | Actual audio, timestamp alignment, valid response or typed failure | Keep capture and manual labels; investigate AI off critical path |
| Spectator/network, 20 min | Integration | Receive events, disconnect/reconnect, cast actual AR scene | Snapshot recovery and usable audience view | Webcam plus schematic spectator |
| Camera, optional ≤10 min | Voice/integration | Obtain real workspace pixels and keep feed working in AR | One current image successfully interpreted | Laptop webcam; cut vision if that also stalls |
| Haptics, optional ≤15 min after core proof | Integration | Identify kit/firmware; vendor tool emits one capped pulse | Known protocol and physical pulse | Cut haptics |

Mic, hand tracking, XR, and casting must be tested **together**; independent successes do not prove simultaneous operation. If a laptop microphone is needed, synchronize using explicit shared markers and review; do not align independent device clocks by subtracting wall-clock timestamps.

At H+2, record one of: **go**, **reduced physical task**, or **blocked physical premise**. If the headset still cannot expose usable hands, continue desktop package work while the XR owner/mentor resolves that single blocker. Do not spend the remaining day building AI around an unproven capture loop.

## 10. Dependency-ordered build sequence

Time estimates start when implementation begins. Workstreams overlap; the table is not a promise that all optional work fits. Move the sponsor-selection action earlier if implementation starts later than the planning snapshot.

| Phase / window | Owner | Goal and modules | Required evidence before moving on | Fallback |
| --- | --- | --- | --- | --- |
| 0: baseline, H0–1.5 | Integration + all | Root scaffold, contracts, fixture, dev origin, `AGENTS.md` | Fresh install/check; desktop replay; health in headset | Drop optional tooling and use mocks |
| 1: physical proof, H0–4 | XR, motion supporting | `xr/session`, `hand-source`, calibration, recorder, ghost renderer | New 5–10 s recording replays after second-person calibration | Simpler task/markers; stop extra features until resolved |
| 2: one interactive step, H4–7 | Motion + XR | Pure reducer/matcher, feedback, repeat, tracking-loss states | Second person advances once at own pace; invalid data never advances | Wrist-only match, remove orientation/gesture; preserve validity and dwell |
| 3: four-step transfer, H7–11 | XR + motion + integration | Markers, reviewed motion gates, save/load, guide, spectator | Fresh four-step recording; learner finishes without operator progression; skipped required gate does not pass | Three steps, explicit markers, documented pose-only fallback if gates are unreliable |
| 4: natural authoring, H8–15 | Motion + voice + integration | Motion proposals, audio upload/alignment, tutorial-builder, editable review | Natural recording produces reviewed boundaries and labels; AI failure preserves data | Explicit markers and transcript/manual labels with clear provenance |
| 5: quality completion, H11–18 | All, ownership below | Articulated ghost, adaptive path cues, contextual push-to-talk, polished review/spectator screens | Useful voice answer on a fresh run; no path skipping; in-headset clarity/frame-budget checks | Drop optional integrations first; record any remaining target gap |
| 5b: sponsor additions, only with spare capacity before H18 | Voice + integration | Sentry Logs/Tracing; eligible OMNI call if proven | Complete useful flow and sponsor evidence | Cut addition if it displaces quality completion |
| 6: freeze and failure drills, H18–20 | All; integration leads | Built server, reconnect/restart cases, imported backup | Three consecutive target-task runs; real loss/recovery tests | Roll back to last-good build |
| 7: demo/submission, H20–22 | Integration + all | `docs/demo.md`, backup video, README, limitations, Devpost assets | Non-builder run; timed 60–120 s demo; source/setup reproducible | Pre-recorded backup clearly labeled |
| 8: reserve, H22–24 | All | Bug fixes, submission verification, recharge/reset | Entry prepared/submitted by team with time remaining | No feature additions |

**Absolute event action:** integration checks and selects sponsor tracks by **13:30 EDT on September 19**, leaving a margin before the published 14:00 cutoff. Confirm final submission before **08:00 EDT September 20**. Do not treat an internal 24-hour schedule as an extension of the official deadline.

### Four parallel workstreams

| Person | Owns | Starts immediately | Blocked on | Artifact that unblocks others |
| --- | --- | --- | --- | --- |
| 1: XR/spatial | `apps/web/src/xr`, spatial recorder, articulated ghost and in-headset presentation | Headset setup, AR cube, hand source, calibration | Working app origin and shared pose schema | Real fixture, tested transforms, polished ghost playback |
| 2: motion/runtime | `packages/motion`, segmentation, motion gates, adaptive path progress, fixtures/tests | Synthetic recording, calibration math, dwell/reducer | Frozen contracts; real samples for tuning | Deterministic guide API, proposed boundaries, replay cases |
| 3: voice/AI | `apps/server/src/ai`, audio capture, contextual voice help | Mock provider, transcript fixture, label schema, credential spike | Audio contract; real sample for sync test | Valid tutorial labels, useful contextual answer, typed failure results |
| 4: integration/demo | Server routes/storage/sessions, review/spectator UI, CI, demo | Scaffold, health, fixture viewer, spectator events, deadline tracking | Schemas; real runtime later | Shared working build, usable authoring, composed audience view |

Person 4 owns a compact, finished authoring and spectator experience with consistent typography, spacing, status feedback, and predictable controls. Person 1 owns its in-headset counterpart. Build this presentation alongside integration, preserving a known-good build throughout rather than postponing product quality until the final hour.

**Integration checkpoints:** H+1 schema/fixture; H+2 actual joint sample; H+4 calibrated replay; H+7 one-step advancement; H+11 multi-step run and visual review; H+15 natural authoring; H+18 quality acceptance and freeze. At each checkpoint run the same short smoke script and archive the working commit plus fixture. Give the headset to Person 1 continuously through physical proof, then reserve test slots for voice, rendering performance, and usability.

### Agent and branch coordination

Create `AGENTS.md` in the first implementation commit with:

- Package dependency direction, file ownership, coordinate/time conventions, and contract-version policy.
- Required `pnpm check` and relevant fixture/end-to-end checks; headset evidence must be reported separately.
- Server-only secrets; no committed raw personal recordings.
- No unilateral shared-schema changes, dependency upgrades, or refactoring another workstream's files.
- No fabricated hardware/API success; distinguish mock, fixture, and live observations.
- Bounded task instructions and explicit directories an agent may edit.

Use `codex/<bounded-task>` branches for coding agents. The integration owner merges the scaffold first and owns lockfile changes. A useful delegated task is “implement dwell and tracking-loss transitions in `packages/motion` against frozen schemas, with the slow-learner and interrupted-dwell fixtures.” Agents can implement isolated logic while humans run headset tests; avoid assigning four agents unrestricted ownership of the whole application.

## 11. Verification strategy and acceptance checklist

### Tests without a headset

Use synthetic data for edge cases and the first real capture for realism. Inject time, input samples, provider responses, and storage failure states. Tests should target product failures rather than repeat implementation details.

| ID | Scenario | Expected result |
| --- | --- | --- |
| T01 | Translate/rotate a workspace, transform out and back | Position and orientation round-trip within numeric tolerance; no scale change |
| T02 | Collinear, reversed, jittery calibration points | Reject; no valid guide state |
| T03 | Learner follows at 0.5× or 0.25× expert speed | Same completion outcome; no clock-coupled failure |
| T04 | Wrong position or wrong active hand | No dwell accumulation or advancement |
| T05 | Correct endpoint before start gate | No advancement |
| T06 | Correct pose for less/more than dwell | No early completion; one completion after threshold |
| T07 | Tracking disappears 450 ms into a 500 ms dwell | Clear dwell; fresh valid hold required |
| T08 | Non-active hand disappears | One-handed step can still complete |
| T09 | Large frame/time jump or visibility pause | No dwell credited through gap |
| T10 | Repeat, duplicate completion effect, or old event arrives | New attempt stays isolated; no skipped step |
| T11 | Quaternion sign flipped; near-zero/invalid quaternion | Equivalent rotation accepted; invalid rotation rejected |
| T12 | Old AI response arrives after advance or repeat | Discard even if step ID is reused |
| T13 | AI unavailable/refuses/returns wrong IDs | Recording preserved; typed failure and deterministic fallback |
| T14 | Oversized/corrupt/missing upload and retry | Bounded failure; no incomplete recording published |
| T15 | Finalized save → server restart → reload/export/import | Same motion/tutorial and verified asset identity |
| T16 | Spectator disconnect/reconnect and stale sequence | Stale indicator, then authoritative snapshot |
| T17 | Server disconnect after guide preload | Local checkpoint progression still works |
| T18 | Hand disappears inside recorded ghost path | Hidden interval; no stale interpolation |
| T19 | Mock haptic disconnect/expired command | No crash, no queued late pulse |
| T20 | Learner reaches endpoint while skipping a required motion gate | No advancement in `path-and-pose` mode |
| T21 | Recorded path crosses or loops near its endpoint | Cue stays in its local path neighborhood; gate order remains intact |
| T22 | Hand disappears before a gate and reappears beyond it | No inferred gate passage; previous completed gates preserved, partial dwell cleared |
| T23 | Boundary edit races an earlier compilation result | Old result rejected; gates/targets recomputed for the reviewed revision |

Use Fastify `inject()` for API validation/storage failures and Playwright for the desktop recording-review-guide flow. Browser tests exercise fixture input, rendered controls, persistence, and reconnect. They cannot validate Quest passthrough, hand accuracy, audio concurrency, casting, or physical calibration. [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Playwright web-server testing](https://playwright.dev/docs/test-webserver)

### Hardware and human acceptance

- [ ] Confirmed Quest 3S OS/Browser versions recorded; hands and controller modes validated.
- [ ] Passthrough plus ghost visible; source pose names and units verified.
- [ ] The actual part grasp/placement keeps enough hand visibility for the task.
- [ ] Two users independently calibrate; held-out mark checked, including rotated mat.
- [ ] Five-second real recording survives save/reload and replays spatially.
- [ ] Mic recording works while XR, hands, and chosen spectator path run together.
- [ ] A fresh four-step demonstration generates usable reviewed instructions.
- [ ] A natural demonstration produces useful motion boundary proposals without per-step marker controls.
- [ ] Articulated ghost, path feedback, and text remain clear during real manipulation and meet the frame budget.
- [ ] Required gates reject an endpoint shortcut; adaptive cues stay paced to a slower learner.
- [ ] Contextual push-to-talk help answers a question on the current fresh tutorial and survives interruption.
- [ ] Slow learner succeeds; wrong checkpoint fails; hand loss clears dwell.
- [ ] Remove headset/recenter/restart: no false advance, recalibration is available.
- [ ] Disconnect AI/backend after preload: physical guide completes.
- [ ] Three consecutive full runs finish without developer intervention.
- [ ] At least one non-builder finishes with no step-by-step verbal help.
- [ ] Spectator/backup media contain the actual intended visuals; verify audio separately.

Write `docs/validation.md` as a table of test, commit, device/browser, observed result, measurements, and unresolved issue. Record “not tested” where appropriate. A unit-test pass is not a substitute for the non-builder trial.

## 12. Sponsor integrations and optional haptics

### OpenAI: the default sponsor fit

Use timestamped narration and structured labels in the real record-to-guide pipeline. Document one concrete Codex contribution with a commit/test/demo explanation—for example, fixing false advancement after tracking loss. Actual OpenAI API use plus a meaningful Codex contribution are current track requirements. Do not imply that this research plan alone proves a working API integration. [Official 2026 prize requirements](https://hackthenorth2026.devpost.com/)

### Sentry: only with a useful debugging story

The current track requires **at least two products beyond error monitoring**. Choose Tracing and Logs. Trace upload → transcription → labeling and log tracking-loss/recovery, compile failures, and stale-reply rejection with recording/run/step IDs. Record one concrete defect found or improved using those tools. Installing an SDK without using the results is insufficient. Keep capture data and transcript contents out of telemetry. [Official 2026 prize requirements](https://hackthenorth2026.devpost.com/)

### Huawei OMNI Live: an optional complete multimodal interaction

Use an approved OMNI model for one grounded learner question: raw speech, a recent workspace webcam image, and current tutorial context produce useful guidance about the next piece. The three modalities must contribute to the same interaction. AR rendering is not model vision, and an ordinary text-only call does not satisfy this requirement.

The official challenge permits a cloud model and requires a functional scenario plus repository setup instructions. Its example is Qwen3.5-Omni where applicable; obtain the actual supported model ID, endpoint, schema, and credits from the sponsor. Do not assume OpenAI-compatible request formats or that a different text/vision model qualifies. API access and usable latency still need testing. [Official Huawei challenge](https://github.com/cari-waterloo-rc/OMNI-Live-Build-the-Next-Generation-of-Real-Time-Multimodal-AI)

Time-box the access/payload spike, capture one valid response, and keep the integration behind `AI_PROVIDER`/capability flags. If raw Quest images fail, use the laptop webcam openly. If the multimodal interaction is not working by feature freeze, omit the feature and its eligibility claim.

### Haptics: first feature to cut

No TITAN prize was found in the checked 2026 Devpost inventory; hardware availability and any separate program remain unconfirmed. Do not promise a sponsor track on that basis.

If a kit is actually supplied, identify model/firmware and use the vendor's terminal to prove one bounded pulse before coding. TITAN's Core documentation supports USB/serial-based development, but the exact borrowed device's protocol still needs verification. [TITAN Core](https://titanhaptics.com/titan-core-development-kit/), [Vector Haptics terminal](https://vhterminal.titanhaptics.com/)

~~~ts
interface HapticsDriver {
  pulse(intensity: number, durationMs: number): Promise<void>;
  stop(): Promise<void>;
}
~~~

Default to a mock driver. For real hardware: clamp intensity, cap each pulse at 100 ms, enforce a refractory period, and require a device/firmware duration cutoff independent of the network. Stop on tracking loss, pause, recalibration, completion, disconnect, and watchdog expiry. Drop expired/old-generation pulses; do not queue them for replay after reconnect.

Only pulse during an armed attempt for a sustained path deviation—not merely because the hand is far from the final endpoint. A controller in the user's hand interferes with physical manipulation; do not present controller vibration as wearable hand guidance.

## 13. Risk decisions and ranked cuts

| If this happens… | Then do this… | Claim affected |
| --- | --- | --- |
| Installed Quest 3S OS/Browser does not expose a required capability | Test settings/build and isolate the browser limitation; use the architecture rule for any native spike | Hardware model stays confirmed; runtime capability needs proof |
| Developer mode or USB authorization stalls | Switch to trusted HTTPS route; cap setup troubleshooting | USB/offline route remains unverified |
| Hand tracking fails during grasp | Change parts/motion; use wrist-level checkpoints after grasp | No fine-grip or object-state verification |
| Hands unavailable after feature/settings checks | Seek a working device/mentor; use desktop/controller proof only if necessary | Full bare-hand MVP is not achieved |
| Calibration cannot transfer | Improve marks/sampling and task scale; keep ghost replay local until solved | Cross-user spatial transfer is not achieved |
| Tray or origin moves mid-run | Pause and recalibrate | No persistent automatic anchoring claim |
| Automatic segmentation is poor | Use explicit markers and small review UI | Assisted segmentation rather than automatic authoring |
| Audio timing is inaccurate | Use markers and review transcript associations | No precise narration alignment claim |
| Headset mic fails in AR | Laptop mic with explicit synchronization/review | Capture source disclosed |
| AI fails or is slow | Keep recording; use stored transcript/fallback labels; guide locally | Automatic semantic generation may be degraded |
| Camera access fails | Webcam input, then cut vision | Core AR remains unaffected |
| Casting fails or excludes passthrough | Webcam plus schematic spectator; labeled backup video | Schematic is not a headset recording |
| Venue internet fails | Wired local built server + preloaded tutorial + static instructions | Fresh cloud AI unavailable |
| Server/tunnel fails after preload | Continue local guide, display disconnected spectator state | No uninterrupted remote-view claim |
| Haptic protocol/driver is unstable | Mock driver or remove feature | No real haptic demonstration |
| H+7 interactive gate is missed | Remove every stretch feature; focus on one correct step before expanding | Do not call an animation an interactive tutor |

Use measured blockers and remaining time to trigger cuts. Prior experience is not a cut criterion. Remove optional breadth before reducing the quality of the central interaction:

1. Real haptics and its hardware integration.
2. Open-ended voice conversation, TTS, and Realtime-style interaction.
3. Scene vision and Huawei OMNI integration.
4. Optional Sentry track work if its required evidence cannot be completed.
5. Extra dashboard views, custom-created hand assets, decorative effects.
6. A fifth step, or reduce four to three meaningful movements while keeping their guidance polished.
7. Only if still necessary, revert automatic segmentation to explicit markers or contextual questions to stored instructions; record these as quality-target gaps.

Preserve calibration, real recording/save/replay, legible spatial ghost/path, local learner-paced completion, truthful feedback, and tracking-loss behavior. Keep the articulated hand, useful motion gates, and finished core controls wherever the device budget permits. If any core behavior fails, describe the result as a reduced prototype rather than claiming the quality target.

## 14. Demo, recovery, and submission

### A 60–120 second live demonstration

| Time | Beat | Audience sees |
| --- | --- | --- |
| 0–10 s | Explain: “Record once; follow the expert in your own workspace.” | Real mat and current headset/spectator view |
| 10–35 s | Expert performs the small task with narration and brief checkpoint holds | Live motion and recording state; explicit markers only if using the disclosed fallback |
| 35–50 s | Stop and compile; display generated/reviewed labels | Actual compile status, no fake countdown |
| 50–65 s | Reset parts, swap headset, quick learner calibration | Different person and alignment confirmation |
| 65–105 s | Learner follows ghosts, pauses, repeats once, completes | System visibly waits and advances from the learner's input |
| 105–120 s | Show final object and one limitation | “We verify movement checkpoints, not physical assembly.” |

Rehearse headset swap and calibration; if they do not fit the timing, announce a longer live run or show a clearly labeled short capture clip followed by live learner guidance. Do not silently replace fresh capture/compilation with a cached tutorial. Include a short contextual question in the rehearsed target demo, while retaining the local fallback for a failed live request.

### Recovery kit

- Known-good built app and exported real tutorial on the laptop.
- Preloaded headset page and verified USB fallback.
- Battery/charger, stable cable routing, reset layout photo, spare large parts.
- A 60–90 second backup recording labeled “Recorded demonstration.”
- Side-by-side webcam and schematic spectator if casting is unreliable.
- Short instructions for recenter/recalibrate/reload; no hidden operator advancement.

Meta documents casting/recording tools, but the final audience path and audio must be checked on the actual laptop/headset combination. [Meta Quest Developer Hub media tools](https://developers.meta.com/horizon/documentation/spatial-sdk/ts-mqdh-media/)

### Submission evidence

Prepare a short README, architecture diagram, setup commands, tested-device information, limitations, source/design assets, team badge IDs, and selected sponsor tracks. Capture one end-to-end video and the concrete Codex/Sentry/OMNI evidence for tracks actually completed. Recheck the event portal for final instructions. The team performs submission; this plan has not registered, selected prizes, or submitted anything.

## 15. Ambition after the hackathon

The narrow demo establishes only the first step toward broader physical-skill transfer. Expand after the central loop is measured:

| Stage | Investment | Gate before claiming success |
| --- | --- | --- |
| Reliable task library | Better authoring, asset export, repeatable calibration, onboarding | Several novice users can complete multiple approved tasks |
| Richer motion adaptation | Extend initial ordered gates to richer trajectory matching, hand-size handling, left/right retargeting | Measured false-accept/false-reject rates; no degraded usability |
| Limited object awareness | One instrumented or visually distinguishable task with explicit uncertainty | Labeled real-world evaluation proves the particular object-state check |
| Durable product | Auth/storage, privacy controls, deployment, analytics, accessibility, device support | Recovery/security testing and longitudinal use; cloud anchors justified by a real need |

Do not infer training effectiveness from one successful demo. A later study should compare completion time, errors, assistance requests, and retention against an ordinary video/manual. Generalizing to a second task is a research milestone, not a hidden hackathon requirement.

## 16. Remaining decisions and evidence status

| Question | Current default | Who resolves it / by when |
| --- | --- | --- |
| Installed OS and Browser versions | Hardware confirmed: Quest 3S with joystick controllers; software versions to record | XR owner at H0 |
| Actual team size and available hours | Four people; 24 h cap | Team at kickoff; compress optional scope if fewer |
| Physical parts and mat | Large four-piece assembly | XR + motion in first 30 min |
| Hands while manipulating chosen parts | Unverified | Exact-task spike before H+2 |
| Registration accuracy across people | Unverified | Physical proof before H+4 |
| Model credentials and account access | Mock provider until real smoke test | Voice in first hour |
| Camera access in immersive session | Unverified; webcam fallback | Optional ten-minute spike |
| Spectator passthrough and audio | Unverified | Integration in first two hours |
| Borrowed haptic hardware/protocol | Unconfirmed; mock | Only after physical loop |

Research used official platform/specification/provider documentation, the current event page, and live package metadata. Device behavior, the proposed package combination, API-account access, latency targets, and the human task have not been validated by writing this plan. Source links sit beside the decisions they support; algorithm thresholds and schedule estimates are project proposals.

## 17. Immediate tickets to create

Create these in order, with the listed dependencies. Every ticket should include its owned files and evidence requirement.

- [ ] **TRAIL-01 — Validate Quest 3S runtime, task, deadlines.** Owner XR/integration; no dependency. Record OS/browser, hand mode, parts/layout, remaining hours, and sponsor cutoff in `docs/device-check.md`.
- [ ] **TRAIL-02 — Bootstrap workspace and known-good dev origin.** Owner integration; depends on 01 for device access only. Create manifests/scripts/CI/README/AGENTS/env policy; pass fresh-install and headset health checks.
- [ ] **TRAIL-03 — Freeze schemas and synthetic fixture.** Owner motion + integration; depends on 02. Add conventions, recording/tutorial/events, validator, translated/rotated fixture, and contract documentation.
- [ ] **TRAIL-04 — Prove real AR capture and replay.** Owner XR; depends on 02/03. Transparent AR, named hand joints, five-second real fixture, ghost skeleton; report tracking gaps.
- [ ] **TRAIL-05 — Implement and validate workspace registration.** Owner XR + motion; depends on 03/04. Three-point transform plus held-out mark; second-person and rotated-mat evidence.
- [ ] **TRAIL-06 — Build local motion progression.** Owner motion; depends on 03, tunes against 04. Start gate, ordered intermediate gates, adaptive cue progress, dwell, validity, repeat, pause, exactly-once completion; pass T03–T12 and T20–T22.
- [ ] **TRAIL-07 — Connect one interactive step.** Owner XR + motion; depends on 05/06. Second learner completes at their own speed and survives hand loss.
- [ ] **TRAIL-08 — Record, segment, review, persist a multi-step task.** Owner motion + integration + XR; depends on 04/06. Explicit-marker pipeline followed by motion proposals, bounded upload/finalize, cache/reload, editable boundary/gate review, fresh 3–5-step run.
- [ ] **TRAIL-09 — Capture synchronized narration.** Owner voice; depends on 02/03. Actual mic/AR concurrency, playable blob, offset/drift measurement, fallback provenance.
- [ ] **TRAIL-10 — Generate semantic labels and contextual voice help.** Owner voice; depends on 08/09. Transcription timestamps, fixed-segment labeling, strict validation, push-to-talk Q&A, interruption/stale-response handling, reviewed ready tutorial.
- [ ] **TRAIL-11 — Deliver spectator and recovery path.** Owner integration; starts with 03 mocks, completes after 07. Snapshot relay, stale indicator, real audience view, server/network recovery.
- [ ] **TRAIL-12 — Complete visual and interaction quality.** Owner XR + integration, with motion/voice support; depends on 07/08/10/11. Articulated ghost adapter, clear corrective feedback, adaptive path cues, polished authoring/spectator screens, in-headset clarity and frame-budget review.
- [ ] **TRAIL-13 — Complete learner acceptance and demo.** Owner all; depends on 12. Three clean runs, non-builder test, fresh automatic authoring and voice interaction, backup video, setup/limitations, verified submission assets.
- [ ] **TRAIL-14 — Optional sponsor additions and evidence.** Owner voice/integration; only with spare capacity after core quality work. Useful OMNI scenario or Sentry Logs+Tracing debugging story; preserve OpenAI/Codex evidence from core work.
- [ ] **TRAIL-15 — Optional bounded haptics.** Owner integration; only after core quality gates and a passing hardware spike. Mock-compatible adapter, duration cutoff/watchdog, disconnect test; otherwise close as cut.

**First working session:** integration establishes the origin and scaffold; XR verifies the headset and five-second hand capture; motion freezes the coordinate contract and builds a synthetic learner; voice tests a short narration and schema response. Meet at H+2 with evidence, then put the team's effort behind calibrated replay.
