# OMNI scene coach: "Look & advise" for the Quest Browser tutor

Date: 2026-09-20. Branch `codex/omni-scene-coach`. Owner: voice/AI. Research: `docs/omni-live-track-research.md`.

## Goal

While following a tutorial, the learner presses **Look & advise** (headset panel or the Voice coach
card). The browser takes one fresh camera frame, the server sends that frame, the expert's reference
photo for the current step, the approved step text and a short question to an OMNI multimodal model
(Qwen3.5-Omni through the yibuapi OpenAI-compatible gateway), and the answer comes back as speech
plus a caption. Vision, speech and language run through one model call. The answer is advice: it
never advances a step, never confirms a physical result, never invents coordinates.

## Non-goals

- No automatic object anchoring, marker mats or corner detection (next step, see the research doc).
- No continuous frames, no realtime OMNI session, no change to progression, formats or recordings.
- No key or frame in the browser bundle; no raw media in logs or Git.

## Decisions

1. **One route, grounded like the coach.** `POST /api/scene-coach` behind the same learner/author
   pairing guard as `/api/coach`. The client names the tutorial, revision and step; the server
   replaces the step text with the stored tutorial or published coach guide through the existing
   `groundContext`. Unknown or stale tutorials are refused the same way.
2. **Provider behind a small interface.** `SceneCoachProvider.advise(request, signal)` with two
   implementations: `off` (the default, refuses with 503 `scene_unavailable`) and `omni`
   (`SCENE_COACH=omni` plus `OMNI_API_KEY`, `OMNI_BASE_URL` default `https://yibuapi.com/v1`,
   `OMNI_MODEL` default `qwen3.5-omni-flash`, `OMNI_VOICE` default `Cherry`). The omni gateway
   posts one streamed chat completion with `modalities: ["text","audio"]`, parses the SSE, joins
   the transcript and wraps the PCM16 24 kHz audio chunks in a WAV header. Tests inject a fake
   provider through `createApp({ sceneCoach })`.
3. **Bounded and fresh.** JPEG only, decoded with sharp within 1280 px and re-encoded to at most
   1024 px; capture age at most 3 s; one request in flight per process, 3 s spacing, 60 per
   process, 15 s deadline. The response echoes `requestId`, `stepId`, `stepRevision` and `epoch` so
   the browser can drop a late answer.
4. **Speech guard.** The transcript passes the same lexical guard as the vision service (completion
   or verification claims, coordinates and units). A tripped guard drops the audio and returns a
   fixed line with `provenance: 'guarded'`.
5. **Browser module owns capture and playback.** `apps/webxr/public/scene-coach.mjs` uses the
   existing `tutorialSnapshot()` (fresh frame or a loud failure), the step's stored reference photo,
   the coach adapter's grounded context (`coach.contextFor`), and plays the WAV through Web Audio.
   With no audio it falls back to the tutor's `speak()`. The caption reaches the headset panel and
   the desktop transcript through the coach adapter's caption path, and the AR page holds the tutor's
   own narration while the advice plays.
6. **Availability is visible.** The buttons appear only when the coach is active (so the context is
   grounded) and a camera stream is live. The card explains what is missing otherwise.

## Data flow

```
Look & advise (XR panel or card)
  -> snapshot(): fresh 640 px JPEG data URL, capture age
  -> coach.contextFor(step, epoch), step.reference?.image
  -> POST /api/scene-coach { requestId, context, question, source, image, reference?, captureAgeMs, epoch }
     server: pairing guard -> groundContext -> sharp bounds -> provider.advise -> lexical guard
  -> { transcript, audio: { format:'wav', dataBase64 } | null, provenance, model, latencyMs, ... }
  -> drop if tutorial/step/epoch/session changed; else play WAV, caption "Coach: ..."
```

## Errors

| Condition | Behaviour |
| --- | --- |
| `SCENE_COACH=off` or no key | 503 `scene_unavailable`; card says scene coaching is not configured |
| No camera stream | Button hidden; card says enable the camera first |
| Coach not started | Card says start the coach first (context must be grounded) |
| Frame older than 3 s or not fresh | 400 `stale_capture` / snapshot failure shown as a notice |
| Gateway error, timeout, bad SSE | 503 `scene_unavailable`, no body details logged |
| Guard trips | Fixed advisory line, no audio, `provenance: 'guarded'` |
| Late answer after step/epoch change | Dropped, "View changed; advice discarded." |

## Testing

- Server unit: SSE parsing and WAV wrapping with a fake fetch; the route with a fake provider
  (grounding, bounds, freshness, guard, spacing, 503 when off).
- Tutor Node tests: request shaping, stale-reply discard, fallback speech, caption path.
- Browser workflow: `browser-coach.cjs` gains a mocked `/api/scene-coach` call with the fake camera.
- Live: `node scripts/omni-smoke.mjs` sends a synthetic frame and question through the real gateway once the
  key exists; reports transcript, audio presence and latency. Headset audio remains a device gate.
