> Historical camera/path laboratory notes. Some later entries describe earlier tutorial iterations (including cloth-specific wording and self-confirmed progression). For the current generic Create/Follow experience, setup and test commands, use [README.md](README.md) and the [Unity checklist](../../docs/ux-unity-handoff.md).

> **Current tutorial experience:** Open `/tutorial` for Create / Follow, a local library, movable workspace placement, and guided ghost hands. See [TUTORIAL-FOUNDATION.md](TUTORIAL-FOUNDATION.md) for the current headset test. The plushie checker documented below is a separate experiment.

# Plushie tester — free local object and destination matching

Target: **goose at A, fox at B, square at C**. Quest Browser sends camera JPEGs
to this laptop. OpenCV recognizes details from each plushie independently, then
uses stationary tissue features to determine which destination it occupies.
The default checker needs no paid API, cloud upload, model download, Unity, or extra camera. An optional AI checker is now available (see below).

## Start

```sh
cd experiments/quest-browser
sh start.sh
```

Open **http://127.0.0.1:4321/** on the laptop. Dependencies are installed in
`.venv`; `start.sh` installs requirements only if that environment is missing.
In another terminal, connect Quest by USB and run:

```sh
sh connect-quest.sh
```

This runs `adb reverse tcp:4321 tcp:4321`. In **Quest Browser**, open
**http://localhost:4321/camera**, enable the outward-facing camera, and keep
that page visible. On the laptop, select **Quest headset** as the source.
A camera page opened on the laptop uses the laptop camera instead. Source
filtering prevents that sender from replacing the selected Quest feed.

## Use it

1. Put goose behind tissue A, fox behind B, square behind C. Keep tissues flat,
   stationary, close to their toys, fully visible, and separated. Use good lighting.
2. Save the correct arrangement. Mark tight boxes around the whole goose, fox,
   and square, in that order. Exclude tissues from the toy boxes.
3. Click **Use these three boxes**. The dashed boxes automatically cover the
   area immediately below each toy. They must contain the corresponding tissues.
   If they do not, reposition the tissues close to the toys and recapture.
4. Click **Check arrangement**. A frozen checked snapshot shows recognized toys
   in green and tissue destinations in blue. It is separate from the live feed.
5. Swap two toys **without moving tissues**. Clear your hands, check, and verify
   that it names the wrong placements. Restore the toys and check again.
6. Try small head movements. Enable checks every 1.5 seconds once manual checks
   work. The checker page must remain visible for automatic checks.

The labels stay in the full reference image, outside the toy boxes. The code
learns their visual features; it does **not** read letters with OCR. Names A/B/C
come from the order in which you marked the reference toys.

## What changed and what it can promise

The original checker aligned the entire scene and compared fixed image patches.
Head motion, perspective, and clutter changes often made that fail. This version
locates each toy and tissue independently with SIFT features and RANSAC, estimates
workspace perspective using only tissue matches, and assigns recognized toys to
nearby reference destinations. Toy movement cannot define the workspace transform.
It checks independent feature support, geometry, separation, and unique assignments.

**It does not work from every camera view.** One reference cannot teach the unseen
back of a toy. Occlusion, blur, weak texture, major lighting changes, steep angles,
large 3D parallax, deformation, or similar-looking details may yield uncertainty
or incorrect recognition. It is a controlled demo, not a measured accuracy claim.
It verifies coarse placement behind these tissues, not physical contact or precise
assembly. Turning the toys to face a new direction can require a new reference.

- **Matches:** all three identities and destination associations have visual support.
- **Wrong placement:** all identities were found, but one or more occupy wrong slots.
- **Uncertain:** missing/weak/ambiguous object or tissue evidence, or unsupported geometry.
- **Could not check:** stale frames, incomplete setup, or an outdated request.

No checker should advance a later tutorial on `unknown`. A future step engine
should require stable agreement across fresh observations; this tester does not
advance tutorial steps or generate ghost hands.

For broader viewpoints later: collect several labeled reference views of each toy,
use reliably detectable printed destination markers, and evaluate a local learned
object matcher on your own captured data. A larger language model alone would not
supply dependable 3D registration or make hidden objects observable.

## Validation

Run:

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Automated tests cover all six synthetic arrangements under perspective change,
missing/covered/duplicate toys, covered/moved tissues, changed background, resized
frames, stale results, setup invalidation, and HTTP/source handling. These are
software tests, not Quest accuracy measurements.

During development, the unchanged arrangement in the user's previously rejected
Quest screenshot passed with individually located objects and tissues (about
0.1 seconds per check on this laptop in that replay). Digitally swapping the
reference crops produced the expected mismatch for all five wrong permutations.
Those edited images are simulations, not physical swap trials. A live test with
real swaps and head movements remains necessary.

## Integration points

- `public/camera.js`: browser `getUserMedia`, JPEGs up to 960 px every ~600 ms.
- `POST /api/frame`: `{image: base64Jpeg, source: "camera"}`. Quest is identified
  by browser User-Agent for this local demo; this is not device authentication.
- `POST /api/reference`: `{}` saves the latest fresh frame.
- `POST /api/boxes`: `{boxes: [[x,y,w,h], ...], revision}` in reference pixels,
  ordered goose/A, fox/B, square/C.
- `POST /api/check`: `{}` returns `pass|fail|unknown`, per-slot identities,
  detected polygons, reference revision, frame ID, frame age, and `snapshot`
  (base64 JPEG of the exact checked frame with detections).
- `vision.py`: `verify(reference, current, boxes)` is the replaceable verifier.
  `label_boxes` defines automatic tissue regions. `NAMES`/`SLOTS` define identities.
- `GET /api/log`: last 300 events, no images. Results describe captured frames,
  never the continuously changing live scene. Inputs/results older than 3 seconds
  and results for changed references are rejected.

State is in memory. For explicit recovery during a development restart,
`RESTORE_REFERENCE_DIR=/absolute/path sh start.sh` loads `reference.jpg` and
`state.json` containing `boxes` and optional `selected_source` from that directory.
It never restores an old camera frame as fresh evidence. No automatic photo
persistence is enabled. Changing camera source clears the reference.

For desktop testing select **Uploaded test images** (or **Laptop / other browser**).
Uploads count as fresh for three seconds: upload/save a reference promptly, mark
boxes, then upload the test image to check. Source switching invalidates setup.

References: [OpenCV feature matching and homography](https://docs.opencv.org/4.x/d1/de0/tutorial_py_feature_homography.html),
[Meta browser camera access](https://developers.meta.com/horizon/documentation/iwsdk/guides/13-camera-access/).

## Optional paid AI checker

The **Check with AI · paid** button sends two bounded JPEGs (identity-only reference sheet
and current image) to OpenAI's Responses API using `gpt-5.4-mini`. It does not send continuous video. The automatic 1.5-second local checkbox still uses only local vision. The separate paid Auto AI toggle is described below.
The supplied key has been configured on the server; it is never sent to the browser.

For a fresh install or key rotation, run:

```sh
.venv/bin/python configure-key.py
```

Paste the key at the hidden terminal prompt. It is saved in `.secrets/openai.key`
with owner-only permissions. `.secrets/`, `.runtime/`, and `.env*` are ignored by
Git. Environment variable `OPENAI_API_KEY` takes precedence; `OPENAI_API_KEY_FILE`
can point to another private file. Never put a key in Quest/client JavaScript.
Rotate the key shared in chat when testing ends. Do not distribute private folders
when copying this project or creating an archive.

Limits enforced on the server:

- One pending API call at a time, no queue, at least 10 seconds between starts.
- 100 attempts across restarts, reserving $0.02 each from a $2 app allowance.
- Reservations are never refunded, including errors/timeouts/crashes. The
  SQLite ledger is `.runtime/ai-budget.sqlite3`; do not delete it to restart.
- Fixed model, two images up to 960 px, fixed prompt, 700 maximum output tokens,
  no tools, no automatic retry, 20-second network timeout.
- Exact duplicate reference/current pairs are rejected without another call.
- Authentication, permission, and 429 responses pause AI. Other transport errors
  cause a 60-second cooldown. Reconfigure the key to clear an auth/quota pause;
  that preserves the attempt counter and spending allowance.
- Same-origin JSON, loopback Host validation, per-process request token, no
  redirects. This is a local tool, not an authenticated public service.

The $2 allowance is conservative request accounting under the documented rates,
not an OpenAI account-wide billing limit. Actual estimates use returned token
usage at $0.75/M input and $4.50/M output, without cache discounts. Other apps
using the key are outside this limit. Unknown charges after timeouts remain
reserved. Rate/pricing changes need review before increasing the fixed cap.

`store:false` is sent. That disables stored Responses state, not necessarily all
provider retention. This option sends images to OpenAI; the local checker does not.

AI's structured output reports A/B/C occupants, visibility, and short evidence.
Local code determines pass/fail/unknown. Refusals, malformed/incomplete results,
ambiguous identities, and blocked views cannot pass. Results older than 12 seconds
are marked historical/unknown. Reference changes discard the result even though
the already-issued request can still cost money. New frames do not retroactively
make a snapshot current. **No automatic tutorial advancement is enabled.**

`GET /api/ai/status` exposes only limits, usage estimates, availability, and a
local request token. `POST /api/ai/check` needs that token as `X-Tester-Token`.
Logs exclude images and credentials. The returned AI snapshot has no detection
boxes; unlike local SIFT, this verifier does not provide spatial coordinates.

See [Quest integration and remaining work](QUEST-INTEGRATION.md) for the recording,
workspace calibration, ghost renderer, and step-controller interfaces.

Official API references: [image inputs](https://developers.openai.com/api/docs/guides/images-vision),
[structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[model pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini).


API smoke-test finding: showing a full correct reference beside a digitally
swapped current image produced a false pass. The prompt now receives isolated toy
identity crops without target positions. That revised prompt correctly identified
the simulated swap. Any pass/fail disagreement with local vision is downgraded to
unknown. This is evidence of a corrected test case, not proof of general accuracy.


## Automatic AI checks and Quest countdown

Refresh both the laptop checker and Quest `/camera` page after this update. On
Quest, enable the camera again if refreshing stopped it. The new **Auto AI · paid
every 10 seconds** toggle is available on both pages. Either controls the same
server-owned scheduler; opening extra tabs does not create extra requests.

- Default OFF on server restart. Enabling starts a 10-second countdown.
- Aim for one request every 10 seconds, subject to cooldown, a fresh frame, API
  availability, and an idle verifier. Slow requests never generate catch-up bursts.
- The Quest page shows countdown, checking state, total paid-attempt counter,
  reserved allowance, and the latest AI correction/result with its age.
- The laptop has the same live status panel. Automatic results appear there;
  they do not replace the separate manually checked snapshot panel.
- No fresh frame means no scheduled API call. After 30 seconds without usable
  frames/setup, automatic mode turns OFF and must be explicitly enabled again.
- Changing source/reference/boxes, an API error, or exhausting the allowance
  turns automatic mode OFF. Turning it off prevents future requests; an already
  dispatched request may complete and be billed. Manual paid checks still work.
- The paid auto toggle does not enable free local auto-checking, and neither
  performs automatic tutorial advancement.

`POST /api/ai/auto` accepts `{ "enabled": true|false }` with `X-Tester-Token`.
`GET /api/ai/status` includes `automatic`, `ready`, and the latest compact AI
result. The monitor polls status only; status requests never spend API credits.
The scheduler shares the persistent 100-attempt / $2 reserved allowance with
manual checks. Test suite: 48 tests, including fake-clock scheduler tests; no
paid API calls are required to run tests.

## Keep the server running in the background

After dependencies are installed, this launcher keeps the server independent of
the terminal/tool session and checks that it responds before reporting success:

```sh
.venv/bin/python start-background.py
```

It does not start a second instance if the tester already responds on port 4321.
The PID is saved in `.runtime/server.pid` and server output in `.runtime/server.log`.
The same `RESTORE_REFERENCE_DIR` option works for explicit reference recovery.
Automatic AI starts OFF; the existing spending ledger is preserved.

## Headset-first AR swap test

Run from this directory with the Quest plugged in and USB debugging allowed:

```sh
sh launch-ar.sh
```

This starts the background server if needed, reconnects USB port forwarding,
then opens **http://localhost:4321/ar in Quest Browser**. Leave the laptop awake
and USB connected. Close the older `/camera` sender tab so this page owns capture.
No npm install, Unity, printed markers, or CDN connection is required. Three.js
0.186.0 (matching Trail) and its MIT license are vendored under `public/vendor`.

On the Quest:

1. Click **Enable camera**. Confirm its preview shows the table, not an avatar.
2. Click **Enter AR · start paid checks every 10s**. Grant immersive permission.
3. Start with **goose at A, fox at B, square at C**. Keep all labels visible;
   clear your hands and wait for a matching snapshot.
4. Follow the panel/audio: **swap fox and square**, leaving the tissues alone.
   Wait for the wrong-placement correction.
5. Restore **fox to B and square to C**. Wait for the matching snapshot. The
   observed three-stage test ends and **paid automatic checks pause**.

The high-contrast panel is rendered in each XR eye, positioned in the upper view
and following head orientation. This is an immersive feedback HUD, not spatially
registered rings, object tracking, or ghost hands. It intentionally leaves the
lower view open for the task. Controller rays are visible: point and press the
trigger, or use the runtime's hand pointing/pinch selection if available. No
clicks are needed during automatic checks. Optional browser speech reads new
corrections; the visual panel remains the primary output.

AR buttons:

- **Check in 3s** pauses periodic checks, gives you time to clear your hands,
  then requests one paid check. It preserves the existing cooldown and caps.
- **Pause / Resume checks** controls the single shared server scheduler.
- **Exit AR** leaves immersive mode and pauses future paid requests. The Quest
  system exit does the same. An already-started request may finish.

Leaving/hiding the page also pauses checks. If a close notification cannot
reach the server, it refuses stale frames and shuts auto off after 30 seconds
without usable frames. Camera loss and server loss replace pass/fail feedback
with a neutral warning. Results expire after 12 seconds; displayed ages use the
server's age plus browser elapsed time, avoiding device clock mismatch.

A green result describes the captured snapshot, not a guarantee about motions
since it was taken. With a 10-second schedule, a new mistake may take up to that
interval plus provider response time to appear. Rate limits remain 100 attempts,
$2 conservative reserved allowance, one in-flight request, and a 10-second
minimum interval. No automatic API retry was added.

Reference setup is available in the headset page's **Reference setup** section if
needed. Existing saved identities are reused. Saving all three boxes caches the
reference privately in `.runtime/reference-cache.json`; restart restores setup,
never a camera frame as live evidence, and never enables auto checks by itself.
New capture/source selection invalidates the old saved setup. `.runtime` must
remain excluded from Git because it contains local camera reference data.

If AR permission fails, the page remains usable with a large browser feedback
preview. If camera streaming stops specifically during immersive entry, the app
exits with an error and does not enable paid checks. Capture/XR coexistence,
stereo legibility, hand/controller selection, and speech must be verified on the
actual Quest. Desktop tests cannot validate those hardware behaviors.

Verification (no paid requests):

```sh
.venv/bin/python -m unittest discover -s tests -q
node --test tests/ar-state.test.mjs
# With Playwright available and Chrome installed:
node tests/browser-ar.cjs
```

For a bundled Playwright installation, set `PLAYWRIGHT_MODULE` to its absolute
module directory. `PLAYWRIGHT_CHANNEL` defaults to `chrome`. The browser test
uses a synthetic camera, intercepts every API request, exercises the swap/restore
sequence and XR entry failure, and does not simulate successful Quest hardware.

## Ghost hand and local movement correction

Open **http://localhost:4321/hands on Quest**, or run `sh launch-ar.sh hands`.
This mode never enables periodic AI checks. Recording and correction run locally.
Put down the controllers and use hand tracking. RIGHT is the default recording
hand; use the LEFT hand to point and pinch the controls. Switch hands before
marking the workspace if preferred.

1. Leave goose at A and square at C. Start the fox in an empty spot 25–50 cm from
   B. Enable the camera before entering AR only if you want a final image check.
2. Choose **Enter hand guidance · free**, at the top of the page.
3. Choose **Mark START · 4s**, then hold your selected index fingertip still at
   the start spot on the table. Choose **Mark END · 4s** and do the same at B.
   Rings show the registered positions. Confirm they remain in the right spots
   while you move your head. Clear/re-mark if they do not.
4. Put the selected hand at the fox and choose **Start recording** with your
   other hand. Recording starts immediately. Move the fox to B and choose
   **Finish recording** whenever you are done. **Pause recording** stops capture;
   **Resume recording** continues after you return to the paused ghost wrist.
   Paused time is excluded from replay. There is no ten-second auto-stop.
5. After **Recording saved**, reset the fox. **Watch ghost** loops the recorded
   skeleton. **Follow / restart · 4s** starts guidance. Match the first ghost
   wrist and hold for half a second, then follow at your own pace.
6. Move your hand sideways by about 15–20 cm: expect a red ghost, correction
   arrow and warning. Return to the current ghost and expect the warning to
   clear. Tracking loss shows amber and holds progress, not a movement error.
7. Finish the path and hold at the endpoint. **Hand path finished** establishes
   only completion of the wrist path. If camera is enabled, **Check image ·
   paid** separately checks the final arrangement after a three-second delay.
   Its target remains goose A, fox B, square C.

Pause, restart, clear workspace and exit are available in AR. A new XR session
or reference-space reset clears calibration. Moving the physical table also
requires manually clearing/re-marking it. Exiting preserves the last recording
for **Download last recording + log**, but never silently reuses its coordinates.
Reloading loses the in-memory recording unless downloaded.

Implementation / starting thresholds (not measured accuracy):

- Named 25-joint positions, orientations, radii and missing values, roughly
  30 Hz, in meters in a gravity-aligned workspace. XR timestamps are relative
  to recording start. Two points define horizontal direction.
- Markers average the final 400 ms of fingertip samples, reject unstable poses,
  and require points 20–120 cm apart with at most 12 cm height difference.
- Scoring requires wrist and index/middle metacarpals. Recordings below 80%
  tracked coverage, with a gap over 400 ms, or under 15 cm net travel are rejected.
- Ordered checkpoints roughly every 3 cm; wrist tolerance 4.5 cm, start/end
  dwell 500 ms, intermediate dwell 80 ms. Amber beyond 6 cm; red beyond 10 cm
  from the current segment. Jumping to a later segment cannot skip progress.
- Motion computation and geometry update on XR frames; HUD updates at most
  20 Hz. No API calls drive the ghost or local correction.
- Finger poses are replayed, not graded. This does not establish correct grip,
  object identity, force or assembly. Image verification remains separate.

Additional tests (no paid calls):

```sh
node --test tests/motion-core.test.mjs tests/ar-state.test.mjs
node tests/browser-hands.cjs
```

The browser test needs Playwright and Chrome, as described above. It injects
synthetic joint data through the real workspace, recorder, renderer and follower,
covering deviation, loss, recovery, completion, late image rejection and session
invalidation. It does not validate Quest occlusion, real latency, drift or grip.

Recording control update: recordings are manually started/finished and can be paused/resumed. Hiding the XR session pauses an in-progress recording. Resume requires the wrist within 6 cm of the last recorded pose, avoiding a fabricated jump. The 18,000-sample memory limit pauses capture without auto-saving.
# New: two-hand, multi-step tutorial recorder

Run `sh launch-ar.sh tutorial` for the shirt/napkin foundation. Record both hands per step, review/re-record, optionally mark a fold line with your fingertip, save local reference photos, and replay at the learner's pace. Saved steps persist on the headset. The laptop review workbench adds trimming, instruction editing, import/export, and a labelled synthetic test. Learning requires reviewed steps. This mode uses no paid image checks and labels advancement as learner self-confirmation. See [TUTORIAL-FOUNDATION.md](TUTORIAL-FOUNDATION.md) for the test sequence and limits, [NATIVE-INTEGRATION-HANDOFF.md](NATIVE-INTEGRATION-HANDOFF.md) for GitHub alignment, and [META-VISION-RESEARCH.md](META-VISION-RESEARCH.md) for measured local-model findings.

Authoring update: optional local narration now records with each step and follows ghost pause/replay/speed. The editor trims audio and motion together and can reorder steps. Add starting-layout instructions, review every step, then choose **Finish tutorial** before learning. Changes reopen a draft. Existing v1/v2 recordings migrate; they need finishing again. No transcription, automatic segmentation, or physical-result verification is implied. Run `sh test-all.sh` for the full software suite.
