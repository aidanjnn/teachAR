# WebXR voice implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Quest Browser tutor gets the GPT-Live coach and Whisper-backed step labels through the existing Fastify server, served from one origin, grounded on server-stored step text.

**Architecture:** Fastify serves the tutor's static files next to the desktop app. The existing browser coach runtime is bundled into `public/vendor/trail-coach.js` and driven by a small adapter module in the tutor. A `CoachGuideStore` on the server holds published step text so PR 14's grounding rule holds with pairing on. Narration WAVs go to the existing transcription and label routes from the review screen.

**Tech Stack:** TypeScript, Fastify 5, Zod 4, Vitest 5, Vite 8 lib build, plain ES modules in the tutor, node:test, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-20-webxr-voice-design.md`

## Global constraints

- Branch `codex/webxr-voice`, base `origin/codex/browser-tutor-handoff` (PR 17). Conventional Commits, no agent trailers.
- Provider keys stay on the server. The tutor never sees `OPENAI_*`.
- Native code under `apps/quest` is not touched. Prototype JSON is never posted as a native recording.
- Only the wrist-based follower advances steps. The coach may not.
- Node 22.23.1 via `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22.23.1`, pnpm 11.3.0.
- Every task ends with its focused check green. The full gate runs in Task 10.

---

### Task 1: CoachGuideStore and routes

**Files:**
- Create: `apps/server/src/storage/coach-guides.ts`
- Create: `apps/server/src/routes/coach-guides.ts`
- Modify: `apps/server/src/app.ts` (resolveTutorial composition, route registration)
- Modify: `packages/contracts/src/voice.ts` (`CoachGuidePublishSchema`, `CoachGuideSchema`), `packages/contracts/src/index.ts` if exports are explicit
- Test: `apps/server/test/coach-guides.test.ts`

**Interfaces:**
- Produces: `CoachGuideStore` with `recover(): Promise<void>`, `publish(input: CoachGuidePublish): Promise<{ id: string; revision: number }>`, `get(id: string): Promise<CoachGuide | null>`, `asCoachSource(guide): CoachTutorialSource`.
- Produces: `POST /api/coach-guides` (author) -> `{ id, revision }`; `GET /api/coach-guides/:id` (learner or author) -> `CoachGuide`.
- Contract: `CoachGuidePublishSchema = strictObject({ schemaVersion: literal(1), sourceId: Id, title: string 1..120, layoutNotes: string ..500 optional, steps: array(CoachStepSchema) 1..MAX_COACH_STEPS })`; `CoachGuideSchema = publish fields minus sourceId plus { id, revision, sourceId, publishedAt }`.

- [x] **Step 1: Failing tests.** In `coach-guides.test.ts`: publish returns uuid id and revision 1; republishing the same `sourceId` returns the same id and revision 2; `get` of an unknown id is null; a store recovered from disk returns the published guide; the file is written atomically (no `.tmp` left); route tests through `createApp` with a `PairingAuthority`: 401 without token, 403 for a learner posting, 200 for an author, learner can `GET`, body over 64 KiB is 413, invalid body is 400; `resolveTutorial` inside `createApp` returns the coach guide for `POST /api/coach` when the repository has no tutorial (answer text equals the current step's instruction in mock mode).
- [x] **Step 2: Run the file to see it fail:** `pnpm vitest run apps/server/test/coach-guides.test.ts`.
- [x] **Step 3: Implement the store.** JSON file per guide under `join(dataDir, 'coach-guides')`, `mkdir -p`, write to `<id>.json.tmp` then `rename`. Index by `sourceId` in memory, rebuilt in `recover()`. Validate with `CoachGuideSchema.parse` on read.
- [x] **Step 4: Implement the routes** with the same `onRequest: auth.require([...])` pattern as `storage/routes.ts`. Register in `createApp` only when `options.auth` is present.
- [x] **Step 5: Compose `resolveTutorial`:** repository first; on null, `store.get(id)` mapped through `asCoachSource` (status `'ready'`).
- [x] **Step 6: Run the test file green, then `pnpm --filter @trail/server typecheck`.**
- [x] **Step 7: Commit:** `feat(server): store published coach guides for grounded coaching`.

### Task 2: Serve the tutor from Fastify

**Files:**
- Modify: `apps/server/src/app.ts` (`tutorRoot` option, root array, `/tutorial` redirect)
- Modify: `apps/server/src/main.ts` (compute `tutorRoot`, pass in dev and prod)
- Test: `apps/server/test/static-tutor.test.ts`

- [x] **Step 1: Failing test:** `createApp(config, { tutorRoot: <temp dir with tutorial.html and x.mjs> })` serves `GET /tutorial.html` 200 with `text/html`, `GET /x.mjs` with a JavaScript content type, `GET /tutorial` 302 to `/tutorial.html`, and `GET /api/health` still works.
- [x] **Step 2: Implement.** `fastifyStatic` accepts `root: string[]`; pass `[webRoot, tutorRoot].filter(Boolean)`. Register when either is present. Add `app.get('/tutorial', (_r, reply) => reply.redirect('/tutorial.html'))` when `tutorRoot` is set.
- [x] **Step 3: `main.ts`:** `const tutorRoot = resolve(repositoryRoot, 'experiments/quest-browser/public')`, include when `existsSync`. Development mode now serves the tutor even though it skips `webRoot`.
- [ ] **Step 4: Green test, typecheck, and a manual check:** `pnpm dev` then `curl -I http://127.0.0.1:3001/tutorial.html`.
- [x] **Step 5: Commit:** `feat(server): serve the browser tutor from the main API origin`.

### Task 3: Bundle the coach runtime for the tutor

**Files:**
- Create: `apps/web/src/tutor-coach.ts`
- Create: `apps/web/vite.tutor-coach.config.ts`
- Modify: `apps/web/package.json` (`build:tutor-coach`), root `package.json` (`build` runs it), `experiments/quest-browser/prepare-vendor.mjs` (invoke the build when `trail-coach.js` is missing or `TRAIL_REBUILD_COACH=1`), `.github/workflows/check.yml` if the prototype suite needs the bundle before `test-all.sh`.

- [x] **Step 1: `tutor-coach.ts`:** `export { createCoach } from './guide/coach.js'; export type { CoachApi, CoachOptions, TranscriptEntry, LiveError } from './guide/coach.js'; export async function sessionState(fetchImpl = fetch): Promise<{ status: 'no-pairing' | 'unpaired' | 'paired'; role?: string }>` (POST `/api/session`, 404 -> no-pairing, !ok -> unpaired); `export async function pairBrowser(code: string, fetchImpl = fetch): Promise<{ ok: boolean; role?: string; message?: string }>` (POST `/api/pair` `{ code, client: 'browser' }`).
- [x] **Step 2: Vite lib config:** `build: { lib: { entry: 'src/tutor-coach.ts', formats: ['es'], fileName: () => 'trail-coach.js' }, outDir: '../../experiments/quest-browser/public/vendor', emptyOutDir: false, sourcemap: false }`. Bundle the `openai` WebRTC client in; no externals.
- [x] **Step 3: Build:** `pnpm --filter @trail/web build:tutor-coach`; confirm `experiments/quest-browser/public/vendor/trail-coach.js` exists, is under 400 KB, and `node -e "import('./experiments/quest-browser/public/vendor/trail-coach.js').then(m=>console.log(Object.keys(m)))"` lists `createCoach`.
- [x] **Step 4: `prepare-vendor.mjs`:** after the Three.js copy, run the build with `execFileSync('pnpm', ['--filter', '@trail/web', 'build:tutor-coach'])` when the file is missing. Keep the Three.js hash checks untouched.
- [x] **Step 5: Commit:** `build(web): bundle the browser coach runtime for the tutor`.

### Task 4: Step titles in the prototype

**Files:**
- Modify: `experiments/quest-browser/public/tutorial-core.mjs` (`prepareStep(frames, instruction, title='')`, `validateTutorial` copies bounded `title`, `trimStep` preserves it)
- Modify: `experiments/quest-browser/public/tutorial-review.mjs` (title input next to the instruction)
- Modify: `experiments/quest-browser/public/tutorial.html` (title field)
- Test: `experiments/quest-browser/tests/tutorial-core.test.mjs`

- [ ] **Step 1: Failing test:** a tutorial with `steps[0].title = 'Seat the cap'` round-trips through `validateTutorial`; a 200-character title is rejected; a missing title becomes `''`.
- [ ] **Step 2: Implement** with the existing `boundedText(value, 60, 'Step title')` helper.
- [ ] **Step 3: Review editor:** add `#step-title` input, save through the same clone -> validate -> replace path as instruction edits.
- [ ] **Step 4: `node --test experiments/quest-browser/tests/tutorial-core.test.mjs` green.**
- [ ] **Step 5: Commit:** `feat(web): add reviewed step titles to the browser tutorial`.

### Task 5: Tutor coach adapter

**Files:**
- Create: `experiments/quest-browser/public/tutorial-coach.mjs`
- Test: `experiments/quest-browser/tests/tutorial-coach.test.mjs`

**Interfaces:**
- `export function coachContextFor(tutorial, guideRef, { runId, attemptId, stepId, epoch })` -> `CoachContext` shape (`tutorialId: guideRef.id`, `tutorialRevision: guideRef.revision`, `title`, `steps: [{ id, title: step.title || instruction.slice(0,60) || 'Step n', instruction: step.instruction || 'Follow the ghost hand.' }]`, `currentStepId`, `stepRevision: epoch`).
- `export function createTutorCoach({ fetchImpl, coachFactory, storage, audioSink, tell })` -> `{ state, start(tutorial, step, epoch), onStep(step, epoch), onAttempt(), ask(), askText(q), stop(), pair(code), onCaption(handler), onState(handler) }`.
- Guide mapping key `trail-coach-guides` in `storage` (localStorage-like): `{ [tutorialId]: { revision, id, guideRevision } }`.

- [ ] **Step 1: Failing tests** with an injected `coachFactory` that records calls and an injected fetch that answers `/api/session` and `/api/coach-guides`: `start` publishes when no mapping exists and reuses the mapping when the revision matches; republishes when the tutorial revision changed; `onStep` calls `setStep(step.id, epoch)`; `onAttempt` calls `setAttempt` with a new id; `stop` disposes; an unpaired session returns `state.reason === 'unpaired'` without creating a coach; a 403 on publish falls back to a coach built from client steps with `state.grounded === false`.
- [ ] **Step 2: Implement** with dynamic `import('/vendor/trail-coach.js')` as the default `coachFactory` source, `crypto.randomUUID()` ids.
- [ ] **Step 3: `node --test experiments/quest-browser/tests/tutorial-coach.test.mjs` green.**
- [ ] **Step 4: Commit:** `feat(web): add a coach adapter for the browser tutor`.

### Task 6: Wire the coach into the tutor UI and follow loop

**Files:**
- Modify: `experiments/quest-browser/public/tutorial.html` (coach card in the Follow/library screen: pair form, Start coach, Ask, text question, badge, captions, `<audio id="coach-audio" autoplay hidden>`)
- Modify: `experiments/quest-browser/public/tutorial-shell.mjs` (button handlers)
- Modify: `experiments/quest-browser/public/tutorial-guide.mjs` (`this.coach`, hooks in `showStep`, `startLearning`, `handleUX` restart/try/watch, `hide`, `endSession`; suppress `speak` when coach live)
- Modify: `experiments/quest-browser/public/tutorial-ui.mjs` (`coach-ask` button in `learn`, coach status in `detail`)
- Modify: `experiments/quest-browser/public/ar.js` (dispose on Stop and `pagehide`)
- Modify: `experiments/quest-browser/public/ar.css`
- Modify: `experiments/quest-browser/server.py` (allowlist `tutorial-coach.mjs`, `narration-labels.mjs`, `/vendor/trail-coach.js`)
- Test: `experiments/quest-browser/tests/browser-coach.cjs`

- [ ] **Step 1: Failing browser workflow:** route `/api/session` -> 200 author, `/api/coach-guides` -> `{id, revision: 1}`, `/api/coach` -> answer built from the request's current step, `/api/live/sessions` -> 503 `live_unavailable`; seed a two-step tutorial through the page; click Start coach; expect badge `text`; Ask by text "what now" renders the step 1 instruction; drive the synthetic follower to step 2 and ask again; expect step 2 instruction and a recorded `/api/coach` body with `currentStepId` of step 2. Relax the GET-only route assertion for these paths only.
- [ ] **Step 2: Implement the DOM card and shell handlers.** Start coach: `await coach.start(tutorial, currentStep, guide.epoch)`; unpaired -> reveal the pair form.
- [ ] **Step 3: Guide hooks:** `showStep` -> `this.coach?.onStep(step, this.epoch)`; restart/try/watch -> `onAttempt()`; `hide` -> `onAttempt()`; `endSession` -> `stop()`. `speak(text)` returns early when `this.coach?.state.mode` is `live` or `listening`.
- [ ] **Step 4: XR panel:** `b('coach-ask', 'Ask coach')` in the `learn` case when a coach is started; `handleUX('coach-ask')` -> `this.coach.ask()`; last caption in `v.detail`.
- [ ] **Step 5: `python tests/run-browser.py` from `experiments/quest-browser` green (needs the vendor bundle from Task 3).**
- [ ] **Step 6: Commit:** `feat(web): start, ask and follow the coach from the browser tutor`.

### Task 7: Narration to titles and instructions

**Files:**
- Create: `experiments/quest-browser/public/narration-labels.mjs`
- Modify: `experiments/quest-browser/public/tutorial-review.mjs`, `tutorial.html` (Draft from narration button, per-step proposal rows with Apply)
- Test: `experiments/quest-browser/tests/narration-labels.test.mjs`

**Interfaces:**
- `export function wavBytesFromDataUrl(dataUrl): Uint8Array`
- `export async function draftFromNarration(tutorial, { fetchImpl })` -> `Array<{ stepId, title, instruction, provenance, needsReview, error? }>`; per step: `POST /api/voice/transcriptions` (body WAV bytes, `content-type: audio/wav`, `x-audio-start-offset-ms: 0`, `x-audio-duration-ms`), then `POST /api/voice/labels` `{ schemaVersion: 1, transcript, segments: [{ id: step.id, startMs: 0, endMs: duration }] }`; on any failure record `error` and continue.

- [ ] **Step 1: Failing node tests** with injected fetch: request shaping (headers, one segment per step), skipping steps without narration, per-step failure isolation, provenance passthrough.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Review UI:** button (author role required; show pairing hint otherwise), a proposals list, Apply writes `title` and `instruction` through the existing edit path and clears `reviewed`.
- [ ] **Step 4: Tests green; commit:** `feat(web): draft step titles and instructions from narration`.

### Task 8: Repository end-to-end smoke

**Files:**
- Create: `tests/e2e/tutor-coach.spec.ts`
- Modify: `playwright.config.ts` only if the web server needs `tutorRoot` (it starts `apps/server/dist/main.js`, which now serves the tutor when the directory exists).

- [ ] **Step 1: Write the spec:** mint an author code with `issueBrowserCode('author')`; `page.goto('/tutorial.html')`; pair through the tutor's form; seed a two-step tutorial via `page.evaluate` importing `/tutorial-core.mjs` and `/tutorial-store.mjs`; open Follow; Start coach; expect badge `text` (mock provider); Ask by text; expect the step 1 instruction; call the exposed `window.__trailGuide.showStep` path or drive the follower to step 2; ask again; expect step 2; reload and confirm the coach guide mapping survives.
- [ ] **Step 2: `pnpm build && E2E_PORT=3117 pnpm exec playwright test tests/e2e/tutor-coach.spec.ts` green.**
- [ ] **Step 3: Commit:** `test(e2e): pair, start and step the coach inside the browser tutor`.

### Task 9: Documentation

**Files:**
- Modify: `README.md` (browser tutor section: one origin, coach, pairing), `docs/web-delivery.md` (voice row now connected, open device gate), `apps/server/src/routes/README.md`, `experiments/quest-browser/README.md`, `docs/codex-log.md` (dated entry with checks and limits), `.env.example` comment for `PAIRING_ORIGINS` with the tutor origin.

- [ ] **Step 1: Write the entries.** State plainly: verified with the mock provider in CI and with a real key on the desktop; headset mic plus WebRTC plus immersive session unverified.
- [ ] **Step 2: Commit:** `docs(web): document the browser tutor coach and narration drafting`.

### Task 10: Full gate and manual smoke

- [ ] **Step 1:** `pnpm check`, `pnpm validate:fixtures`, `pnpm test:e2e`, and `cd experiments/quest-browser && sh test-all.sh`.
- [ ] **Step 2: Real key on the desktop:** `ALLOW_USB_LOOPBACK=true PAIRING_ORIGINS=http://127.0.0.1:3001 pnpm dev` with `AI_PROVIDER=openai`; open `http://127.0.0.1:3001/tutorial.html`; pair with the bootstrap author code; Start coach reaches `live`; ask "what do I do now" and "am I done"; record the answers in the codex log.
- [ ] **Step 3: Draft from narration with a real key:** record a short narration on a step in the desktop tutor, run Draft from narration, confirm provenance `model`.
- [ ] **Step 4:** Update the codex log with results, then hand off to `/trail-staff-review`.
