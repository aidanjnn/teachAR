# Dedicated visual inspection service

`apps/vision` performs on-demand JPEG/PNG inspection with image-capable Responses.
It is a separate authenticated loopback process. `apps/server` retains guide/session,
reviewed reference, nonce and observation-age authority. It never advances the guide.

## Run

Build with `pnpm build`. Set the same random, >=32-character base64url
`VISION_SERVICE_TOKEN` in both processes. Main server uses
`VISION_SERVICE_URL=http://127.0.0.1:3002`. Run `pnpm start:vision` and the main
server independently, or `pnpm dev` for the existing supervised launcher.

Default `VISION_PROVIDER=mock` returns **unavailable**, never a synthetic success.
For explicitly enabled real requests configure `VISION_PROVIDER=openai`,
`OPENAI_API_KEY`, and `VISION_MODEL` with an image-input/structured-output model
available to the account. Credentials stay only in the vision process environment;
no key is put into a URL/client asset or logged. No live calls were performed for
this implementation. Configuration is not account/model readiness verification.

`GET /internal/v1/health` reports process/configured capability;
`GET /internal/v1/ready` reports admission readiness (503 for mock/unconfigured/busy).
Both require `Authorization: Bearer <service token>`. Readiness does not make a
billed probe or establish provider health.

## Protocol and failure handling

- `POST /internal/v1/inspections`: canonical `VisionInspectionInput`, containing
  one current observation and 1–2 reviewed expert references. No remote URLs or
  caller filesystem paths. Service supplies result identity/provenance; the model
  supplies only `CoachAssessment`.
- `DELETE /internal/v1/inspections/:requestId?epoch=N`: cancels the exact active
  epoch. Abort reaches the HTTP provider when possible and suppresses late results.
- One active job, no pending queue, four bounded concurrent upload readers and
  four active duplicate waiters; 64 bounded 30-second tombstones prevent replay.
  Conflicting payloads fail. Completed verdicts are not replayed. A provider that
  ignores abort retains admission until its work actually finishes.
- JSON base64 replaces the plan's proposed multipart encoding: precise raw body
  cap `3 * ceil(2 MiB / 3) * 4 + 64 KiB`, <=2 MiB decoded bytes/image, <=1280 pixels
  per edge. Canonical base64/hash and MIME are checked; sharp performs bounded
  full decoding, rejects truncated/animated/mismatched files, then strips metadata.
- A remaining duration, not cross-machine timestamps, controls the service
  deadline. Main preserves the original 8-second total and 5-second observation
  bound, <=2-second nonce upload window, <=500ms source capture-to-send and
  strictly newer camera sequence. No automatic image retry/recapture. Explicit
  Retry starts a new nonce and new frame. Camera/backend failure leaves the guide
  paused until the learner chooses Resume.
- Decoder/provider responses are never logged or forwarded as raw errors.
  Learner images are ephemeral bounded memory; JS strings are garbage collected,
  not securely erasable. `store:false` is an API setting, not a retention promise.

## Native diagnostic flow and integration

Merge dependencies described in `docs/visual-inspection.md`. Platform feature order
30 installs the source-only MRUK camera and world-space Enable camera / Check / Cancel
controls. Enable camera is explicit after lifecycle changes. Check pauses through the
real GuideSession, sends the canonical paused snapshot to `POST /api/guide-events`,
waits for acknowledgment, requests a nonce and captures the next actual source frame.
The copied frame excludes rendered ghosts. A result is advisory text and preserves
Resume/Repeat as local learner actions. Focus loss, repeat, step/session changes or
recalibration invalidate results. Camera and backend status are separate.

The voice teammate can subscribe to `SceneInspectionController.FindingsAccepted`;
recheck `IsCurrent(context)` immediately before delivery and cancel stale playback
using the voice transport's own generation policy. This PR adds no audio, microphone,
Live session, narration or transport implementation.

## Evidence and reproduction

`pnpm exec vitest run apps/vision/test apps/server/test/inspection.test.ts` runs fake
provider and fully decoded synthetic-image cases. `two-process.test.ts` launches two
actual Node processes on free loopback ports and uses real pairing/auth. It tests
visible-match/adjustment-needed/uncertain, cancellation, kill/restart and recovery;
fixtures do not recognize objects and are never presented as model accuracy.

`dotnet run --project apps/quest/Tests/SceneHarness/SceneHarness.csproj` compiles
actual C# freshness and transport code. Unity MRUK readback, permission, sensor/queue
alignment and physical camera-to-feedback remain device validation requirements.

API sources: [Responses image inputs](https://developers.openai.com/api/docs/guides/images-vision),
[structured output](https://developers.openai.com/api/docs/guides/structured-outputs),
[MRUK camera integration](https://developers.meta.com/horizon/documentation/unity/unity-pca-documentation/).
Implementation inspected the official MRUK 205 package source (`IsUpdatedThisFrame`,
`Timestamp`, `GetTexture`) to preserve frame identity across GPU readback.
