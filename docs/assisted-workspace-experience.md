# Assisted workspace and live voice

This extends the WebXR foundation. It includes PR #31's simpler Create/Library,
recording and hold-save flow; #31 was still open when this branch was prepared.
Unity is not involved. Keep the Quest origin `http://localhost:4345/tutorial` to
retain browser-local recordings. Reload the page after updating the server.

## What the learner sees

Home opens Create / Library. Open a library item to Play, Edit, Rename or Delete.
Deletion requires confirmation, commits to IndexedDB before a success cue, and
leaves a tombstone so a stale tab cannot resurrect it. An explicit import of a
deleted export creates a fresh copy. Rename preserves readiness and recorded motion.

Play defaults to **Repeat & practise** for every task, not an origami-specific
mode. The ghost repeats at 0.75× with a 1.2-second endpoint pause. Narration plays
on the first pass; Repeat starts it again. Palm proximity compares both required
hands to the same recorded pose anywhere along that step's path, not to the
current playback time. Within 12 cm gives green; missing palms remove that cue.
This is direction/proximity feedback, not correct grip, crease, contact, ordered
execution or task completion. Next/Previous remain deliberate button or voice
actions. The optional Guided movement setting keeps ordered checkpoints and
automatic movement-only progression.

Panel controls: bottom grab bar, yaw-only Turn, corner Resize, Face me recovery.
The timer stays beneath the panel until moved separately. These are Three.js
interactions inspired by spatial UI conventions, not imported Meta OS controls.
Manipulation pauses capture/guidance and suppresses release clicks. Recorded
motion and workspace transforms are independent of panel size and position.

## Assisted placement

Choose **Suggest landmarks · share photo** while creating, or **Match landmarks ·
share photo** while following. This explicitly shares the current JPEG with the
paired API; following also shares the tutorial's saved reference. Camera
permission is requested if needed. No continuous camera upload is enabled.

The bounded model response contains exactly two named landmarks, normalized 2D
image suggestions, a note and a suggested/uncertain status. Preview the annotated
image, identify the real named points, then confirm. Creating stores the reference
and labels in optional `workspace_reference` metadata in the existing v3 format;
following matches that reference without overwriting it. Imports validate this
metadata. Old tutorials still use manual placement.

A and B are still established by the tracked right fingertip. After the countdown,
1.5 seconds of stable visible samples are required. Gaps reset the hold, movement
restarts it, and a median/inlier filter reduces jitter. Fine adjustments are 1 cm
and 2 degrees. Same-size materials and the same starting arrangement are required.

**Limit:** image suggestions are approximate; a live synthetic-image probe returned
correct corner descriptions but visibly imperfect pixel locations. A model response
is not calibrated 3D registration. No camera intrinsics, automatic plane snap,
persistent anchor restoration, object retargeting, or hidden-hand reconstruction
is claimed here. Blank symmetric paper still needs the user to resolve orientation.
If the suggested points cannot be identified, go back and mark manually.

## One live voice path

The headset's Voice → Enable uses GPT-Live-1 / WebRTC via the existing shared
coach runtime. It remains listening until stopped, hidden, disconnected or the
10-minute client limit. The compact microphone indicator uses local RMS input;
there is no per-utterance audio upload pipeline for these live commands.

`trail_action` is the only registered function tool. The live model delegates
explicit app-control requests to the configured Responses backend, which asks
for the action. The browser consumes completed function-call events, deduplicates
call IDs, checks the captured local context and current allowlist, then dispatches
`applyVoiceCommand`. Tool results return on the live session, which speaks the
reply. Unknown/stale requests cannot move the tutorial. The provider has no direct
access to motion, IndexedDB or arbitrary JavaScript. Ordinary questions should
be answered directly from the loaded step text rather than delegated for analysis.

During authoring, a bounded generic control guide is published for voice. It does
not pretend to know unrecorded task instructions. Opening/changing the selected tutorial refreshes the live context while voice
is enabled. Home uses generic controls rather than silently coaching a restored
tutorial. Network failure does not cause an automatic retry loop. Manual/gesture recording
works when voice is off or unavailable. The old clip API remains for diagnostics;
it is not the headset default and is not a silent fallback.

Generated narration uses pinned `gpt-4o-mini-tts-2025-12-15` with **Marin**, stored
locally. Original narration is retained. Routine app announcements are suppressed
while live voice is active; existing visual/short sound cues remain. Fixed
2.1-second client cooldowns and matching server delays were removed from sequential
polishing; concurrency and the 48-request allowance remain bounded. Narration
creation still requires transcription, cleanup and synthesis; it cannot be instant.
Previously generated audio keeps its original voice until regenerated in Edit.

## Integration points and acceptance

- Visual setup: `POST /api/workspace/landmarks`, paired author/learner, explicit
  consent, bounded JPEG/request/response sizes, timeout, one request at a time,
  maximum 24 attempts per server process. Credentials stay server-side.
- `live-voice.mjs` adapts the live runtime to the WebXR allowlist. Keep OMNI advice
  from PR #35 separate from these explicit user actions. Scene observations must
  never auto-confirm a physical result or invoke progression tools.
- `workspace-assist.mjs` holds pure marker sampling, suggestion validation and
  untimed palm comparison. Do not replace raw tracked joints with rendered ghosts.
- Library remains `trail-tutorials`; IndexedDB migrates from version 2 to 3 to add
  deletion tombstones. Export/import format remains `trail.tutorial.prototype.v3`.

Headset acceptance: create a short two-step demonstration using hold-save; finish;
rename it; open Library and Play; use assisted labels and stable marking; watch
repeating hands while moving at a different pace; pause/resume/replay/next/back by
voice and buttons; hide/reopen the session; delete a disposable tutorial and reload.
Test real mic echo concurrently with narration, frame rate, readable photo preview,
marker precision and transfer to another table on the actual Quest. Software tests
and synthetic provider probes do not establish those hardware outcomes.

## Reference documentation

- [OpenAI Live delegation](https://developers.openai.com/api/docs/guides/live-delegation): completed function output items, returned tool results and continuation.
- [OpenAI TTS](https://developers.openai.com/api/docs/guides/text-to-speech): Marin voice and speech generation.
- [Meta panels](https://developers.meta.com/horizon/design/panels/): spatial panel manipulation conventions.
- [Meta browser camera access](https://developers.meta.com/horizon/documentation/iwsdk/guides/13-camera-access/): MediaDevices support is distinct from calibrated camera-to-world registration.
