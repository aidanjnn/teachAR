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

## What is included

- `/tutorial`: Create/Follow shell, one save position per tutorial, hand-motion capture/pause/resume, clean-save trimming, review, automatic device-local library, explicit import/export, workspace placement, paired holographic ghosts, live palm zones and learner-paced checkpoints.
- Pure motion, following, recording, camera-snapshot and narration modules plus adversarial tests. Missing/stale tracking must pause gates rather than create success.
- Optional reference photos/audio and an isolated assistance interface. These do not prove physical task completion.
- `/hands`: earlier path-following experiment; `/`, `/camera`, `/ar`: earlier plushie image-checking experiment. They remain regression references, **not the new product home**. See [legacy camera lab](LEGACY-CAMERA-LAB.md).
- [Tutorial architecture](TUTORIAL-FOUNDATION.md), [session evidence](SESSION-RESULTS.md), [UX notes](XR-UX-NOTES.md), [vision research](META-VISION-RESEARCH.md), [older Quest interface notes](QUEST-INTEGRATION.md), and an optional [offline detector spike](../model-spike/README.md).

Tutorials are stored in this browser origin's IndexedDB, not automatically synchronized to another device, port or Unity. Export/import is a recovery/transfer tool. Camera reference caches and the paid-attempt budget are private local runtime files. No personal recordings, images, audio, credentials, logs, model weights or environments are included in Git.

Before approving each recording, choose **Required hands: Left, Right or Both** to match the action. Tracking coverage never chooses the hands for you. Every required palm must be present throughout the retained clip, with sample gaps no longer than 200 ms; otherwise review identifies the gap for trimming or re-recording. A hand that is not part of the action can be explicitly excluded.

**Approve & save** stays pending until local storage succeeds. On failure the headset keeps the recording open, displays the error and offers **Retry local save**; retry approval afterward to finish the tutorial. For a stale-tab conflict, export your work and reload as instructed. Exit AR for the JSON export control before closing the page.

Existing v3 files with missing or automatic (`recorded`) hand selection remain importable, but their approval/completion is cleared for explicit hand review. Previously finished clips with required-hand gaps reopen as drafts too. Motion and media are preserved. This tightens readiness using the existing `guide_hands` values; it does not change the prototype JSON shape or native formats.

## Software regression suite

After the setup above, from the repository root:

```sh
pnpm exec playwright install chromium
cd experiments/quest-browser
sh test-all.sh
```

The suite runs Node and Python unit tests plus ten browser workflows. Browser tests start their own server on a free localhost port with temporary runtime data and disabled provider credentials, then stop it. They never reuse your live port 4321 server. Streams and provider responses are synthetic/mocked. `TRAIL_PYTHON=/absolute/path/to/python` can reuse an existing environment; `TRAIL_BROWSER_CHANNEL=chrome` can use installed Chrome instead of bundled Chromium.

Hosted CI runs this suite alongside the existing repository checks. Neither these tests nor `pnpm check` establish headset tracking accuracy or Unity readiness. The latest packaging result is in [the activity log](../../docs/codex-log.md).

## Optional paid camera lab

No API key is needed for recording or ghost guidance. If deliberately testing paid image checks, run `python3 configure-key.py` locally; it reads the key without echo and writes only `.secrets/openai.key`. Never put a key in browser code, recordings or a commit. The earlier checker supports explicit opt-in automatic checks, one in-flight request, bounded attempts, cooldowns and persistent reservations. The allowance display is a reservation estimate, **not provider billing**; inspect the verifier's model/pricing assumptions before increasing it. Tests do not call the provider.

## Native import boundary

`trail.tutorial.prototype.v3` is **not** the strict native recording/tutorial contract. Port behavior and tests first. Any future converter must explicitly validate and label browser provenance; do not invent native timestamps, calibration marks, hashes or camera metadata. Reviewed movements are not proof that a shirt was folded or a part seated correctly. See the checklist for the remaining native and physical acceptance gates.
