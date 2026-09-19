# Trail

**Record a physical task once. Follow the expert's movements in your own workspace, at your own pace.**

Trail is a planned mixed-reality physical-skill tutor for **Meta Quest 3S**,
developed for Hack the North 2026. An expert demonstrates a short task with
narration. Trail turns the recording into a reviewed tutorial, then guides a
different person with articulated ghost hands, spatial path cues, and movement
checkpoints aligned to their workspace.

**Current status:** planning and agent-workflow scaffold. The repository has an
implementation plan and development skills; the application, package manifests,
lockfile, CI, and headset validation are not implemented yet. The capabilities
and setup below describe the intended build, not a working release.

## The experience

1. **Record.** The expert calibrates a marked mat, then performs and narrates a
   short task. Hand motion and audio share one recording timeline.
2. **Review.** Trail proposes movement boundaries and instruction labels. The
   expert adjusts the steps, active hand, and motion gates before saving the
   tutorial. Explicit markers provide a recovery path for authoring.
3. **Transfer.** A learner resets the parts and independently calibrates the
   same mat. The tutorial is preloaded onto the headset.
4. **Follow.** A translucent articulated ghost demonstrates each movement.
   Guidance responds to the learner's progress through the required motion
   gates and waits for a valid checkpoint hold before advancing.
5. **Recover and ask.** Repeat, Pause, and Help remain accessible. Contextual
   push-to-talk answers use the approved instructions; the local guide continues
   if AI or the server disconnects after preload.

The first demonstration uses four large, lightweight pieces on a rigid
50 × 35 cm mat: place a base, insert a support, add a crosspiece, and fit a cap.
Both people use the same layout and dominant hand. Three marks establish the
workspace; a fourth independently checks alignment.

Trail provides **spatial motion guidance**. “Movement checkpoint reached” means
the tracked hand satisfied the configured movement conditions. It does not
verify that an object was grasped or assembled correctly.

## Planned architecture

```mermaid
flowchart LR
    Capture[Quest hand motion and narration] --> Record[Calibrate and record]
    Record --> Store[Local cache and Fastify storage]
    Store --> Motion[Deterministic motion segmentation]
    Store --> AI[Transcription and instruction labels]
    Motion --> Review[Expert review]
    AI --> Review
    Review --> Guide[Preloaded local guide]
    Hands[Live learner hand poses] --> Guide
    Guide --> Feedback[Ghost hands, path cues, checkpoints]
    Guide -. state snapshots .-> Spectator[Laptop spectator view]
    Guide -. optional request .-> Coach[Contextual voice help]
```

| Layer | Planned technology and responsibility |
| --- | --- |
| Headset and desktop UI | TypeScript, Vite, HTML/CSS, Three.js, WebXR in Meta Browser |
| Shared contracts | Zod schemas and inferred TypeScript types |
| Motion runtime | Pure TypeScript transforms, segmentation, ordered gates, and guide reducer |
| Backend | One Fastify process for uploads, storage, jobs, AI, and WebSocket relay |
| Persistence | Local files on the demo laptop and browser IndexedDB |
| AI | OpenAI transcription, structured instruction labels, and contextual help |
| Verification | Vitest, Fastify API tests, Playwright desktop flows, and separate headset trials |

The browser owns progression. AI supplies semantics, never authoritative spatial
coordinates or permission to advance a step. Shared motion logic receives time
and observations explicitly; rendering, network, audio, and hardware stay in
adapters. Calibration belongs to the current XR session and must be repeated
after a reference-space reset or session restart.

WebXR is the planned runtime. A native alternative is considered only if a
measured browser limitation blocks a required core capability and a bounded
native proof demonstrates a viable improvement.

## Repository map

Available now:

- [plan.md](plan.md) — product scope, contracts, algorithms, build sequence, and acceptance criteria.
- [AGENTS.md](AGENTS.md) — coding conventions, package boundaries, and agent workflow index.
- [.agents/skills/workflow/](.agents/skills/workflow/) — commit, PR, review, cleanup, verification, and QA skills.
- [.agents/references/validation.md](.agents/references/validation.md) — guidance for selecting and reporting evidence.

Planned application layout:

```text
apps/web/             XR, recording, guidance, replay, review, and spectator UI
apps/server/          Fastify routes, storage, AI, and session relay
packages/contracts/  Versioned schemas and shared types
packages/motion/     Pure calibration, segmentation, and progression logic
fixtures/            Synthetic and explicitly approved real test recordings
tests/e2e/           Desktop browser acceptance flows
docs/                Device checks, contracts, demo instructions, and validation
data/                Private local recordings and generated assets; ignored by Git
```

## Development setup

**The following is the planned setup after the application scaffold is built.**
These commands are not runnable against the current repository. Bootstrap work
is specified in [plan section 4](plan.md#4-stack-and-repository-setup).

The plan selects Node **22.23.1** and pnpm **11.3.0**. Application dependency
versions remain proposed until the workspace is installed and tested together.

Once manifests, scripts, the lockfile, and `.env.example` exist:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

The intended development server is `http://localhost:5173`, with `/api` and `/ws`
proxied to Fastify on `127.0.0.1:3001`. The default configuration uses mock AI and
haptics. Live integrations require server-side credentials. Provider keys must
never enter `VITE_*` variables, client bundles, or source control.

Planned commands:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Build shared packages, then start development watchers and both apps |
| `pnpm check` | Typecheck, unit tests, and production build |
| `pnpm test:e2e` | Desktop fixture and browser flows |
| `pnpm build` | Build shared packages, web, and server |
| `pnpm start` | Serve the built application and API from Fastify |

### Quest connection

The confirmed hardware is a **Meta Quest 3S with controllers**. Installed OS and
Browser versions, hand-tracking behavior, and application compatibility still
need device validation. Controllers support setup and recovery; they do not
provide a bare-hand skeleton.

After the application runs locally, the planned wired development path is:

1. Enable developer mode, connect a data-capable USB cable, and accept the
   headset's debugging prompt. Install Android platform tools or Meta Quest
   Developer Hub on the laptop.
2. Confirm the device is authorized and reverse the development port:

   ```sh
   adb devices
   adb reverse tcp:5173 tcp:5173
   ```

3. Open `http://localhost:5173` **in the headset browser**. Verify the secure
   context, XR availability, and health route before entering AR.
4. Grant microphone permission before entering XR. Switch from controllers to
   bare hands, calibrate the mat, and verify the held-out mark.

For the built wired demo, the plan serves the app and API together on port 3001
and reverses that port instead. Untethered use requires trusted HTTPS/WSS and
session pairing. These connection paths must be verified on the actual device;
no known-good application commit has been established yet.

## Build milestones

The goal is a polished four-step experience. The minimum demo is an intermediate
recovery milestone, with any reduced capabilities disclosed.

| Milestone | Required evidence |
| --- | --- |
| Workspace and device baseline | Reproducible install/check, desktop fixture, headset health and AR entry |
| Spatial proof | Fresh real hand recording replays after a second person's independent calibration |
| One interactive step | Learner advances at their own pace; tracking loss cannot falsely complete a step |
| Multi-step transfer | Fresh 3–5-step recording saves/reloads; required motion gates cannot be skipped |
| Natural authoring and help | Motion proposals and narration produce reviewed steps; contextual voice help works on a fresh run |
| Quality and acceptance | Clear articulated ghost and feedback, finished review/spectator UI, recovery drills, three clean runs, and a non-builder trial |

Implementation tickets and dependencies live in
[plan section 17](plan.md#17-immediate-tickets-to-create). Scene vision, optional
sponsor integrations, and real haptics follow the core quality gates.

## Validation and limits

Automated checks will cover transforms, invalid calibration, slow learners,
ordered gates, interrupted dwell, stale replies, bounded uploads, persistence,
and reconnect behavior. Desktop fixtures cannot establish real hand accuracy,
cross-user alignment, simultaneous microphone/XR/casting behavior, or usability.

Record actual device results separately in `docs/validation.md` when testing
starts, including the commit, device/software versions, scenario, measurements,
and remaining issues. The complete criteria are in
[plan section 11](plan.md#11-verification-strategy-and-acceptance-checklist).

- Guidance must pause safely on tracking loss, session interruption, or invalid
  calibration. It must never advance from stale poses or elapsed time in a gap.
- Continuing a preloaded guide without the backend is a design requirement;
  a cold offline browser launch is not promised.
- Manual labels, explicit markers, controller-only replay, and fixtures retain
  their provenance and cannot stand in for untested target capabilities.
- Raw narration, camera frames, personal recordings, and secrets stay out of
  Git and logs. Real fixtures require deliberate consent and review.
- Arbitrary object tracking, physical assembly verification, dangerous tasks,
  persistent cloud anchors, and remote multiplayer are outside the scope.

## Contributing

Read [AGENTS.md](AGENTS.md) before changing the repository. Use
`codex/<bounded-task>` branches, keep changes within the relevant workstream,
and coordinate shared-schema and dependency changes. The repository includes
Trail-specific skills for commits, PR creation, staff review, branch catch-up,
PR feedback, signoff, cleanup, manual QA, and plan critique, with discovery links
for Claude and Cursor.
