# Trail Create / Follow interaction update

Implemented locally in `/tutorial`, in the existing Quest Browser WebXR runtime. The earlier clickable concept is a design reference, not another app to launch.

## Decisions informed by current XR guidance

Meta recommends generous, separated hand-interaction targets, predictable layouts, readable depth placement, clear feedback, and repositionable panels. Trail now uses a small set of contextual controls, matching visual/button hit regions, and a world-stable panel placed about 1.1 m ahead with a side offset. Move panel alternates sides and recenters it near the current view without modifying the tutorial’s workspace. Complex settings stay behind More options. This is a browser ray/pinch interface, not a claim of Meta Interaction SDK integration or measured ergonomic compliance.

Sources consulted on 19 September 2026:
- [Meta: Hand tracking UI best practices](https://developers.meta.com/horizon/design/hands-ui-best-practices/)
- [Meta: Mixed reality design guidelines](https://developers.meta.com/horizon/design/mr-design-guideline/)

## Product flow

Home → Create → One-time save-position setup → Starting setup → Origin/direction → Placement preview → Record/Pause/Finish → Review actual recording → Approve and save → Follow.

Home → Follow → Local library → Starting setup → Origin/direction → Placement preview → Wait for start pose → Ordered movement targets → Learner checks the physical result → Next recording.

There are no fabricated task steps or clothing-specific defaults. No download is required to finish. Browser backups remain available for moving tutorials between devices or origins. Existing current-draft data migrates into the library.

## Deliberate limits

- Origin/direction changes translation and yaw only. Changing point spacing does not scale hands or automatically adapt object geometry. The surface must remain approximately horizontal.
- Generated movement targets are geometric samples, not inferred semantic task steps. Green means palm proximity. Orientation, grip, finger correctness and object state are not graded.
- Missing tracking holds progress. Missing required reference palms makes guided progression unavailable for that recording; Watch again still uses the recording’s visible samples. Review lets the expert select the required hands.
- Guided mode advances discrete target poses; it does not yet produce a continuously retimed, just-ahead animation. Recorded narration plays in Watch/review, not automatically synchronized to learner progress.
- Ordinary capture can include reaching for Finish. Return-to-save uses the tutorial’s one-time configured position and can be disabled; the browser editor can trim the recording and narration together.
- The new UI, panel position, hand tracking and tolerances require a Quest acceptance run. Synthetic browser checks do not establish hardware comfort or physical-task success.
