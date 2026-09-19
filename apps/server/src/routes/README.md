# Routes

`createApp` in `../app.ts` registers `GET /api/health` and the voice plugin in
`voice.ts` (`POST /api/voice/transcriptions`, `POST /api/voice/labels`,
`POST /api/coach`, `POST /api/live/sessions`, `POST /api/live/sessions/:id/step`,
`DELETE /api/live/sessions/:id`). `registerVoiceRoutes` accepts the
`PairingAuthority` (author token for narration/labels, learner or author for
coaching) and a `CoachTutorialLookup` that replaces client step text with the
stored tutorial; `createApp` passes both through and registers the pairing routes
when `auth` is supplied. Live step context is pushed by the server over the SDK
sideband (`ai/live-sessions.ts`); the browser only reports a step ID.
Recording uploads, jobs, and tutorial storage remain planned.
