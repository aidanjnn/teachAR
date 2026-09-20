# Trail: runnable Quest Browser tutor

This is Trail's primary recording, review and learner runtime, promoted from the PR #17 → #23 → #24 stack. **Quest Browser / WebXR is the product foundation.**

Start with [web delivery status and next steps](../../docs/web-delivery.md), including the clean UI reference and remaining coach integration.

## Run from a fresh checkout

Use the repository's Node 22 / pnpm setup and Python 3.12+ with venv/pip. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The first start creates a Python virtual environment and installs `requirements.txt`. `prepare-vendor.mjs` copies the exact locked Three.js 0.186.0 artifacts and MIT license from the workspace, checking their hashes. No CDN or separate JavaScript install is needed.

Open **http://127.0.0.1:4321/tutorial**. Desktop can inspect the library/review UI; actual tracking/immersive sessions require the headset. Keep the server running. This is a loopback development server, not a production or authenticated multi-user service.

With Quest developer mode enabled, an authorized USB debugging connection and Android SDK `adb` on PATH, use another terminal:

```sh
pnpm quest:open
```

This runs `adb reverse tcp:4321 tcp:4321` and opens `http://localhost:4321/tutorial` in Quest Browser. Keep USB connected and the laptop awake. Close other camera-sender tabs before enabling the camera. Use **Create tutorial** or **Follow tutorial**, then the page's AR entry control. The tutorial hand loop does not require an API key or camera.

For another local port: `PORT=4331 pnpm dev` and `PORT=4331 pnpm quest:open`. Stop the foreground server with Ctrl-C. `start-background.py` is optional and records its PID in `.runtime/server.pid`; stop only that process when finished.

See [the connected UI/UX base](../../docs/web-ui-base.md) for appearance settings, recording/review controls, save feedback and the headset acceptance walkthrough. See [practice flow](../../docs/web-practice-flow.md) for preview/ready/practice phases and movement-only completion.

## What is included

- `/tutorial`: Create/Follow shell, one save position per tutorial, hand-motion capture/pause/resume, clean-save trimming, review, automatic device-local library, explicit import/export, workspace placement, paired holographic ghosts, live palm zones and learner-paced checkpoints.
- Connected charcoal/warm-gray UI, in-headset review/trim and durable-save feedback.
- Preview-first practice, broad start rings, relaxed ordered gates and automatic movement-only step transitions.
- Pure motion, following, recording, camera-snapshot and narration modules plus adversarial tests. Missing/stale tracking must pause gates rather than create success.
- Optional reference photos/audio and an isolated assistance interface. These do not prove physical task completion.
- `/hands`: earlier path-following experiment; `/lab`, `/camera`, `/ar`: earlier plushie image-checking experiment. They remain regression references, **not the new product home**. See [legacy camera lab](LEGACY-CAMERA-LAB.md).
- [Tutorial architecture](TUTORIAL-FOUNDATION.md), [session evidence](SESSION-RESULTS.md), [UX notes](XR-UX-NOTES.md), [vision research](META-VISION-RESEARCH.md), [older Quest interface notes](QUEST-INTEGRATION.md), and an optional [offline detector spike](../../experiments/model-spike/README.md).

Tutorials are stored in this browser origin's IndexedDB, not automatically synchronized to another device or origin. Export/import is a recovery/transfer tool. Camera reference caches and the paid-attempt budget are private local runtime files. No personal recordings, images, audio, credentials, logs, model weights or environments are included in Git.

## Software regression suite

After the setup above, from the repository root:

```sh
pnpm exec playwright install chromium
pnpm setup:webxr
pnpm test:webxr
```

The suite runs Node and Python unit tests plus ten browser workflows. Browser tests start their own server on a free localhost port with temporary runtime data and disabled provider credentials, then stop it. They never reuse your live port 4321 server. Streams and provider responses are synthetic/mocked. `TRAIL_PYTHON=/absolute/path/to/python` can reuse an existing environment; `TRAIL_BROWSER_CHANNEL=chrome` can use installed Chrome instead of bundled Chromium.

Hosted CI runs this suite alongside the existing repository checks. Neither these tests nor `pnpm check` establish headset tracking accuracy or physical task success. The latest packaging result is in [the activity log](../../docs/codex-log.md).

## Optional paid camera lab

No API key is needed for recording or ghost guidance. If deliberately testing paid image checks, run `python3 configure-key.py` locally; it reads the key without echo and writes only `.secrets/openai.key`. Never put a key in browser code, recordings or a commit. The earlier checker supports explicit opt-in automatic checks, one in-flight request, bounded attempts, cooldowns and persistent reservations. The allowance display is a reservation estimate, **not provider billing**; inspect the verifier's model/pricing assumptions before increasing it. Tests do not call the provider.

## Data compatibility

The existing `trail.tutorial.prototype.v3` format, import migrations and IndexedDB
names remain unchanged. `/tutorial` is stable and `/` also opens it. The earlier
image checker home is now `/lab`. Keep the same origin (including localhost versus
127.0.0.1 and the port) to retain a local library; the source-directory move does
not copy or erase browser data.

Browser tutorials are separate from the shared API's v1 recording/tutorial
contracts. Any future adapter must validate and label provenance without
inventing timestamps, calibration marks, hashes or camera metadata. Reviewed
movements are not proof that a shirt was folded or a part seated correctly.

`pnpm setup:webxr` prepares dependencies without starting a server. Set
`TRAIL_PYTHON=/path/to/python3.12` during setup to choose a Python interpreter;
test runs can use that variable for an existing environment with the requirements
installed. The server remains a loopback development service.
