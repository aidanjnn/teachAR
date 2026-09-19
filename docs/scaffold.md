# Application scaffold status

The native/vision rescaffold below supersedes the original browser-XR direction.
Historical bootstrap validation remains recorded below.

This implements the software bootstrap from TRAIL-02 and the minimum schema,
fixture, and transform examples needed to exercise the package graph. It does
not finish the headset setup gate or the full TRAIL-03 contract freeze.

## Native setup and integration update (September 19, 2026)

The local pinned editor/Android toolchain is installed and activated. The merged
platform includes a resolved UPM lock, OpenXR/URP configuration, a rig bootstrap,
pairing client and real editor test/build wrappers. See [revision-specific setup
evidence](native-setup.md) and [installation directions](../README.md#install-dependencies-on-a-new-machine).
The sections below retain historical bootstrap evidence; they are not a current
inventory of every merged feature or proof of headset operation.

## Unity and vision rescaffold (September 19, 2026)

The repository now contains a Unity source project and a separate vision process.
This is foundational setup, not completion of TRAIL-17/18/20.

- `apps/quest`: candidate editor/UPM pins, stable asset GUIDs, an explicitly empty
  runtime scene, pure C# contracts/math boundaries, numeric reflection and
  EditMode test sources. Unity is not installed: package resolution, C# compile,
  scene import, native permissions and APK generation remain unverified. Follow
  [native setup](../apps/quest/README.md); no UPM lockfile has been fabricated.
- `apps/vision`: separate authenticated loopback Fastify skeleton. Health is live,
  readiness is 503 and inspections return 501 before image parsing. No provider
  or image-processing pipeline is implemented. See [service setup](../apps/vision/README.md).
- `apps/server`: existing health/static serving plus an authenticated, bounded
  internal vision health client and public non-secret dependency summary.
- `apps/web`: retained synthetic viewer; replaced browser-AR probing with explicit
  native-app status and vision dependency status. Native capture/progression do
  not belong to the browser.
- `pnpm dev`: starts both backend processes and the desktop with a per-launch
  internal token; `pnpm dev:web` preserves the smaller diagnostic workflow.
  Child service failures do not automatically terminate sibling services. Ctrl-C
  tears down the process group. `pnpm check` includes vision and static native
  structure; `pnpm quest:test` is a separate real-editor gate.

Recording schema v1 is unchanged. The new service health/readiness schema has
its own v1 envelope. Shared inspection request/results and C# recording parsing
remain pending. This scaffold does not claim speech, visual interpretation,
physical transfer or a working MR scene.

### Rescaffold verification

- Node 22.23.1 / pnpm 11.3.0: one user-approved `pnpm install` linked the new
  workspace using existing dependency versions; no third-party version upgrades.
- `pnpm check`: strict TypeScript, 39 unit/API tests and web/main/vision builds;
  static native checks cover 39 asset/folder GUIDs, candidate pins, pure assembly
  boundaries and the canonical 25-joint list. These are not C# compilation tests.
- Recording fixture validation: 61 frames, 2,000 ms, unchanged schema v1.
- All three Chromium Playwright scenarios pass against the built application.
- Development smoke on ports 3201/5273/3202: direct and proxied main API health,
  authenticated vision liveness, unauthenticated vision rejection, and explicit
  unavailable status after stopping vision while API/desktop remain alive.
  Existing processes on default ports were left untouched; smoke processes were
  shut down. The launcher now detects conflicts before starting child services.
- `pnpm quest:test` is blocked by the absent Unity editor and exits nonzero with
  an explicit message. No Unity installation, UPM resolution, C# compilation,
  APK build, provider request or headset test occurred.
- Vite retains the existing Three.js/fixture chunk-size warning (~758 kB minified).

## Entry points and ownership

| Location | Implemented entry point | Next work |
| --- | --- | --- |
| `packages/contracts/src/index.ts` | Recording, pose, named joints, health schemas | Coordinate tutorial/event schema freeze with all consumers |
| `packages/motion/src/index.ts` | `transformPose`, `invertTransform` | Calibration, segmentation, matcher, reducer |
| `apps/web/src/main.ts` | App composition and fixture controls | Mount live modules here |
| `apps/web/src/dashboard/shell.ts` | Desktop fixture screen | Authoring and spectator screens |
| `apps/web/src/replay/` | Validated fixture, actual-time sampling, Three.js diagnostic skeleton | Simulated learner and replay adapters |
| `apps/quest/Assets/Trail/` | Native source/assembly structure | Actual editor import, rig, hands, camera and voice |
| `apps/vision/src/` | Authenticated health and non-readiness | Bounded image interpretation pipeline |
| `apps/server/src/app.ts` | Injectable Fastify factory, health and static assets | Register route plugins here |
| `apps/server/src/config.ts` | Root-relative `.env`, mock-only configuration | Extend when live adapters and pairing exist |

Other planned module directories contain ownership notes instead of fake adapters.
The Vite app is scaffolded directly as vanilla TypeScript rather than retaining
the generator's counter/assets. Dependencies follow the plan's exact starting
pins; `gl-matrix` is 3.4.4 and `concurrently` is 9.2.1. Unused WebSocket, multipart,
OpenAI, and telemetry packages are deferred until their implementations exist.
The lockfile records the complete working dependency graph. pnpm's explicit
`esbuild` lifecycle permission is needed by `tsx`; no general script bypass is set.

## Original bootstrap configuration (historical)

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

## Original bootstrap validation (historical)

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
