# Trail: runnable Quest Browser tutor

This is the local prototype used to test Trail's recording, review and learner experience. **Quest Browser / WebXR is now the immediate demo runtime.** Native Unity work remains available separately.

Start with [web delivery status and next steps](../../docs/web-delivery.md), including the clean UI reference and remaining coach integration. The [source review](NATIVE-INTEGRATION-HANDOFF.md) explains what to reuse from native code and what is still missing.

## Run from a fresh checkout

Use the repository's Node 22 / pnpm setup and Python 3.12. From the repository root:

```sh
pnpm install --frozen-lockfile
cd experiments/quest-browser
sh start.sh
```

The first start creates a Python virtual environment and installs `requirements.txt`. `prepare-vendor.mjs` copies the exact locked Three.js 0.186.0 artifacts and MIT license from the workspace, checking their hashes. No CDN or separate JavaScript install is needed.

Open **http://127.0.0.1:4321/tutorial**. Desktop can inspect the library/review UI; actual tracking/immersive sessions require the headset. Keep the server running. This is a loopback development server, not a production or authenticated multi-user service.

With Quest developer mode enabled, an authorized USB debugging connection and Android SDK `adb` on PATH, use another terminal:

```sh
cd experiments/quest-browser
sh launch-ar.sh tutorial
```

This runs `adb reverse tcp:4321 tcp:4321` and opens `http://localhost:4321/tutorial` in Quest Browser. Keep USB connected and the laptop awake. Close other camera-sender tabs before enabling the camera. Use **Create tutorial** or **Follow tutorial**, then the page's AR entry control. The tutorial hand loop does not require an API key or camera.

For another local port: `PORT=4331 sh start.sh`, then `adb reverse tcp:4331 tcp:4331` and manually open `http://localhost:4331/tutorial`. The convenience launch script uses port 4321. Stop the foreground server with Ctrl-C. `start-background.py` is optional and records its PID in `.runtime/server.pid`; stop only that process when finished.

## Voice coach and narration drafting

The tutor page has a Voice coach card. It pairs this browser with the Trail API, publishes the
current tutorial's reviewed step titles and instructions as a coach guide, and starts the coach
before you enter AR so the entry click stays synchronous. Inside AR the practice panel gains
**Ask coach**; press it, speak, and the answer comes back over the coach's own audio. The coach
answers only from the published step text and never advances a step. On the review page,
**Draft titles from narration** sends each narrated step's WAV through the transcription and
label routes and shows drafts to apply.

Run the tutor from the API origin for this: from the repository root, `pnpm dev`, then
`adb reverse tcp:3001 tcp:3001` and open `http://localhost:3001/tutorial` in Quest Browser
(the API serves this folder's files and `/vendor/trail-coach.js`, built from `apps/web` by
`prepare-vendor.mjs`). With `ALLOW_USB_LOOPBACK=true` and `PAIRING_ORIGINS=http://localhost:3001`
the page asks for a pairing code; mint an author code from the desktop authoring page or use the
bootstrap code in `data/<dir>/pairing.json`. Without pairing the coach uses the steps in this
browser. Live voice needs `AI_PROVIDER=openai` on the server; the mock provider answers in text.
Microphone, WebRTC and an immersive session together on the Quest are not yet verified.

## What is included

- `/tutorial`: Create/Follow shell, one save position per tutorial, hand-motion capture/pause/resume, clean-save trimming, review, automatic device-local library, explicit import/export, workspace placement, paired holographic ghosts, live palm zones and learner-paced checkpoints.
- Pure motion, following, recording, camera-snapshot and narration modules plus adversarial tests. Missing/stale tracking must pause gates rather than create success.
- Optional reference photos/audio and an isolated assistance interface. These do not prove physical task completion.
- `/hands`: earlier path-following experiment; `/`, `/camera`, `/ar`: earlier plushie image-checking experiment. They remain regression references, **not the new product home**. See [legacy camera lab](LEGACY-CAMERA-LAB.md).
- [Tutorial architecture](TUTORIAL-FOUNDATION.md), [session evidence](SESSION-RESULTS.md), [UX notes](XR-UX-NOTES.md), [vision research](META-VISION-RESEARCH.md), [older Quest interface notes](QUEST-INTEGRATION.md), and an optional [offline detector spike](../model-spike/README.md).

Tutorials are stored in this browser origin's IndexedDB, not automatically synchronized to another device, port or Unity. Export/import is a recovery/transfer tool. Camera reference caches and the paid-attempt budget are private local runtime files. No personal recordings, images, audio, credentials, logs, model weights or environments are included in Git.

## Software regression suite

After the setup above, from the repository root:

```sh
pnpm exec playwright install chromium
cd experiments/quest-browser
sh test-all.sh
```

The suite runs Node and Python unit tests plus nine browser workflows. Browser tests start their own server on a free localhost port with temporary runtime data and disabled provider credentials, then stop it. They never reuse your live port 4321 server. Streams and provider responses are synthetic/mocked. `TRAIL_PYTHON=/absolute/path/to/python` can reuse an existing environment; `TRAIL_BROWSER_CHANNEL=chrome` can use installed Chrome instead of bundled Chromium.

Hosted CI runs this suite alongside the existing repository checks. Neither these tests nor `pnpm check` establish headset tracking accuracy or Unity readiness. The latest packaging result is in [the activity log](../../docs/codex-log.md).

## Optional paid camera lab

No API key is needed for recording or ghost guidance. If deliberately testing paid image checks, run `python3 configure-key.py` locally; it reads the key without echo and writes only `.secrets/openai.key`. Never put a key in browser code, recordings or a commit. The earlier checker supports explicit opt-in automatic checks, one in-flight request, bounded attempts, cooldowns and persistent reservations. The allowance display is a reservation estimate, **not provider billing**; inspect the verifier's model/pricing assumptions before increasing it. Tests do not call the provider.

## Native import boundary

`trail.tutorial.prototype.v3` is **not** the strict native recording/tutorial contract. Port behavior and tests first. Any future converter must explicitly validate and label browser provenance; do not invent native timestamps, calibration marks, hashes or camera metadata. Reviewed movements are not proof that a shirt was folded or a part seated correctly. See the checklist for the remaining native and physical acceptance gates.
