# End-to-end Quest rehearsal

This checklist is not acceptance evidence. No Quest or wearer was available for
this follow-through. Use the exact APK and server source revision recorded with
that build. Keep private audio, images, pairing files and provider credentials
outside Git. Synthetic/mock transcripts cannot establish semantic acceptance.

## Prepare

Use Quest 3S, the pinned Unity editor/UPM packages, a laptop running Node 22 and
pnpm 11.3.0, a marked mat with A/B/C calibration marks and independent D check mark,
large lightweight bottle/LEGO-style parts, and a second person. Keep physical part
sizes and starting layout consistent within each tutorial. Use a private data
folder for this branch. Stop the prior demo server before changing branches.

From the checked-out source revision:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm validate:fixtures
pnpm quest:test
pnpm quest:test:play
pnpm quest:build
# Run browser checks after Unity exits to avoid microphone-device contention.
pnpm exec playwright test --workers=1
```

Builds are in `artifacts/quest/build-*/Trail.apk` with `build.json` and `unity.log`.
Select one exact path, record its SHA-256 and source commit, and install that file
with `adb install -r <exact-apk-path>` once the device is available. Do not use a
wildcard when several builds exist.

For explicit USB loopback development, reverse the chosen main-server port with
`adb reverse tcp:3201 tcp:3201`, then run the two-service development launcher:

```sh
ALLOW_USB_LOOPBACK=true PAIRING_ORIGINS=http://127.0.0.1:5273 \
PORT=3201 DEV_WEB_PORT=5273 VISION_PORT=3202 DATA_DIR=./data/quest-rehearsal pnpm dev
```

Pair desktop at `http://127.0.0.1:5273` using the short-lived operator code in the
private data directory. Issue a native author code from that desktop and connect
the headset to `http://127.0.0.1:3201`. If USB is unavailable, configure real TLS
and an exact HTTPS browser origin using the existing server TLS settings; the
headset must trust the certificate. Never treat a successful health response as
proof of usable rendering, provider readiness or authenticated pairing.

Mock defaults exercise transport/review only. Actual narration, Live and vision
acceptance require the configured server-side providers and credentials; consult
`apps/server/src/ai/README.md` and `apps/vision/README.md`. Do not put credentials
in the APK or exported tutorial. Record provider failures explicitly.

## First physical milestone

- [ ] Installed APK — open Create and Follow → passthrough, physical hands,
  world-space controls and status are visible and readable; no black view.
- [ ] Expert registration — independently sample A/B/C and test D → record D
  error in millimetres and orientation error using the plan's thresholds; never
  enlarge tolerances to hide error.
- [ ] Fresh bottle demonstration — set the save position, allow microphone,
  opt into endpoint photos in Diagnostics, enable the camera, then record three
  short actions → countdown/UI motion is excluded, narration is audible, stable
  starts and ends produce usable boundaries, and returning to save trims cleanly.
- [ ] Take correction — pause/resume, replace a take, then discard a replacement
  → prior committed actions survive; paused speech, return motion and discarded
  takes do not appear in the final clip/audio.
- [ ] Upload and review — upload as author, reload saved guides on desktop, listen
  to the recording, inspect each motion boundary and transcript, correct generated
  instructions, and save → provenance is explicit and no model edits coordinates.
- [ ] Endpoint reference review — select a captured headset candidate, inspect the
  picture, describe its visible outcome and approve → approval is bound to this
  recording/step/revision; later instruction edits clear approval. Delivery-aligned
  camera timing is an estimate that needs device measurement.
- [ ] Starting layout — record and review the exact physical arrangement before
  learner setup. The separate reviewed starting-layout image workflow is still a
  software gap; do not claim endpoint images close this requirement.
- [ ] Independent learner — pair as learner, preload the ready guide, move to a
  different table/room and independently calibrate A/B/C plus D → complete one
  step without the expert supplying movement-by-movement instructions. Observe
  the physical result separately from “Movement checkpoint reached.”

## Voice, transfer and failure drills

- [ ] Native Live — explicitly Start, then converse with hands and guidance active
  → hear answers and see captions; test interruption, echo, Mute/Unmute and End.
  The current custom microphone adapter does not establish platform AEC support.
- [ ] Camera speech — ask “check my placement” on correct, wrong and obscured
  arrangements → hear different appropriately qualified findings from fresh
  headset images, without automatic advancement. Adjust and say “check again.”
- [ ] Stale result protection — Repeat, cancel, End or change the step while an
  inspection is pending → no previous scene's buffered answer becomes audible.
- [ ] Learner pacing — follow at 0.5× and 0.25× expert speed → progress follows
  the learner. Visit the endpoint before the start or skip a gate → no advance.
- [ ] Tracking — lose the active hand near the end of dwell, regain it and hold
  → require a new valid dwell; test both-hand guidance and inactive-hand loss.
- [ ] Recenter/moved mat — interrupt or reset the XR reference → invalidate
  registration and require recalibration, with no progress through the gap.
- [ ] Backend/vision loss — disconnect after preload, continue local guidance,
  then restore services → local steps remain usable and pending speech is cancelled.
- [ ] Spectator — open the actual Quest cast, choose its tab/window in Spectator,
  verify hands/ghosts/task are visible, enable audio if included → audience sees
  physical action beside the current instruction. End/reconnect both cast and
  telemetry → stale state is visible and a fresh snapshot returns.

## Release evidence

- [ ] Repeat fresh authoring and transfer with LEGO-style parts using the same
  engine; do not substitute bottle recordings or cached model answers.
- [ ] Complete three consecutive full runs and one non-builder run without
  step-by-step coaching. Record failures and retries rather than deleting them.
- [ ] Record commit, APK hash, actual device/OS, editor/SDK versions, calibrated
  held-out errors, source/model provenance, request/run/step/attempt IDs, end-to-end
  speech latency and observed outcome in `docs/validation.md` only when real
  observations exist. Keep identifying participant details/private media outside Git.
- [ ] Package the tested APK, server source and lockfile, ready tutorial plus its
  verified recording/audio/reference assets, configuration instructions and this
  runbook. Exclude secrets, transient pairings and unrelated private recordings.
- [ ] Record a clearly labelled backup video of the actual completed experience.
  A synthetic browser replay or generated illustration is not this evidence.

Full signoff remains blocked until these observations exist. Separate unfinished
software (starting-layout review and verified echo/interruption behavior) from
unavailable hardware evidence in every handoff.
