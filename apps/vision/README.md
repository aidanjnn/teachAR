# Dedicated visual interpretation backend

`@trail/vision` is a separate TypeScript/Fastify process, bound to loopback. The
main API is the only intended client. The scaffold implements authenticated
liveness, explicit non-readiness and a refusal for unimplemented inspections.
**No image parsing, model calls, mock verdicts or camera uploads are implemented.**

| Internal route | Current behavior |
| --- | --- |
| `GET /internal/v1/health` | 200 with protocol v1, mock provider and `imageInterpretation: false` |
| `GET /internal/v1/ready` | 503 with `ready: false`, `reason: not-implemented` |
| `POST /internal/v1/inspections` | 501 before body parsing; no image is stored or assessed |

Every route requires `Authorization: Bearer <VISION_SERVICE_TOKEN>`; missing or
wrong auth returns 401 before body parsing. The token must be 32–256 base64url
characters. Bind address is restricted to `127.0.0.1`. Live provider configuration
fails explicitly until implemented. Liveness must never be used as provider readiness.

`pnpm dev` starts this service, the main API and desktop viewer with an ephemeral
shared token if no token is configured. The token is passed in child environments
and never printed or saved. `pnpm dev:web` retains the old web/API-only workflow.
For independent terminals, set matching service tokens in the ignored root `.env`,
set `VISION_SERVICE_URL=http://127.0.0.1:3002` for the main API, build shared
packages, then use `pnpm --filter @trail/vision dev`. Keep the token out of client
configuration. `pnpm start:vision` runs the built service independently of
`pnpm start`; both load the root `.env`.

`GET /api/dependencies/vision` on the main API exposes only a bounded, validated
liveness summary. Its 1.5-second timeout, 8 KiB cap and rejection of redirects
prevent a bad service response from becoming an unbounded health request.
The main API and desktop remain usable when vision is unreachable.

Next: implement [TRAIL-20 and TRAIL-17](../../docs/plan.md#17-immediate-tickets-to-create):
versioned multipart image requests, shared inspection identities, decoding/limits,
Responses adapter, cancellation/deduplication, freshness/deadlines, and delivery
of accepted evidence through GPT Live. Only real camera-to-spoken-feedback trials
can satisfy visual acceptance. Provider credentials stay in this service.
