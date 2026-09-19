# Initial application scaffold

This implements the software bootstrap from TRAIL-02 and the minimum schema,
fixture, and transform examples needed to exercise the package graph. It does
not finish the headset setup gate or the full TRAIL-03 contract freeze.

## Entry points and ownership

| Location | Implemented entry point | Next work |
| --- | --- | --- |
| `packages/contracts/src/index.ts` | Recording, pose, named joints, health schemas | Coordinate tutorial/event schema freeze with all consumers |
| `packages/motion/src/index.ts` | `transformPose`, `invertTransform` | Calibration, segmentation, matcher, reducer |
| `apps/web/src/main.ts` | App composition and fixture controls | Mount live modules here |
| `apps/web/src/dashboard/shell.ts` | Desktop fixture screen | Authoring and spectator screens |
| `apps/web/src/replay/` | Validated fixture, actual-time sampling, Three.js diagnostic skeleton | Simulated learner and replay adapters |
| `apps/web/src/xr/diagnostics.ts` | Read-only AR-support query | Session lifecycle and live hands |
| `apps/server/src/app.ts` | Injectable Fastify factory, health and static assets | Register route plugins here |
| `apps/server/src/config.ts` | Root-relative `.env`, mock-only configuration | Extend when live adapters and pairing exist |

Other planned module directories contain ownership notes instead of fake adapters.
The Vite app is scaffolded directly as vanilla TypeScript rather than retaining
the generator's counter/assets. Dependencies follow the plan's exact starting
pins; `gl-matrix` is 3.4.4 and `concurrently` is 9.2.1. Unused WebSocket, multipart,
OpenAI, and telemetry packages are deferred until their implementations exist.
The lockfile records the complete working dependency graph. pnpm's explicit
`esbuild` lifecycle permission is needed by `tsx`; no general script bypass is set.

## Local configuration

The health API is `GET /api/health` (the voice routes are described in
`apps/server/src/routes/README.md`); every health request performs a temporary-file write
probe under `DATA_DIR` and reports `ok`/200 or `degraded`/503. Build identification
defaults to `development-uncommitted`; set `BUILD_ID` to an actual tested revision
when producing a release. No known-good commit is fabricated by this scaffold.

`pnpm start` requires a web build and serves it with the API from the same origin.
Development uses fixed Vite/API ports 5173/3001; built browser tests use 3101 and
their own ignored `data/e2e` directory. The test server never reuses another
process. Shared packages build before consumer startup; root development watches
shared output as well as both apps. Root environment loading uses Node's native
[`loadEnvFile`](https://nodejs.org/docs/latest-v22.x/api/process.html#processloadenvfilepath).

No live-provider calls, recording uploads, WebSocket messages, headset capture,
learner completion, or hardware output exist. Mock flags describe disabled/live
integration selection, not completed mock processing. Loaded fixture replay can
continue if the API fails; this does not establish the future offline-guide gate.

## Validation

Results and remaining gates are recorded below for the uncommitted scaffold,
not attributed to the base commit or a headset-validated release.

- Automated (2026-09-19, Node 22.23.1 / pnpm 11.3.0): a temporary clean source
  copy installed with `pnpm install --offline --frozen-lockfile`; `pnpm check`
  passed strict typechecking, all 27 unit/API checks, and production builds.
  `pnpm validate:fixtures` passed (61 frames, 2,000 ms). The clean copy contained
  no existing `node_modules`, builds, `.env`, or runtime data and was removed
  afterward. The initial network install also succeeded with the exact pins.
- Desktop fixture: all three Playwright Chromium checks passed against the built
  app in that clean copy: play/pause/reset and tracking loss, API failure/recovery,
  and narrow-screen keyboard scrubbing. Development startup/proxy and shared
  watchers also ran successfully. Screenshots at 1440 × 1000 and 390 × 844 were
  visually inspected in Chromium 153.0.8010.12.
- Build warning: Vite reports a 757.33 kB minified / 174.07 kB gzip client chunk
  containing Three.js and the bundled diagnostic fixture. This does not fail
  the build; assess loading/rendering on hardware before the device setup gate.
- CI: configured to run the same gates, but no remote CI run has occurred.
- Live providers: not tested; adapters are not implemented.
- Headset/human: not tested; AR entry and physical transfer are not implemented.

Implementation references: [Vite proxy](https://vite.dev/config/server-options#server-proxy),
[Fastify static serving](https://github.com/fastify/fastify-static), and
[Playwright managed server](https://playwright.dev/docs/test-webserver).
