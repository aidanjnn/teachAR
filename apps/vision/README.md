# Dedicated visual inspection service

`apps/vision` performs on-demand JPEG/PNG inspection with image-capable Responses.
It is a separate authenticated loopback process. `apps/server` retains guide/session,
reviewed reference, nonce and observation-age authority. It never advances the guide.

## Run

Build with `pnpm build`. Set the same random, >=32-character base64url
`VISION_SERVICE_TOKEN` in both processes. Main server uses
`VISION_SERVICE_URL=http://127.0.0.1:3002`. Run `pnpm start:vision` and the main
server independently, or `pnpm dev:desktop` for the existing supervised launcher.

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

## Browser integration boundary

The service is retained for the planned paired WebXR coach adapter. The tutor's
local camera lab is separate and does not call these routes. Read
[the inspection protocol](../../docs/visual-inspection.md) for lease, nonce,
freshness, approved-reference and stale-context requirements. A future browser
adapter must preserve these policies and map browser v3 context explicitly.

`pnpm check` runs API and two-process mock tests. Real image interpretation,
sensor freshness and simultaneous camera/mic/XR require separate live provider
and Quest evidence. No retired device-camera implementation is available in
this foundation.
