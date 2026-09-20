# Trail agent guide

Trail records a physical demonstration and replays workspace-relative hand motion
for a learner who progresses at their own pace. **Quest Browser / WebXR is the
selected product foundation**, based on the PR #17 → #23 → #24 stack. The Unity implementation and its
tooling are retired. Do not reintroduce an editor, APK, C# parity gate or native
runtime as a requirement for this product.

Read [the current plan](docs/plan.md) and [web delivery inventory](docs/web-delivery.md).
Historical activity entries and earlier branch results are not current verification.

## Repository status and scope

`apps/webxr` contains the working browser tutor: Create/Follow, tracked-hand
recording, review/trim, local library, rigid placement, ghosts and local progression.
`pnpm dev` runs it. `apps/web`, `apps/server` and `apps/vision` provide separate
TypeScript diagnostics, authoring, storage and provider services. Use
`pnpm dev:desktop` for that stack. The API serves the tutor at `/tutorial` with
paired step-text voice coaching and narration drafting. Fresh visual coaching
and concurrent headset voice acceptance remain pending. The clean UI is connected to real actions; its standalone
preview remains simulated. Read [the UI base](docs/web-ui-base.md) and
[practice flow](docs/web-practice-flow.md), [immersive entry](docs/web-immersive-entry.md) and [fluid workspace](docs/web-fluid-workspace.md) and [headset voice](docs/headset-voice-and-origami.md) before extending the tutor.

Implement the requested work and necessary validation. Preserve unrelated work.
A build request does not authorize publication; review is read-only unless fixes
are requested. Complete authorized delivery steps without asking at each boundary.

## Skills

Canonical skills live in `.agents/skills/workflow/`. `.claude/skills/` and
`.cursor/skills/` contain relative discovery links; edit the canonical files.
`CLAUDE.md` points here so guidance has one owner. These workflows are adapted
from Copperlane's delivery skills for Trail's WebXR headset and TypeScript web/server project.

| Request | Skill |
| --- | --- |
| Commit, commit and push | [trail-commit](.agents/skills/workflow/trail-commit/SKILL.md) |
| Create/open/draft PR, write PR description | [trail-create-pr](.agents/skills/workflow/trail-create-pr/SKILL.md) |
| Staff review, review branch, grade PR | [trail-staff-review](.agents/skills/workflow/trail-staff-review/SKILL.md) |
| Cleanup, simplify, fix review findings | [trail-cleanup](.agents/skills/workflow/trail-cleanup/SKILL.md) |
| Signoff, verify readiness | [trail-signoff](.agents/skills/workflow/trail-signoff/SKILL.md) |
| Catch up with main, resolve merge conflicts | [trail-catchup](.agents/skills/workflow/trail-catchup/SKILL.md) |
| Babysit PR, fix CI, address PR feedback | [trail-babysit](.agents/skills/workflow/trail-babysit/SKILL.md) |
| Manual test plan, headset QA, demo checklist | [trail-manual-flows](.agents/skills/workflow/trail-manual-flows/SKILL.md) |
| Grill me, challenge the plan | [trail-grill-me](.agents/skills/workflow/trail-grill-me/SKILL.md) |

Use relevant skills to support the requested task; their presence does not
authorize additional external actions. Staff review, cleanup, and signoff are
useful separately, not mandatory ceremonies before every commit or PR. Do not
invoke external review bots or delegate work unless requested or separately
authorized by applicable instructions.

## Stack and ownership

| Location | Responsibility |
| --- | --- |
| `apps/webxr/public/tutorial-guide.mjs` | Live WebXR sampling/rendering, capture and action orchestration |
| `apps/webxr/public/tutorial-follow.mjs`, `tutorial-assist.mjs`, `motion-core.mjs` | Pure preview/ready/practice/transition phases, ordered movement gates, palm/save-zone comparison and rigid transforms |
| `apps/webxr/public/tutorial-core.mjs`, `tutorial-store.mjs`, `tutorial-review.mjs` | Browser format, validation, persistence and review |
| `apps/webxr/public/tutorial-shell.mjs`, `tutorial-ui.mjs`, `tutorial.html`, `tutorial.css`, `tutorial-design.mjs`, `tutorial-select.mjs` | Connected DOM/spatial UI, appearance and accessible controls |
| `apps/webxr/public/tutorial-feedback.mjs` | Event feedback, mute/cooldown and durable-save cues |
| `apps/webxr/public/narration*.mjs`, `camera-snapshot.mjs` | Optional local media; coordinate voice ownership before changing it |
| `apps/webxr/server.py` and camera lab modules | Loopback development server and isolated image-check experiments |
| `apps/web/`, `apps/server/`, `apps/vision/` | Desktop diagnostics, paired API/storage/providers and dedicated vision |
| `packages/contracts/`, `packages/motion/` | Zod API formats and pure offline/reference math |

Keep the existing Three.js/WebXR implementation as the baseline. Do not add a
replacement framework, cloud database or ORM without a product need. Retain exact
JavaScript dependency pins and `pnpm-lock.yaml`; internal packages use `workspace:*`.
WebXR owns its own Three.js dependency, copied with verified hashes and MIT license.
The current Python server remains a loopback development service, not a public host.

## Product and data invariants

- The headset browser alone owns live learner progression. AI inferences, backend and
  spectators cannot advance it; explicit spoken user navigation is allowlisted and revalidated locally or invent movement coordinates.
- Preserve PR #17's browser format `trail.tutorial.prototype.v3`, import migrations,
  IndexedDB names and `/tutorial` route. The shared API's v1 recording/tutorial
  schema is separate. Never submit one format as the other without a validated,
  versioned adapter and fixtures. Legacy shared capture metadata remains for
  import compatibility, not as an active runtime or new WebXR schema.
- Preserve meters, timestamps, normalized quaternions, explicit missing samples
  and original recording scale. Keep sampling and rendering in one XR reference
  space. Session/origin changes invalidate placement and clear progress evidence.
- Browser placement is origin plus heading. Do not claim it implements the older
  three-point fit/fourth-mark transfer protocol. No arbitrary object retargeting,
  hidden-hand reconstruction, grasp or contact verification is implemented.
- Start gating precedes ordered path gates. Only fresh valid active-hand samples
  count. Tracking loss, stalls, focus loss and pause cannot complete movement.
  Repeat starts a new attempt; discard late media/provider results after resets.
- Pure motion/following modules accept time and observations; runtime adapters
  execute I/O. Keep ghost rendering separate from real hand observations.
- Save success follows the durable IndexedDB write. Preserve explicit review,
  manual alternatives to save gestures, import validation and recovery behavior.
- Practice previews each step, then waits at the start before ordered movement
  gates and automatic next-step preview. The final “Movements finished” state and
  `movement_step_completed` events are movement-only, with physical results
  unverified. Automatic transitions must not call `TutorialPlayer.confirm()` or
  populate learner-self-confirmed results. A physical-result gate is separate
  future work when the task requires one. AI cannot assign phases or advance steps.
- Preserve PR #24's relaxed demo tuning and stationary/excursion guards. These are
  not measured accuracy guarantees. Paused, hidden, stale or focus-lost input
  cannot consume a transition timer; explicit Watch cannot complete a step.
- Loaded guidance should survive loss of optional AI/backend. Cold offline startup
  is a separate unproven capability. Keep demonstrations safe and forgiving.
- Step-text voice coaching is connected through the paired API; fresh visual
  coaching and simultaneous headset acceptance remain pending. Passthrough display is not camera-pixel access. Feature-detect camera,
  hand and audio capabilities and verify concurrency on the actual Quest browser.

## Boundaries and privacy

Keep provider credentials on the server, never in browser bundles or logs. Default
optional providers to mocks; paid camera checks require explicit opt-in. Keep
personal recordings, camera frames, raw narration, runtime ledgers, virtual
environments and secrets out of Git. Prefer synthetic fixtures.

The WebXR server binds loopback, checks Host/Origin and bounds image requests. Do
not expose it publicly as an authenticated service. Shared Fastify pairing uses
scoped roles, browser cookie/Origin checks and legacy bearer clients; preserve
those contracts while building an explicit browser adapter. Remote hosting needs
HTTPS/WSS. Spectators cannot control progression. Validate imports, API/model
inputs, revisions, storage IDs, path containment, byte limits and stale replies.

## Checks and evidence

Use [.agents/references/validation.md](.agents/references/validation.md). The full
software gate is `pnpm check`, `pnpm validate:fixtures`, `pnpm test:e2e` and
`pnpm test:webxr` after WebXR setup and Chromium installation. Focused edits use
focused checks; reuse passing evidence when inputs remain unchanged. Report
unavailable or failing checks; never weaken checks to get green results.

Separate automated, synthetic desktop/browser, live provider and headset/human
evidence. Device records include commit/worktree, Quest model/OS/browser version,
origin, scenario, measurements and remaining issues. No screenshot or synthetic
hand test establishes physical transfer or a novice's successful run. Follow
[the device checklist](docs/device-check.md).

Keep [docs/codex-log.md](docs/codex-log.md) current for substantive decisions,
edits and validation. Preserve historical entries; their old paths/toolchains
can be recovered from Git and are not instructions for the current product.

## Git and delivery

- Use an isolated `codex/<bounded-task>` branch when requested. Default base is
  `main`; honor an explicitly selected PR or existing PR's actual base.
- Keep unknown user changes intact. Use configured authorship, Conventional
  Commits and focused staging; inspect staged and untracked files. Preserve hooks.
- Do not amend/rewrite shared history or force-push without explicit authorization.
- Commit-only remains local. Push/open PR only when requested or authorized as
  part of delivery. Use the PR template and truthful validation limits. Never
  infer merge, deployment, submission or contacting others from PR authorization.
