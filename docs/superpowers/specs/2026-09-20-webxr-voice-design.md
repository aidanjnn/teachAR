# WebXR voice: GPT-Live coach and Whisper labels for the Quest Browser tutor

Date: 2026-09-20. Branch `codex/webxr-voice`, stacked on PR 17 (`codex/browser-tutor-handoff`).
Owner: voice/AI. Supersedes the Unity-only assumptions of the 2026-09-19 voice design for the
browser demo runtime named in `docs/web-delivery.md`. Native code is untouched.

## Goal

The learner wearing a Quest 3S in the browser tutor (`experiments/quest-browser`, `/tutorial`)
can start a voice coach, enter AR, ask a question out loud, and hear GPT-Live answer from the
reviewed step text of the tutorial they are following, with step changes pushed by the server.
The expert can turn each step's recorded narration into a drafted title and instruction through
the existing Whisper and label routes, and review them before approving.

## Non-goals

- No OMNI model, no Sentry, no camera-based visual coaching in this change.
- No changes to the native Unity app, C# contracts or the native recording wire format.
- No conversion of `trail.tutorial.prototype.v3` motion into native recordings. Only reviewed
  step text leaves the browser.
- No hands-free always-on listening. The learner opens the mic with a button, as in the desktop coach.

## Decisions

1. **One origin.** The Fastify server (`apps/server`) serves the tutor's static files alongside
   `apps/web/dist`, in development too. Over USB the headset opens
   `http://localhost:<port>/tutorial.html`; the coach routes, the pairing cookie and the tutor share
   that origin. `server.py` keeps working for the legacy camera lab and its own tests. A
   `/tutorial` redirect keeps the documented entry path.
2. **Reuse the coach runtime.** `apps/web/src/guide/coach.ts` (reducer, WebRTC transport, text and
   local fallbacks, stale-output rules) is bundled by a second Vite config into
   `experiments/quest-browser/public/vendor/trail-coach.js`, next to the vendored Three.js, and is
   gitignored the same way. `prepare-vendor.mjs` runs that build. No second implementation.
3. **Ground on server-stored text.** With pairing on, the coach answers only from a stored
   tutorial. A new `CoachGuideStore` holds `{ id, revision, title, layoutNotes?, steps[{id,title,instruction}] }`
   published by an author from the tutor. `createApp` resolves coach context from the tutorial
   repository first, then the coach guide store. Coach guides are always `ready`; publishing is the
   review act. Files live under `DATA_DIR/coach-guides/<id>.json`, written atomically, server-generated
   ids, revision increments on republish of the same `sourceId`.
4. **Roles.** The headset browser pairs once with an author code (author may coach and publish).
   A learner code also works for coaching. Nothing works unpaired when pairing is configured; plain
   `pnpm dev` without pairing keeps trusting client context, unchanged.
5. **Identity and generations.** The tutor has no run or attempt ids. The adapter mints
   `runId` per Start coach, `attemptId` per restart/try-follow, and passes the tutor's `epoch` into
   `stepRevision` so a stale step answer is dropped after any reset. Step ids are the prototype's
   step ids. Tutorial revision is the prototype's `revision`.
6. **Mic ownership.** The coach owns its own `MediaStream`, separate from `NarrationRecorder`.
   Start coach runs from a click on the Follow screen before `requestSession`, so the XR entry click
   stays synchronous. `endSession`, `pagehide` and Stop dispose the coach. `hide()` (visibility loss)
   closes the output gate by setting a new attempt.
7. **One voice loop.** While the coach is connected, the tutor's `speechSynthesis` `speak()` is
   suppressed. Narration playback is already disabled during guided practice.
8. **Titles.** The prototype step gains an optional `title` (bounded, 60 chars). Labels fill it;
   the review editor shows it; the coach guide publishes it. Missing titles fall back to the first
   60 characters of the instruction at publish time.

## Components and interfaces

### Server (`apps/server`)

- `src/storage/coach-guides.ts`: `class CoachGuideStore { constructor(dataDir); recover(); publish(input): Promise<{id, revision}>; get(id): Promise<CoachGuide|null> }`.
  Input schema `CoachGuidePublishSchema = { schemaVersion: 1, sourceId: Id, title, layoutNotes?, steps: CoachStep[] (1..MAX_COACH_STEPS) }`.
  Republishing the same `sourceId` returns the same `id` with `revision + 1`.
- `src/storage/routes.ts` or a new `src/routes/coach-guides.ts`: `POST /api/coach-guides` (author only, 64 KiB body) returns `{ id, revision }`; `GET /api/coach-guides/:id` (learner or author) returns the guide.
- `src/app.ts`: `resolveTutorial` composes repository then store. New option `tutorRoot?: string`; static serving uses `root: [webRoot, tutorRoot]` in production and `[tutorRoot]` in development; `GET /tutorial` redirects to `/tutorial.html`.
- `src/main.ts`: passes `tutorRoot = repositoryRoot/experiments/quest-browser/public` when the directory exists.

### Web bundle (`apps/web`)

- `src/tutor-coach.ts`: re-exports `createCoach` and the types the tutor needs, plus a tiny
  `pairBrowser(code)` and `sessionState()` helper around `/api/pair` and `/api/session`.
- `vite.tutor-coach.config.ts`: lib build, `formats: ['es']`, output
  `../../experiments/quest-browser/public/vendor/trail-coach.js`, `emptyOutDir: false`.
- `package.json`: `build:tutor-coach` script.

### Tutor (`experiments/quest-browser/public`)

- `tutorial-coach.mjs` (new): `export function createTutorCoach({ guide, tell, audioSink })` with
  `start()`, `ask()`, `askText(q)`, `stop()`, `onStep(step, epoch)`, `onAttempt()`, `state`.
  Builds `CoachContext` from the tutorial, publishes the coach guide when the stored
  `(tutorialId, revision)` has no guide id, and maps tutor events to `setStep` and `setAttempt`.
  Persists the guide mapping in `localStorage['trail-coach-guides']`.
- `tutorial-guide.mjs`: hooks in `showStep`, `startLearning`, `handleUX('restart-follow'|'try-follow'|'watch-demo')`,
  `hide`, `endSession`; `speak()` suppression when the coach is live.
- `tutorial-ui.mjs`: `coach-ask` button in the `learn` case, coach status in `v.detail`.
- `tutorial.html`, `tutorial-shell.mjs`, `ar.css`: Follow screen gets a coach card (pair code input,
  Start coach, Ask, Ask by text, status badge, captions list, hidden `<audio autoplay>`);
  Review screen gets "Draft from narration" and per-step title/instruction proposals with Apply.
- `tutorial-core.mjs`: optional `title` on steps through `prepareStep`, `validateTutorial`, `trimStep`.
- `tutorial-review.mjs`: title field, narration drafting UI.
- `narration-labels.mjs` (new): `draftFromNarration(tutorial, fetchImpl)` decodes each step's WAV
  data URL, posts to `/api/voice/transcriptions` with `x-audio-duration-ms`, then
  `/api/voice/labels` with one segment per step, and returns `{ stepId, title, instruction, provenance, needsReview }[]`.
- `server.py` static allowlist gains the new modules so the legacy server still serves the page.

### Data flow

```
Follow screen click "Start coach"
  -> sessionState(): 404 (no pairing) | 401 (pair first) | 200 role
  -> ensure coach guide: POST /api/coach-guides { sourceId: tutorial.id, title, steps }
  -> createCoach({ context: { tutorialId: guide.id, tutorialRevision: guide.revision, runId, attemptId,
                              title, steps, currentStepId, stepRevision: epoch } })
  -> connect(): live | text
Enter AR -> showStep(): coach.setStep(step.id, epoch)
         -> restart/try-follow: coach.setAttempt(newId)
         -> XR "Ask coach" or DOM Ask: coach.ask()
         -> transcript deltas: captions in the DOM list and the XR detail line
Exit AR / Stop / pagehide -> coach.dispose()
```

### Errors

| Condition | Behaviour |
| --- | --- |
| Pairing configured, browser not paired | Start coach shows "Pair this browser first" and the code form |
| Publish refused (403 learner) | Coach starts in local text mode with client steps, badge says why |
| `live_unavailable` or no mic | Existing runtime falls back to text; badge shows `text` |
| Step update refused (409 stale) | Existing runtime ignores superseded refusals; a current refusal drops to text |
| Narration transcription fails for one step | That step keeps its typed instruction; provenance `fallback` shown |

## Testing

- Server unit: store publish/get/republish/atomic write/unknown id; route auth (401/403/200) and
  body limits; `resolveTutorial` composition returns coach guides when the repository has no tutorial.
- Static serving: `GET /tutorial.html` 200 and `/tutorial` 302 in development mode.
- Prototype node tests: `title` round trip in `validateTutorial`, `narration-labels` request shaping
  with an injected fetch, `tutorial-coach` context building and generation mapping with a fake coach.
- Prototype browser workflow `tests/browser-coach.cjs`: mocked `/api/session`, `/api/coach-guides`,
  `/api/coach`; Start coach reaches `text`, Ask by text renders the answer, a step change posts the
  new step id.
- Repo end-to-end `tests/e2e/tutor-coach.spec.ts`: real Fastify with mock provider and pairing on,
  mint an author code, pair inside the tutor, seed a tutorial through the page, Start coach, Ask by
  text, assert the answer is the current step's instruction and that a step change changes it.
- Manual with a real key on the desktop: Start coach in the tutor reaches `live`, spoken answer
  heard, refusal on "am I done" observed; Draft from narration returns model provenance.
- Device: mic + WebRTC + immersive session on the Quest is recorded as an open gate in
  `docs/web-delivery.md` until someone runs it.

## Docs

`README.md` browser section, `docs/web-delivery.md` voice row and acceptance list,
`apps/server/src/routes/README.md`, `experiments/quest-browser/README.md`, `docs/codex-log.md`.
