# Routes

`createApp` in `../app.ts` registers `GET /api/health` and the voice plugin in
`voice.ts` (`POST /api/voice/transcriptions`, `POST /api/voice/labels`,
`POST /api/scene-coach` (registered by `routes/scene-coach.ts` beside the voice plugin; Look & advise: a fresh JPEG frame, the step's reference photo and a question, grounded like `/api/coach`, sent to the OMNI model when `SCENE_COACH=omni`; speech back as WAV, completion claims replaced by a guarded line, one request in flight, 3 s spacing, frames older than 3 s refused),
`POST /api/coach`, `POST /api/live/sessions`, `POST /api/live/sessions/:id/step`,
`DELETE /api/live/sessions/:id`). `registerVoiceRoutes` accepts the
`PairingAuthority` (author token for narration/labels, learner or author for
coaching) and a `CoachTutorialLookup` that replaces client step text with the
stored tutorial; `createApp` passes both through, and with `auth` it grounds against
the tutorial repository automatically. Live step context is pushed by the server
over the SDK sideband (`ai/live-sessions.ts`): a session is only handed out once its
control channel is open, step updates carry a client generation and older ones are
refused, every session ends on its own 30-minute timer, and a channel error drops
the session so the browser falls back to text.
Recording uploads, jobs and tutorial routes are registered in `../storage/routes.ts`;
see the [authoring and storage guide](../../../../docs/authoring-storage.md).
`coach-guides.ts` (registered only with pairing) stores reviewed step text that browser
tutorials publish: `POST /api/coach-guides` (author) mints a server id and bumps the
revision per `sourceId`; `GET /api/coach-guides/:id` and `POST /api/coach-guides/:id/query`
(learner or author) read it back. `createApp` resolves coach context from the tutorial
repository first and then from this store, so grounding holds for guides that only exist in a
browser. `createApp` also serves the Quest Browser tutor's static files behind the desktop
build when `tutorRoot` is set, with `/tutorial` served directly because the page keys off
that pathname.
