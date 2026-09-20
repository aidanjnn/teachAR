# Trail visual reference for the browser tutor

The current delivery target is Quest Browser / WebXR. This self-contained reference preserves the discussed UI direction; it is not connected to recording, storage, hands or AI. The timer, hand drawing, tutorial contents and success states are simulated. Do not replace the working tutor with this mock.

Open [preview.html](preview.html) after downloading it, or from the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/design/trail-ui
```

Visit `http://127.0.0.1:8765/preview.html`. Choose Charcoal or Warm gray, then inspect Screen, Simulated hand state and Panel side. These selectors are review tools outside the proposed product. Create and Follow buttons walk through example navigation. Nothing records or persists here.

## Direction to carry into WebXR

- Warm charcoal default; warm gray remains a comparison. Boxed-plus Create and library-icon Follow tiles.
- One main panel during setup; a compact side instruction and reachable Pause / Repeat / Menu controls during movement. Preserve the real workspace view.
- Cyan translucent expert hands, restrained learner outlines, broad truthful palm zones. Amber means corrective guidance; tracking loss means unknown, not wrong. Green means the labelled event succeeded, not that an object was assembled correctly.
- Set a save position once per tutorial; reuse it. Record manually or use the explicit return gesture, trim the return/control reach, review the actual result, then save locally.
- Ghost waits for required hands at the start and advances through ordered local movement gates at the learner's pace. Physical result confirmation stays explicit.
- Save success may pulse green and ding only after durable storage succeeds. Failure must remain visible. Use short event cues, a mute control and cooldowns; never sound on every tracking frame.
- No task-specific generated folding steps. Preserve general instructions, drafts, review, import/export backup and placement recovery.

The design uses [Ali's design guidance](https://github.com/neanicc/alis-design). See [tokens.json](tokens.json) for reference values. Desktop pixels are not headset metres; inspect legibility and reach on Quest. Material design changes still need user review.

## Implementation boundary

See [the web delivery plan](../../web-delivery.md) for the feature inventory, source map, implementation order and acceptance test. Use the existing browser view model and state machine; do not bolt on another workflow controller. Unity/Meta prefabs are not web assets. Recreate the design through Three.js world-space rendering and existing hand/controller hit tests, with matching DOM controls outside AR.

The runnable tutor now implements this direction through real recording/review/follow actions, a compact immersive dock, durable-save feedback and in-headset trim controls. This preview remains simulated. See [UI base implementation and acceptance](../../web-ui-base.md) for the exact scope and remaining headset checks.
