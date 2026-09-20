# Visual inspection service boundary

The retained TypeScript inspection service supplies bounded snapshot advice.
It does not certify assembly or advance movement. The primary WebXR tutor is not
yet connected to this service; its separate camera lab is a task-specific experiment.

## Existing backend protocol

`apps/server/src/vision` coordinates authenticated inspection against a ready
immutable tutorial and reviewed references. `apps/vision` performs authenticated
internal image interpretation. Caller-supplied file paths/URLs are not trusted
reference inputs. See [service setup](../apps/vision/README.md).

The coordinator requires exact, fresh, connected, paused, calibrated shared
`GuideContextRef` telemetry. Accepted guide-event changes call `guideChanged`;
disconnect/revocation invalidates work. An authenticated learner obtains a new
inspection lease from `POST /api/inspection-sessions` after the guide-event
acknowledgment. Starts use the server-issued `liveSessionId`, generation 1 and
increasing request epochs. New Check/Retry leases retire earlier work.

`InspectionCapture` binds the request to a nonce, source session, minimum frame
sequence and remaining budget. Source sensor timestamps are local identities;
elapsed age uses monotonic clocks, not subtraction across different machines.
Bound images, decoded dimensions, queues, deadlines and replies. A verdict needs
fresh source-labelled input and approved references; missing inputs fail closed.

## WebXR adapter still required

Connect reviewed browser step/reference context through an explicit format and
authentication adapter. Preserve local progression authority, pause/acknowledgment,
lease and generation sequencing. The browser must capture a genuinely newer frame
and discard replies after resume, repeat, placement reset, step change or teardown.
Passthrough display alone does not prove readable camera frames.

Do not reuse cached images as current observations or claim the old device-camera
implementation exists. Camera/mic/XR concurrency and fresh image-to-spoken-feedback
behavior require a real Quest trial. Voice integration must coordinate one mic
owner and cancellation with the existing backend, not start competing loops.

## Validation

`pnpm check` includes bounded-input, authentication, stale-context, cancellation
and two-process mock tests. `pnpm test:webxr` covers the existing browser camera
snapshot and optional-media paths with synthetic streams. Neither invokes a paid
provider or proves real sensor alignment. Follow [headset acceptance](device-check.md)
for live source, wrong/obscured views, changing feedback and latency evidence.

Historical native implementation/build results remain in Git and
[the activity log](codex-log.md). They are not requirements or current proof for
this browser foundation.
