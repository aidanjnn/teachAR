# Runtime/Scene

Task 5 owns nonce-bound MRUK source snapshots and non-voice inspection coordination.
`ScenePlatformFeature` registers at platform order 30 after the guide. It composes
one disabled camera, `SceneCaptureController`, `SceneInspectionController`, and
world-space fresh-hand controls. Camera enable and transmission are explicit.

`FreshFrameGate` is pure C# and tested by SceneHarness and Unity EditMode sources.
Actual pixels come only from the MRUK camera texture. New sensor timestamps advance
sequence; a post-nonce frame is copied to an owned RenderTexture before asynchronous
readback/encoding. Only one readback is admitted. Captured event bytes are borrowed
synchronously and cleared after listeners return. Focus/pause, permission and
request invalidation suppress obsolete copies. No source is substituted in Editor.

Inspection pauses via `GuideController.PauseForInspection`, publishes/acknowledges
the shared event and uses `NativeApiConnection` for start/upload/cancel. Advice has
no guide mutation path. `FindingsAccepted` and `IsCurrent` are extension points for
voice PR3; this assembly contains no narration, microphone, Live or coach transport.

See [device procedure](../../../../../../docs/visual-inspection.md). MRUK scene/room
placement assistance remains outside this inspection workstream.
