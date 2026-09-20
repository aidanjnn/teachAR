# TeachAR WebXR ownership

The product direction is [the WebXR stack from PR #17, #23 and #24](plan.md). The native workstreams are
retired. This assigns boundaries for future work; it does not authorize delegation.

| Area | Location and responsibility |
| --- | --- |
| XR and interaction | `apps/webxr/public/tutorial-guide.mjs`, `tutorial-ui.mjs`, `ar.js`: hand sampling, scene lifecycle, ghost/UI presentation |
| Motion and data | `tutorial-follow.mjs`, `tutorial-assist.mjs`, `motion-core.mjs`, `tutorial-core.mjs`: pure math, freshness, formats and review invariants |
| Voice and vision | Local narration/camera modules plus existing server/vision providers; own microphone lifecycle and the future explicit context adapter |
| Integration | Workspace manifests/lockfile, Python server/launchers, CI, IndexedDB/library and paired backend integration |
| Desktop diagnostics | `apps/web`: authoring, replay/spectator and Voice Lab |

Coordinate edits to `tutorial-guide.mjs` and the HTML/CSS entry points rather than
having multiple owners overwrite them. Shared API schemas remain distinct from
browser v3; format changes require fixtures, consumers and migration notes.

UI and feedback are implemented; preserve them while extending
[the next slices](plan.md#17-immediate-tickets-to-create). The preview/practice
controller owns movement phases. Coach work must preserve its authority and
stale-context rules. Headset and live-provider evidence remain separate.
