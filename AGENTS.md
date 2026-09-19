# Trail agent guide

Trail records a physical demonstration and replays workspace-relative hand motion
for a learner who progresses at their own pace. [plan.md](plan.md) is the product
and implementation reference. Read the sections relevant to the change; its
planning snapshot, proposed versions, deadlines, thresholds, and hardware
assumptions are not current verification evidence.

## Repository status and scope

This scaffold supplies agent workflows. Application packages, scripts, CI, and
headset validation are still planned. Inspect the current tree and manifests
before using commands or claiming a capability exists. Implementation starts
from the dependency-ordered tickets in plan section 17.

Implement the requested work and its necessary validation. Reuse passing checks
while their inputs remain unchanged. A request to build does not itself request
publication, and a request to review is read-only unless fixes are also requested.
For an end-to-end delivery request, complete all authorized steps without asking
again at each workflow boundary. Keep unrelated changes intact.

## Skills

Canonical skills live in `.agents/skills/workflow/`. `.claude/skills/` and
`.cursor/skills/` contain relative discovery links; edit the canonical files.
`CLAUDE.md` points here so guidance has one owner. These workflows are adapted
from Copperlane's delivery skills for Trail's smaller TypeScript/WebXR project.

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

Use the plan's pnpm workspace: strict TypeScript, Vite with plain HTML/CSS and
Three.js, one Fastify server, Zod contracts, and pure motion logic. Keep the
baseline small: local files and IndexedDB, no accounts/cloud database, Unity,
React framework, ORM, or separate worker service without an agreed scope change.

| Planned location | Responsibility / owner |
| --- | --- |
| `packages/contracts/src/` | Zod schemas and inferred types; integration coordinates changes |
| `packages/motion/src/` | Pure transforms, segmentation, matcher, guide reducer; motion |
| `apps/web/src/xr/`, `record/` | XR session, named hand joints, calibration, capture; XR/spatial |
| `apps/web/src/guide/`, `replay/` | Runtime adapters and desktop fixtures; XR + motion |
| `apps/web/src/dashboard/`, `storage/` | Small review/guide/spectator UI and IndexedDB; integration |
| `apps/server/src/ai/`, browser audio capture | Transcription and bounded semantic labeling; voice/AI |
| Other server code, manifests, lockfile, CI | Routes, files, relay, known-good build; integration |

`contracts` imports Zod only. `motion` imports contracts and pure math only.
Both stay independent of DOM/WebXR types, Three.js, Node filesystem, provider
SDKs, and hardware. Web/server adapters execute effects outside the reducer.
The reducer receives time and observations; it owns no timers or I/O.

Coordinate shared-schema changes with their consumers; include a fixture and
version/migration note for serialized changes. Keep integration ownership of
dependency and lockfile changes; avoid unrelated upgrades or refactors in
another workstream. Freeze exact working dependencies and one lockfile after
setup. Use `workspace:*` internally.

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
- The browser is the sole progression authority. The start gate precedes
  checkpoint dwell; only consecutive fresh, valid active-hand samples count.
  Tracking loss, stalls, pause, or visibility loss cannot complete a step.
  Completion is once per run/step/attempt; Repeat starts a new attempt/revision.
- AI labels fixed movement segments and answers from approved context. It cannot
  invent coordinates or advance the guide. Validate semantics as well as JSON;
  discard stale replies across request/run/tutorial/step/attempt revisions.
  Preserve model/manual/fallback provenance.
- Loaded guidance survives loss of AI/backend. This promises continued use of
  an open, preloaded guide, not an untested cold offline browser launch.
- Say “Movement checkpoint reached.” Endpoint matching does not verify grasp,
  assembly, or the entire trajectory. Keep user-confirmed completion visible.
  Controller replay, fixtures, and manually edited labels have explicit limits.
- Prioritize capture → calibration → replay → one local interactive step →
  fresh multi-step transfer. Optional vision, conversation, telemetry, and haptics
  follow demonstrated core gates. Thresholds in the plan need hardware tuning.
- Keep physical demonstrations safe and forgiving: large lightweight parts,
  no dangerous tasks or precision-tool use.

## Boundaries and data

Provider credentials stay on the server, never in `VITE_*`, browser bundles, or
logs. Default optional providers/haptics to mocks. Keep raw narration, camera
frames, personal recordings, traces, and secrets out of Git; small real fixtures
require explicit consent and inspection. Synthetic fixtures are preferred.

Validate HTTP, WebSocket, import, and model inputs at their boundaries. Enforce
bounded uploads/queues, server-generated storage IDs, path containment, atomic
finalization, idempotent retries, immutable ready tutorials, and revision checks.
Pair the demo session and check Origin, including on WebSocket upgrade, before
exposing a tunnel. Spectators cannot control progression. See plan sections 6–8
for exact contracts and limits.

## Checks and evidence

Use [.agents/references/validation.md](.agents/references/validation.md) to select
checks. Once implemented, `pnpm check` is the shared typecheck/test/build gate;
run relevant fixture and `pnpm test:e2e` checks as well. Do not invent scripts,
claim unavailable checks passed, or install an application just to check docs.
Normal edits use focused checks; complete signoff and code PR preparation use
the full available gate. Existing applicable checks must pass or be reported as
failing/unavailable; never weaken a check to pass it.

Report automated, desktop fixture, live provider, and headset/human evidence
separately. When hardware tests run, record commit, actual device/Browser/OS,
scenario, measured result, and remaining issues in `docs/validation.md`. That
file is created when evidence exists. Desktop tests cannot prove physical
transfer, simultaneous mic/XR/hands/casting, or a novice's successful run.

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
