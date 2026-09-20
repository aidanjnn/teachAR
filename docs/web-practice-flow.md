# Watch, prepare, practise: browser movement loop

**Presentation update:** [Immersive entry and continuous hand surfaces](web-immersive-entry.md) supersede this document’s procedural-hand description and browser-first entry instructions. Movement rules below remain in effect.

This change builds on the UI/UX base in PR #23. The active headset runtime remains `experiments/quest-browser` (Quest Browser/WebXR). The original strict follower remains the default for legacy consumers; the contextual tutor opts into the new relaxed practice loop. No recording schema migration or Unity change is required.

## User flow

Each recording starts with a 0.75× demonstration. Start regions are hidden during the preview. When it ends, the ghost returns to its first pose and asks the learner to bring the required palms near the broad starting regions. A 600 ms hold begins practice. There is no exact finger-pose matching.

Practice uses fewer ordered position targets (18 cm sampling distance), 14 cm palm tolerance, and short 80 ms intermediate holds. The start tolerance is 18 cm. These are initial demo tuning values, not measured ergonomic/accuracy guarantees. Directional progress and a measured hand excursion prevent overlapping regions from allowing stationary completion. Missing/stale hands cannot advance; invalid reference tracking remains unknown. Rings disappear after the start, leaving the ghost and path cue rather than a moving cage to chase.

After a 650 ms endpoint hold, a 1.2-second movement-only transition automatically starts the next preview. No Next button is needed while holding the object. Pausing, settings or focus loss holds progress; interruptions and missing hands clear the transition timer. Focus recovery requires Resume. Repeat replays the demonstration; explicit Watch mode never completes a step. The final screen reports **Movements finished**, with physical correctness still unverified. It does not populate learner-self-confirmed results.

This remains workspace-relative guidance. A new object location requires placement/repositioning. Different shirt geometry, hidden hands, grasp quality and successful folds are not automatically understood. Automatic movement advancement is appropriate for this demonstration; tasks requiring a verified result before proceeding will need an explicit result gate.

## Implementation seams

- `public/tutorial-follow.mjs`: pure `TutorialPractice` phases (`preview`, `ready`, `practice`, `transition`, `complete`) and relaxed `TutorialFollower`. Owns movement timing, not network calls or object state.
- `public/tutorial-guide.mjs`: existing session/action owner; renders preview, feeds fresh tracked hands, advances the player index and logs `movement_step_completed` with `kind: movement-only` and `physical_result: unverified`. Automatic transitions do not call `TutorialPlayer.confirm()`.
- `public/tutorial-ui.mjs`: phase-specific copy and controls. Existing pause/repeat/menu affordances remain available.
- `public/hand-guide.mjs`: smoother tapered 12-sided finger segments, separate translucent materials, filled palm and contour. Still procedural joint geometry, not anatomical mesh reconstruction. Tracking loss hides invalid hands.

## Next voice / OMNI / vision work

Use the guide's current tutorial ID, revision, step ID/index, session epoch, phase and tracking status as the context envelope. Keep this local movement loop authoritative. Reject late responses when any relevant context has changed. Do not let a model's text directly assign `mode`, advance the index or claim physical confirmation.

Voice should describe the current instruction/phase and route explicit learner requests through existing actions (pause, repeat, watch, resume). Coordinate speech with recorded narration so two audio sources do not talk over each other. The local phase announcements are browser speech synthesis, not a wired model voice.

Vision/OMNI should return a distinct observation with image timestamp and confidence/unknown status. Add a separate physical-result gate when the chosen demo needs it; do not relabel movement success as circuit/fold correctness. Object detection may later supply object identity/pose and a reviewed placement transform. It must not silently translate the ghost to the learner's current hands, which could detach it from the physical task. Keep camera/mic ownership, cancellation, budgets and opt-in transmission from existing adapters. No new provider is connected by this PR.

## Acceptance on Quest

Reload `/tutorial` after ending the old AR session. Use a reviewed two-step recording. Watch the first preview without following it; verify no movement completion. After “Your turn,” enter the broad start regions, then perform the motion with moderate lateral variation. Hold at the end: the next preview should begin without touching a control. Complete the last action and inspect the movement-only final message.

Also try stationary hands near overlapping start/end regions, hidden hands, a paused transition, focus loss, repeat and explicit Watch mode. None should generate a physical confirmation or skip ordered motion. Check ghost contrast against both bright cloth and a dark table. Existing save/import/export behavior is unchanged. Software tests use synthetic hands; fresh headset comfort/tracking validation is still required.
