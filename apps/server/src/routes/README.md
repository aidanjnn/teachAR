# Routes

`createApp` in `../app.ts` registers `GET /api/health` and the voice plugin in
`voice.ts` (`POST /api/voice/transcriptions`, `POST /api/voice/labels`,
`POST /api/coach`, `POST /api/live/sessions`, `POST /api/live/sessions/:id/step`,
`DELETE /api/live/sessions/:id`). `registerVoiceRoutes` accepts the
`PairingAuthority` (author token for narration/labels, learner or author for
coaching) and a `CoachTutorialLookup` that replaces client step text with the
stored tutorial; `createApp` passes both through, and with `auth` it grounds against
the tutorial repository automatically. Live step context is pushed by the server
over the SDK sideband (`ai/live-sessions.ts`): a session is only handed out once its
control channel is open, step updates carry a client generation and older ones are
refused, idle sessions expire on a timer, and a channel error drops the session so
the browser falls back to text.
Recording uploads, jobs, and tutorial storage remain planned.
