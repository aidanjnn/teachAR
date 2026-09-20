# Trail agent guide

## Current user-directed delivery override

The immediate demo now targets **Quest Browser / WebXR**. Read [web-delivery.md](docs/web-delivery.md) before applying the older native-only instructions below. Preserve native work, but do not require Unity for browser tasks. The browser tutor is in `experiments/quest-browser`; its headset-local follower owns browser progression. AI and desktop remain advisory. Native contracts and progression are unchanged; do not mix prototype JSON with native wire formats. The clean design is connected to real browser actions. Read [web-ui-base.md](docs/web-ui-base.md) and [web-practice-flow.md](docs/web-practice-flow.md) before extending the tutor: preview-first practice auto-advances movement only; it does not confirm physical results. Voice/OMNI/vision must preserve local progression authority and reject stale session/step context.

Trail records a physical demonstration and replays workspace-relative hand motion
for a learner who progresses at their own pace. [plan.md](docs/plan.md) is the product
and implementation reference. Read the sections relevant to the change; its
planning snapshot, proposed versions, deadlines, thresholds, and hardware
assumptions are not current verification evidence.

## Repository status and scope

The repository has a pnpm application scaffold, shared recording schemas and
rigid transforms, a synthetic desktop replay, Fastify health/static serving,
an authenticated vision-service skeleton, native platform setup/pairing, strict
C# contracts, browser voice diagnostics and automated checks/CI. Local Unity
import/compile and native tests have passed; see [setup evidence](docs/native-setup.md).
Image interpretation, complete feature composition, live-provider acceptance and
headset validation remain separate gates. Inspect the current tree and
manifests before claiming a capability exists. Continue from the dependency-ordered
tickets in plan section 17; docs/scaffold.md records the bootstrap scope.

Implement the requested work and its necessary validation. Reuse passing checks
while their inputs remain unchanged. A request to build does not itself request
publication, and a request to review is read-only unless fixes are also requested.
For an end-to-end delivery request, complete all authorized steps without asking
again at each workflow boundary. Keep unrelated changes intact.

## Browser reference and pending Unity UX work

For recording, tutorial UI, ghost presentation or learner-following changes, consult
[the Unity handoff checklist](docs/ux-unity-handoff.md) alongside the plan. It records
unported browser behavior and concrete acceptance gaps. Update relevant checklist
items with implementation/test evidence; do not infer native completion from the
reference merge. `experiments/quest-browser` is a runnable porting reference, not a
second production runtime or a source of native-format recordings. Preserve the
native reducer, storage, calibration and strict contract authority.

## Skills

Canonical skills live in `.agents/skills/workflow/`. `.claude/skills/` and
`.cursor/skills/` contain relative discovery links; edit the canonical files.
`CLAUDE.md` points here so guidance has one owner. These workflows are adapted
from Copperlane's delivery skills for Trail's Unity headset and TypeScript web/server project.

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

## Intended stack and ownership

The user-approved target is **Unity + Meta XR** for a standalone Quest 3S
Android app in `apps/quest`, with the existing pnpm TypeScript/Fastify workspace
for server, authoring, desktop diagnostics and spectator. Unity import and the rig bootstrap are implemented; device validation remains
in TRAIL-18. Do not install IWSDK/Spatial SDK or downgrade Vite.
Use Unity OpenXR, Meta XR Core/Interaction and MRUK with a tested native WebRTC
adapter; freeze compatible exact versions during setup. Keep accounts/cloud DB,
ORM and React framework out of the baseline. The user requested a dedicated
visual interpretation backend: `apps/vision` is a second TypeScript/Fastify
process with authenticated health and explicit non-readiness (TRAIL-20), with authenticated internal calls from `apps/server`. Other
worker services remain outside the baseline.

| Planned location | Responsibility / owner |
| --- | --- |
| `packages/contracts/src/` | Zod wire schemas; integration coordinates serialized changes |
| `packages/motion/src/` | Existing math and offline authoring/reference logic; motion |
| `apps/quest/Assets/Trail/Contracts/`, `Motion/` | Pure C# DTO validation/calibration/matcher/reducer; motion |
| `apps/quest/Assets/Trail/Runtime/XR/`, `Record/`, `Guide/` | Native tracking, calibration UI, capture, guide integration; XR, voice owns narration files |
| `apps/quest/Assets/Trail/Runtime/Scene/`, `Presentation/` | MRUK snapshots, separate ghost and world-space UI; XR |
| `apps/quest/Assets/Trail/Runtime/Coach/`, server `ai/` | Native mic/WebRTC, Live, labels and inspection coordination; voice/AI |
| `apps/vision/src/` | Dedicated image interpretation/Responses, bounded inputs/results and cancellation; voice/AI, integration owns service wiring |
| `apps/quest/Assets/Trail/Runtime/Network/`, `Storage/` | Native pairing/API and private-file persistence; integration |
| `apps/quest/Packages/`, `ProjectSettings/`, main scene/build scripts | Compatible Unity packages/settings and build; integration |
| `apps/web/`, other server code, manifests, CI | Desktop review/replay/spectator, files, relay and checks; integration |

C# Contracts/Motion must not reference UnityEngine, Meta SDKs, networking, files,
provider SDKs or hardware. TypeScript contracts import Zod only; TypeScript
motion imports contracts/pure math only. Runtime adapters execute effects. The
reducer receives time and fresh observations, with no timers/I/O. Unity alone
owns live learner progression; server/desktop logic does not compete with it.

Preserve the existing canonical 25-joint wire format and v1 imports. Map native
OpenXR joints explicitly; keep provider/session/clock metadata in a versioned
sidecar. Serialized changes require fixtures/migration notes and C#/Zod agreement.
Use golden expected-result fixtures for shared math and strict parsing.

Integration owns pnpm and Unity dependency/lockfile changes separately. Preserve
`.meta` GUIDs, Force Text serialization and feature-owned prefabs; integration
composes the main scene to avoid concurrent scene edits. Freeze exact editor/UPM
versions in ProjectVersion/manifest/packages-lock and retain pnpm-lock.yaml for
web/server. Use `workspace:*` only for internal pnpm packages.

## Product invariants

- Motion is portable in workspace coordinates: meters, radians, monotonic
  milliseconds, right-handed axes (+X right, +Y up, +Z toward learner), normalized
  `[x,y,z,w]` quaternions, and half-open frame ranges. Preserve explicit validity;
  zero is a coordinate. Use actual timestamps and the named 25-joint contract.
- Use one XR reference space for sampling and rendering. Calibration is local
  to the XR session. Reference reset, moved mat, or session restart invalidates
  registration, clears dwell, and requires recalibration. Verify transfer on a
  fourth mark excluded from fitting; never scale the motion or hide bad
  calibration with a larger tolerance.
- Use one native XR provider/camera rig and tracking origin with locomotion off.
  Sample fresh live hand data, never cached skins, synthetic/controller hands
  or the expert ghost. Map 26 native OpenXR joints to 25 canonical names.
  Explicitly convert Unity handedness, bone axes and native/audio/camera clocks;
  test round trips and tracking gaps. Simulator/Editor input is synthetic.
- The Unity headset is the sole progression authority. The start gate precedes
  checkpoint dwell; only consecutive fresh, valid active-hand samples count.
  Tracking loss, stalls, pause or focus loss cannot complete a step.
  Completion is once per run/step/attempt; Repeat starts a new attempt/revision.
- AI labels fixed movement segments and answers from approved context. It cannot
  invent coordinates or advance the guide. Validate semantics as well as JSON;
  discard stale replies across request/run/tutorial/step/attempt revisions.
  Preserve model/manual/fallback provenance.
- GPT Live conversation and on-demand visual coaching are required targets.
  Live handles audio/text; a separate image-capable Responses request inspects
  fresh source-labelled Quest MRUK frames against reviewed expert references.
  A webcam is a disclosed reduced demo and does not pass headset-camera acceptance. Enforce
  capture freshness and session/request generations; visible agreement is advice,
  never a completion event or proof of hidden assembly properties.
- Loaded guidance survives loss of AI/backend. This promises continued use of
  an open, preloaded guide, not an untested cold offline app launch.
- Say “Movement checkpoint reached.” Endpoint matching does not verify grasp,
  assembly, or the entire trajectory. Keep user-confirmed completion visible.
  Controller replay, fixtures, and manually edited labels have explicit limits.
- Prioritize capture → calibration → replay → one local interactive step →
  fresh multi-step transfer. Prove GPT Live audio and a fresh scene source in
  parallel from the start. Extra sponsor integrations, continuous video and
  haptics follow core gates. Thresholds in the plan need hardware tuning.
- Keep physical demonstrations safe and forgiving: large lightweight parts,
  no dangerous tasks or precision-tool use.

## Boundaries and data

Provider credentials stay on the server, never in `VITE_*`, browser bundles,
Unity assets/client configuration/APKs or logs. Default optional providers/haptics to mocks. Keep raw narration, camera
frames, personal recordings, traces, and secrets out of Git; small real fixtures
require explicit consent and inspection. Synthetic fixtures are preferred.

Validate HTTP, WebSocket, import, and model inputs at their boundaries. Enforce
bounded uploads/queues, server-generated storage IDs, path containment, atomic
finalization, idempotent retries, immutable ready tutorials, and revision checks.
Pair the demo session before exposure: browser cookies require Origin checks,
including WebSocket upgrade; native HTTP/WS requires a scoped bearer token even
when Origin is absent. Use HTTPS/WSS except explicitly scoped USB-loopback dev
configuration. Missing Origin never bypasses authentication. Spectators cannot control progression. See plan sections 6–8
for exact contracts and limits.

## Checks and evidence

Use [.agents/references/validation.md](.agents/references/validation.md) to select
checks. Existing `pnpm check`, fixture and Playwright checks cover web/server.
Native changes additionally require the implemented Unity EditMode/PlayMode and
Android ARM64/IL2CPP build gates; green pnpm checks cannot validate native code.
`pnpm quest:setup` and `pnpm quest:test` require an installed editor;
`pnpm check:quest-scaffold` checks files only. Native CI is disabled; native checks run
locally (docs/ci.md). Inspect before invoking checks and report editor
activation/licensing or missing-check limitations explicitly. Do not invent scripts,
claim unavailable checks passed, or install an application just to check docs.
Normal edits use focused checks; complete signoff and code PR preparation use
the full available gate. Existing applicable checks must pass or be reported as
failing/unavailable; never weaken a check to pass it.

Report automated, desktop fixture, live provider, and headset/human evidence
separately. When hardware tests run, record commit, actual device/OS/APK/editor/SDK versions,
scenario, measured result, and remaining issues in `docs/validation.md`. That
file is created when evidence exists. Editor, simulator and desktop tests cannot prove physical
transfer, simultaneous mic/XR/hands/casting, or a novice's successful run.

Keep `docs/codex-log.md` current with substantive research, decisions, edits and
validation; preserve historical entries and distinguish planned, automated,
live-provider and headset evidence. Do not log secrets or raw media.

## Git and delivery

- Default integration branch: `main`; honor an explicit base or an existing
  PR's actual base. Create `codex/<bounded-task>` branches for agent work.
- On an unborn repository, inspect `git ls-remote origin` before the first
  commit; reconcile any existing remote history without resetting user work.
  A PR needs an established base with shared history. Never manufacture an
  empty base or force-push to work around bootstrap.
- Use Conventional Commits for commits and PR titles, with scopes such as
  `xr`, `motion`, `contracts`, `record`, `guide`, `ai`, `server`, `docs`, `agents`.
  Stage specific files and inspect the staged diff, including untracked files.
- Use configured Git authorship. Do not add agent credit/coauthor trailers or
  override the author unless requested. Preserve hooks; no `--no-verify`.
  Do not amend, rewrite shared history, or force-push unless explicitly requested.
- A commit-only request remains local; push when requested or part of authorized
  PR delivery. PR creation does not authorize merging, deploying, submitting to
  the hackathon, or contacting sponsors. Use the repository PR template and
  distinguish plan ticket labels (e.g. `TRAIL-06`) from actual issue links.
