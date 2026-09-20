# Trail

Trail records a physical demonstration and replays workspace-relative hand motion
so a learner can follow at their own pace. **Quest Browser / WebXR is the product
runtime**, based on [PR #17](https://github.com/aidanjnn/trail/pull/17),
[PR #23](https://github.com/aidanjnn/trail/pull/23) and
[PR #24](https://github.com/aidanjnn/trail/pull/24).
The tutor lives in [`apps/webxr`](apps/webxr/README.md).

The Unity project, C# implementation, editor/APK tooling and native test harnesses
have been retired. Their history remains in Git and [the activity log](docs/codex-log.md).

## Start the WebXR tutor

The launchers support **macOS and Linux** and require a POSIX shell (`sh`).
Native Windows startup is not supported. Use Node **22.23.1**
([.node-version](.node-version)), pnpm **11.3.0**, and Python **3.12+** with
`venv` and `pip`. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:4321/tutorial**. `/` also opens the tutor. The first launch
creates `apps/webxr/.venv`, installs the Python requirements and prepares the exact
locked Three.js assets with hash/license checks. No API key is needed for hand
recording, review or ghost guidance. Stop the foreground server with Ctrl-C.

With Quest developer mode and authorized USB debugging enabled, put Android SDK
Platform Tools `adb` on PATH, keep USB connected, and run in another terminal:

```sh
pnpm quest:open
```

This opens **http://localhost:4321/tutorial** in Quest Browser through `adb reverse`.
Select **Create tutorial** or **Follow tutorial**, then enter AR. Desktop browsers
can inspect the library/review flow; immersive tracking requires the headset.
Use `PORT=4331 pnpm dev` and `PORT=4331 pnpm quest:open` for an alternate port.
An existing server owned by another checkout is never silently reused.

The current Python server is a single-user loopback development tool. Remote
hosting needs HTTPS and an explicit authentication/deployment design. Tutorial
libraries stay in that browser origin's IndexedDB. Keep the same device, hostname
and port to keep using an existing library; export/import explicitly when changing
origins. Moving source directories does not migrate or erase browser storage.

## What is included

- Create/Follow workflow, tracked-hand capture, pause/resume and a persistent save position.
- Review/trim/approval, local library, import/export and optional local narration/photos.
- Connected charcoal/warm-gray UI, in-headset trimming and durable-save feedback.
- Rigid placement, translucent ghosts, demonstration previews and relaxed ordered practice gates.
- Automatic next-step previews, pause/repeat/watch and tracking/focus-loss recovery.
- Movement-only completion; physical correctness remains explicitly unverified.
- Separate camera/path experiments at `/lab`, `/camera`, `/ar` and `/hands`.

The [connected UI base](docs/web-ui-base.md) and [practice flow](docs/web-practice-flow.md)
describe the current implementation. The separate [design preview](docs/design/trail-ui/README.md)
remains simulated. Voice Lab/backend adapters still need an explicit tutor context
adapter; see [the delivery inventory](docs/web-delivery.md).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm dev:xr` / `pnpm start` | Start the WebXR tutor on port 4321 |
| `pnpm setup:webxr` | Prepare Three.js and Python dependencies without starting a server |
| `pnpm quest:open` | Start/reuse this checkout's tutor server and open it on a USB-connected Quest |
| `pnpm dev:desktop` | Start desktop diagnostics, main API, vision and shared watchers |
| `pnpm dev:web` | Start desktop/main API and shared watchers without vision |
| `pnpm build` | Build shared packages, desktop/backend services and WebXR vendor assets |
| `pnpm check` | Typechecks, workspace unit/API tests and builds |
| `pnpm validate:fixtures` | Validate the shared recording fixtures |
| `pnpm test:e2e` | Seven desktop Chromium workflows against the built backend |
| `pnpm test:webxr` | Node, Python and isolated synthetic WebXR browser regressions |
| `pnpm start:server` / `pnpm start:vision` | Start the built main API / vision service |

`pnpm build` prepares the WebXR static dependencies; Python serves the app directly.
It does not produce a public deployment bundle or start a server.

## Desktop/backend integration

`pnpm dev:desktop` opens the separate desktop app at `http://127.0.0.1:5173`,
with main API on port 3001 and vision on port 3002. It includes recording authoring,
synthetic replay/spectator tools and `/voice-lab.html`. Optional configuration is
in [.env.example](.env.example); defaults use mocks with no credentials.
For isolated ports use `PORT=3201 DEV_WEB_PORT=5273 VISION_PORT=3202 pnpm dev:desktop`.

Provider secrets stay on the server. See [AI notes](apps/server/src/ai/README.md),
[pairing](docs/pairing.md), [storage](docs/authoring-storage.md) and
[vision service setup](apps/vision/README.md). The main API's v1 recording/tutorial
format and the WebXR tutor's `trail.tutorial.prototype.v3` are different;
future integration needs an explicit validated adapter.

## Repository map

| Location | Responsibility |
| --- | --- |
| `apps/webxr/` | Primary headset tutor, local development server and regression suite |
| `apps/web/` | Desktop review, diagnostics, spectator and Voice Lab |
| `apps/server/` | Authenticated API, storage, relay and provider coordination |
| `apps/vision/` | Dedicated visual interpretation service |
| `packages/contracts/`, `packages/motion/` | Shared API schemas, import compatibility and pure math |
| `fixtures/`, `tests/e2e/` | Synthetic shared-contract and desktop scenarios |
| `docs/` | Current plan, design, runbooks and historical activity log |

## Verification

```sh
pnpm setup:webxr
pnpm exec playwright install chromium
pnpm check
pnpm validate:fixtures
pnpm test:e2e
pnpm test:webxr
```

See [CI](docs/ci.md) and [validation routes](.agents/references/validation.md).
These checks establish software and synthetic-browser evidence. Real hand tracking,
simultaneous camera/mic/XR, provider behavior and physical transfer need separate
[headset acceptance](docs/device-check.md).

The headset browser alone controls local progression. AI is advisory. Say
“Movement checkpoint reached”; matching a palm does not verify grip, contact,
assembly or hidden properties. Keep credentials, personal recordings, camera
frames and raw narration out of Git. Read [AGENTS.md](AGENTS.md) before contributing.
