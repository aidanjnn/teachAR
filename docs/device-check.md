# Device setup gate — pending

The hardware is confirmed: **Meta Quest 3S with controllers**. No live headset
checks are recorded for the current scaffold. The selected target is now a
standalone Unity + Meta XR Android app; Unity project/setup remain planned.

## Native setup evidence to collect

- Exact Horizon OS, app ID/version, commit/APK hash, Unity editor patch and
  OpenXR/Core/Interaction/MRUK/WebRTC package versions.
- Editor activation and Android SDK/NDK/OpenJDK readiness; ARM64/IL2CPP build,
  developer mode, authorized `adb devices`, APK install and launch.
- One OpenXR provider/rig, passthrough, real hand skeleton and named 26→25 map;
  left/right poses and orientation checked against canonical fixtures.
- Native pairing/authenticated API, microphone and headset-camera permission
  grant/deny/retry, MRUK fresh frame timestamps/readback, duplex audio.
- Same APK concurrently running recorded ghost replay, hands, camera, voice and
  the intended spectator path; Editor/simulator tests are separate evidence.
- Independent two-user mat calibration, held-out mark, tracking loss, recenter,
  removal, app suspension/restart and safe local recovery.
- Transfer the same tutorial, objects and starting layout to another room/table;
  record table height, mat orientation, held-out error and actual learner result.
- Bounded MRUK scene probe: current room/surface geometry, permission denial, stale
  or absent data, origin/world-lock consistency and frame cost; mark synthetic
  fallback separately. Record whether scene-assisted setup is enabled or deferred.
- Tracking and fresh visual coaching under changed backgrounds/lighting; explicit
  starting-layout confirmation and recovery from an intentionally misplaced part.

- Fresh Quest camera → main API → separate vision backend → image-capable model
  → GPT Live → audible headset feedback, with matched request/observation IDs.
  Correct/wrong/obscured/adjusted views must change the response appropriately.
- Vision process timeout/crash/restart and cancelled/late result rejection; voice
  remains available, visual status is explicit, and local guide recovery works.

## Proposed data connection

Keep the existing Fastify scaffold bound to loopback. After native networking is
implemented, use `adb reverse tcp:3001 tcp:3001` with an explicitly scoped native
development loopback endpoint/security policy. Off USB use authenticated HTTPS/WSS.
The API's native bearer authentication and browser cookie/Origin policy must be
implemented before exposure. A missing Origin is not native authentication.

The existing Vite/Three.js page may still be used as a desktop/browser diagnostic.
It does not install or exercise the native app. A browser capability query does
not establish native capture, audio, camera or physical-transfer readiness.

Follow [the Unity setup plan](plan.md#unity-migration-sequence-owned-by-integration-and-xr).
Record observed hardware results in `docs/validation.md` only when they exist,
including tested revision/software, scenario, measurements and remaining issues.
No Unity installation, APK build or device test was performed by the plan update.
