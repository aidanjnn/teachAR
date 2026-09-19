# Routes

`createApp` in `../app.ts` registers `GET /api/health` and the voice plugin in
`voice.ts` (`POST /api/voice/transcriptions`, `POST /api/voice/labels`,
`POST /api/coach`, `POST /api/live/sessions`). `registerVoiceRoutes` accepts the
`PairingAuthority` (author token for narration/labels, learner or author for
coaching) and a `CoachTutorialLookup` that replaces client step text with the
stored tutorial; `createApp` passes both through when integration supplies them.
Recording uploads, jobs, and tutorial storage remain planned.
