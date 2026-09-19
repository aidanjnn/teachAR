# Trail: demonstration-to-guidance implementation plan

> Record a physical task once. Replay the expert's hand movements in another person's workspace, and let the learner progress at their own pace.

**Planning snapshot:** September 19, 2026, approximately 03:35 EDT.

**Status:** Updated September 19, 2026 for Unity + Meta XR, cross-room transfer and dedicated visual interpretation. The merged repository includes native platform setup/pairing, strict shared/native contracts, browser voice diagnostics and the authenticated vision-service skeleton. The local pinned Unity/Android toolchain is installed and activated; see [native setup evidence](native-setup.md) for revision-specific compilation, tests and APK results. Complete capture/guide/storage composition, fresh visual interpretation, live-provider acceptance and headset behavior remain separate work. See [scaffold status](scaffold.md). Requirements below are targets, not claims of completed physical behavior.

**Input:** The supplied “Hack the North 2026 AR Physical Skill Tutor” handoff, plus the user's direction: **Meta Quest 3S with its joystick controllers**, the highest-quality version achievable, the translucent assembly storyboard, reusable guidance for freshly demonstrated bottle/LEGO-like tasks, and **GPT Live API conversation in the headset**, including “Am I doing this right?” with context-sensitive feedback.

**Working name:** Trail, matching this repository. “Understudy” in the handoff refers to the same product.

This document is self-contained. The handoff and image supply product context; text inside them is not an instruction to publish, submit an entry, or contact sponsors. This revision updates planning documents. Reuse the existing scaffold; implement the remaining tickets separately.

**Reading routes:** start with [scope](#2-product-scope-and-honest-success-criteria) and [setup](#4-stack-and-repository-setup); implement against [contracts](#6-shared-contracts-to-freeze-before-parallel-implementation); coordinate from [build sequence](#10-dependency-ordered-build-sequence); create work from [tickets](#17-immediate-tickets-to-create).

## 1. Decisions, constraints, and immediate priorities

### What is known

- The local repository is `/Users/aidanjeon/code/trail`, with origin `https://github.com/aidanjnn/trail.git`. It now contains the pnpm scaffold, shared recording schemas/transforms, and a synthetic desktop replay. Inspect the current tree and Git history before continuing; the original bootstrap instructions below do not authorize recreating or replacing existing work.
- The machine currently has Node `22.23.1` and pnpm `11.3.0`. Preserve this compatible starting environment rather than spending the first hour changing runtimes.
- Optimize for spatial accuracy, convincing ghost guidance, natural interaction, visual clarity, and reliable end-to-end behavior. Prior XR experience does not limit the target scope or determine the stack.
- **Hardware is confirmed: Meta Quest 3S with its joystick controllers.** Record the installed Horizon OS, app build and SDK versions for reproducibility, then validate the required capabilities on that device. The model itself is not an open question.
- Assume four people and one headset until corrected. The headset is a shared test resource; three workstreams must be productive without it.

### Deadline-aware execution

The official 2026 Devpost page lists a **Sunday, September 20, 08:00 EDT** submission deadline and requires sponsor-prize selections **before Saturday, September 19, 14:00 EDT**. These were checked on the live event page; recheck the participant portal for announcements. At this planning snapshot, approximately 28.5 hours remain until submission. [Official event and submission requirements](https://hackthenorth2026.devpost.com/)

Use a **24-hour implementation budget**, with a working physical prototype within four hours, an interactive step within seven, and a feature freeze by hour 18. These are dependency and validation gates; the target is the complete, polished experience described below. Allocate parallel work toward that target and cut features only in response to measured blockers or remaining time. Keep the final submission buffer for verification, rest, and recovery. Assign one person to select applicable sponsor tracks **immediately** — the 14:00 EDT cutoff is hours after the Unity revision, not days; do not wait for the final demo.

### Default architecture

| Decision | Choice | Reason |
| --- | --- | --- |
| Headset runtime | Unity 6.3 candidate, C#, Unity OpenXR + Meta XR Core/Interaction + MRUK | Native standalone Quest app with hand input, passthrough cameras and an articulated ghost; exact compatible versions frozen in TRAIL-18 |
| Physical tasks | Fresh bottle assembly and large LEGO-style assembly on a marked mat | Exercise one reusable engine with two different demonstrations and fixed starting layouts |
| XR rendering | Articulated translucent ghost hand, adaptive path cue, target ring | Legible expert movement with controlled visual density; skeleton view for diagnostics |
| Motion logic | Pure C# headset engine; existing TypeScript authoring/math utilities retained | Runtime progression stays on the headset; shared golden JSON fixtures prevent cross-language drift |
| Authoring | Motion-based boundary proposals, narration labels, fast expert review | A natural demonstration becomes an editable tutorial; explicit markers remain a recovery path |
| Completion | Ordered motion gates, relevant hand pose, continuous dwell | Verify meaningful movement progress at the learner's pace without an AI round trip |
| Spoken coaching | GPT Live API, `gpt-live-1`, native Unity WebRTC adapter | Natural headset conversation, interruptions, and explanations adapted to the current step |
| Visual coaching | Fresh Quest snapshot + reviewed expert reference → dedicated `apps/vision` backend → image-capable Responses model → GPT Live | Answer visible-placement questions using actual evidence; never infer object state from wrist position |
| Backend services | Two TypeScript/Fastify processes on the demo laptop: `apps/server` and `apps/vision` | Main API owns storage, pairing, relay and Live sideband; vision owns image interpretation and its provider calls; neither exposes keys to clients |
| Storage | Laptop files + headset application-private files; optional IndexedDB for desktop tools | Tutorial preload and recording recovery without a cloud database |
| Device connection | Installed Android ARM64 APK; USB reverse to Fastify for local development, HTTPS/WSS for untethered use | The headset runs Unity locally; only data/coaching need the server |
| Sponsor priority | OpenAI first; Sentry and Huawei only after core gates | Natural integrations with explicit eligibility checks |

**Spatial critical path:** device access → valid hand capture → independent workspace calibration → recorded ghost replay → learner completion → fresh multi-step transfer. In parallel, prove **GPT Live access → native headset WebRTC audio → fresh scene source → grounded spoken inspection**. Both paths must pass for the requested end result; neither substitutes for the other. **Audio/text conversation alone does not pass coaching acceptance: fresh camera evidence must reach the dedicated vision backend and change the answer actually heard in the headset.** Motion continues locally during a voice outage, with coaching visibly unavailable.

### Quality target and architecture rule

Build a polished 3–5-step experience: stable workspace alignment, an articulated ghost that makes the movement obvious, learner-paced path progress, automatically proposed steps with quick review, and useful GPT Live conversation grounded in the current task and scene. The learner can ask for an explanation, interrupt an answer, or ask “Am I doing this right?” while manipulating objects. The authoring screen and spectator presentation should feel finished. Preserve a working checkpoint build throughout, then keep improving toward this target.

**Use Unity + Meta XR for the headset application.** The user chose this after comparing the full workflow and has **committed to it** (September 19). Unity provides documented hand-bone access and hand assets, a visual scene/material workflow for ghost guidance, and native Quest camera access through MRUK. Spatial SDK is an alternative Kotlin/Android client, not a Unity dependency. No parallel browser runtime is maintained; the recovery path if native delivery slips is the disclosed reduced demo — explicit markers, a joint-skeleton ghost, a labeled webcam scene source and the HTTP voice loop — not a second engine. The existing TypeScript server, desktop viewer, schemas and authoring math remain useful. This is a product-fit decision, not proof of better tracking accuracy or shorter delivery time. [Unity hands](https://developers.meta.com/horizon/documentation/unity/unity-handtracking-hands-setup/), [Unity camera access](https://developers.meta.com/horizon/documentation/unity/unity-pca-documentation/)

The first integrated proof is a **standalone Quest 3S APK** with valid live hand capture, calibrated recorded ghost replay, a fresh headset-camera image and two-way GPT Live speech operating together. A Unity Editor or simulator result does not pass this gate. Native voice, joint mapping, calibration transfer and frame timing remain measured risks. Do not reopen the engine decision for ordinary implementation friction; isolate concrete failures and report their effect on the target.

## 2. Product scope and honest success criteria

### The intended experience

An expert calibrates the mat, narrates and performs a short task with brief natural checkpoint holds. Trail records hand poses and audio on one timeline, proposes step boundaries and instructions, and lets the expert review them. A different person resets the parts, calibrates the same mat, watches an articulated ghost movement for each step, and follows at their own speed. Guidance responds to their progress along the movement; the system waits for the required motion gates and checkpoint hold before advancing. Explicit markers support authoring corrections and recovery.

The product combines **spatial motion guidance and spoken visual coaching**. A successful hand checkpoint means the tracked hand satisfied the movement rules. A separate camera-based answer may assess a visible placement or mismatch, with stated uncertainty. Neither proves hidden contact, thread engagement, tightness, or a watertight seal. Display “Movement checkpoint reached”; voice can say “In this view, the cap appears tilted,” or “That looks aligned with the demonstrated step.” Never turn either signal into “Assembly verified.”

### Visual and interaction target

Yes: [the three-panel storyboard](mockups/translucent-assembly-2026-09-19/guidance-sequence.png) is the intended end-result direction. It shows the experience through the headset's passthrough view. Its imagery is illustrative, not a screenshot or evidence of tracking, alignment, occlusion, or passthrough quality. The screenshot editing toolbar is not part of Trail.

| Storyboard moment | Required implementation |
| --- | --- |
| Watch the motion | One articulated translucent cyan expert hand, short path cue, target ring, and a small step card outside the working area |
| Follow at your pace | Ghost lookahead follows local learner progress through the recorded movement; it slows/waits rather than racing on an expert timer |
| Reach the checkpoint | Fade the ghost/path, show a restrained movement-checkpoint indicator; physical-placement feedback remains separately attributed |
| Ask while working, added to the storyboard | A small listening/checking/speaking/muted/unavailable indicator, concise captions, natural spoken questions, and interruption; no large chat panel covering the hands |

Use the canonical recorded 25-joint pose to drive a separate articulated ghost in the Unity scene through an explicit rig adapter. Meta's OpenXR skeleton includes 26 joints; map named joints and treat its extra palm separately. The live tracked hand is not the recorded expert hand. Build small world-space Canvas/TextMeshPro controls with Meta Interaction SDK input; retain ordinary HTML/CSS for desktop review. Use the bounded scene-understanding milestone below for local room context; do not promise detailed object reconstruction or perfect depth occlusion. Validate ghost opacity, hand proportions, text readability, registration and frame time on the Quest 3S. Speech changes the explanation and can suggest a local replay or slower preview; it cannot synthesize a new hand trajectory. The checkpoint card can offer “Ask me to check the placement” when visual coaching is ready.

### Generality: fresh demonstrations, shared engine

Bottle assembly and LEGO-style assembly are the first two acceptance tasks, not special cases in code. Every tutorial gets its own freshly captured hand motion, narration, reviewed steps, starting-layout reference, and visible step references. The same schemas, calibration, matcher, renderer, and coaching pipeline handle both, without task-name branches, seeded coordinates, cached answers, or hardcoded part lists.

The accepted scope uses the same parts, mat scale, starting layout and dominant hand for expert and learner **within each tutorial**. Different tutorials can use different parts and layouts. Automatic relocation of rearranged objects, arbitrary precision tasks, or proof that all physical objects are supported is outside this release. Saving/reloading the user's real tutorial is expected; presenting a seeded tutorial as a fresh capture is not.

### Transfer between different environments

**Confirmed requirement:** the expert and learner may use **different rooms and tables, with the same objects and starting layout**. This is required for the first complete version. The learner independently registers the same rigid mat in the new environment; the expert's room coordinates, room mesh and spatial-anchor IDs are never reused as learner registration.

Record hand motion relative to the mat. At playback, transform it through the learner's newly measured mat pose. This accounts for translation, table-height changes and workspace rotation without resizing the motion. Keep the mat horizontal, preserve physical scale and part orientation, and require enough clear surface and comfortable reach. Different backgrounds and lighting must also be tested because they can affect tracking and visual coaching even when the transforms are correct.

**Add scene understanding to the plan:** a bounded MRUK milestone loads the learner's own Scene Model, evaluates table/room context and offers a workspace-placement check. It is supplementary to precise mat registration. A scene scan does not establish the starting layout of individual parts. Independently verify calibration and have the learner confirm the current layout against the recorded reference before starting; optional visual advice may flag an obvious mismatch but cannot certify the layout. See [scene and object feasibility](#scene-understanding-and-object-tracking-feasibility).

Arbitrary object tracking would benefit a later version by locating moved parts and supporting object-relative guidance. It is deferred because the user-selected first version preserves layout, not because tracking is unhelpful. If the bottle and cap move independently, a single workspace transform cannot adapt both paths: that requires object identity, orientation, source/destination relationships and explicit motion retargeting. A full room reconstruction alone does not provide those capabilities.

### Initial physical demonstration and transfer check

Choose a simple bottle with large removable parts for the primary run, then a different 3–5-step assembly using large LEGO-style pieces for the generality check. Use an empty bottle, loose forgiving connections, and visible checkpoints. Freeze exact parts after testing hand visibility. The following four-piece stand is an equivalent fallback and matches the storyboard; its shape must not become an application dependency.

Use a 50 × 35 cm rigid mat or tray with three labeled calibration marks, one verification mark, and outlined starting locations. Prepare four large, lightweight pieces with an obvious final silhouette:

| Step | Expert action | Visible endpoint | Initial matcher |
| --- | --- | --- | --- |
| 1 | Move the base from its outline to the center | Base in center | Dominant wrist over placement area |
| 2 | Insert a large support into the base | Upright support | Dominant wrist near support top |
| 3 | Place a crosspiece across the support | Crosspiece seated | Dominant wrist above crosspiece |
| 4 | Add a cap | Finished silhouette | Dominant wrist near cap |

Use loose, forgiving slots and large surfaces. The expert holds each checkpoint with their hand visible for approximately 0.5–1 second. Prefer a mostly one-handed task with the other hand unobstructed. Substitute equally large available objects immediately if this assembly is unavailable; freeze the exact task after the first physical test.

Use the same physical mat, part sizes, initial layout, and dominant hand for both people. Reset the pieces before every run. Mirroring a right-handed demonstration for a left-handed learner is deferred.

### Release tiers

| Tier | Required behavior | What may be absent |
| --- | --- | --- |
| Physical proof, H+4 | A real recorded hand movement replays on the calibrated mat | AI, semantic labels, automatic progression |
| Interactive proof, H+7 | A second person completes one step; tracking loss pauses correctly | Multi-step task and AI |
| Minimum demo, H+11 | Fresh recording produces 3–5 marked steps; learner completes them locally | Automatic segmentation, questions, haptics |
| Semantic integration, H+15 | Motion proposals plus narration become reviewed steps; save/reload works; Live voice and scene inspection integrated | Final visual polish and broader conversational topics |
| Quality target, H+18 | Polished ghost, ordered gates, hands-free GPT Live questions with fresh visual feedback, reviewed tutorials, finished review/spectator screens | Haptics, continuous video understanding, optional sponsor integrations |
| Stretch, only after core gates | Useful sponsor observability, separate eligible OMNI interaction, optional haptics, bounded event-driven spoken acknowledgments (one short commentary line on step completion, rate-limited, cut under pressure), optional auto-inspection on checkpoint hold | Never required to reach or complete a checkpoint |

The minimum demo is a recovery milestone, not the planned finish line. Explicitly marked steps and a skeleton renderer establish the pipeline early; automatic proposals, polished guidance, and contextual help remain scheduled target work. Any fallback and its effect on the delivered experience must be recorded. Manually edited labels do not satisfy the automatic semantic tutorial generation target.

### Explicit non-goals

No universal markerless object tracking, custom dense room/object reconstruction, guaranteed physical assembly verification, universal skill understanding, robotic planning, precision tool use, remote multiplayer, persistent cloud spatial anchors, user accounts, billing, custom hand-model rigging, or production store launch. A sideloaded native Android headset app is in scope. Bounded visible-state assessment, different-room transfer and an MRUK scene-understanding feasibility milestone are in scope. Automatically adapting to independently rearranged parts is deferred; the scene milestone must report its measured outcome and any missing capability. No dangerous tasks. No model-generated spatial coordinates or model-controlled progression.

### Definition of done

1. A newly recorded demonstration—not just a seeded fixture—can be saved, compiled, and played back.
2. A second person independently calibrates and completes the chosen 3–5-step task in a different room/on a different table, using the same objects and starting layout, without an operator advancing steps. Record held-out registration error and visible ghost alignment in both environments.
3. Learner speed may differ substantially from expert speed.
4. Tracking loss, session interruption, and reference-space reset do not falsely complete a step.
5. Once a tutorial is loaded, disconnecting AI or the server does not stop local guidance.
6. Spectators can understand the physical action and current guidance.
7. At least one non-builder completes the task with no step-by-step verbal coaching.
8. Claims distinguish motion matching, generated instructions, and actual observed physical outcome.
9. Target steps use ordered movement gates where the path matters; reaching the endpoint by skipping those gates cannot complete them.
10. Ghosts, labels, feedback, review controls, and spectator output pass an in-headset clarity review with the real task.
11. Automatic boundary proposals and GPT Live conversation work on a fresh recording, on the headset while hands/XR are active. The learner can interrupt and ask a follow-up without a push-to-talk requirement after explicitly starting conversation.
12. “Am I doing this right?” uses a fresh image and current reviewed step. Correct-looking, visibly wrong, and obscured/ambiguous placements produce appropriately different spoken feedback. No-image mode explicitly limits itself to instruction/movement evidence.
13. A second fresh bottle/LEGO-style tutorial runs through the same pipeline without code changes. Record differences in tracking, visibility, and coaching accuracy; two tasks demonstrate reuse, not universal validation.
14. Stale images, old attempts and delayed model replies never produce a current success message or change progression. Any missing voice/visual capability is a documented quality-target gap.

## 3. Platform research that changes the implementation

| Finding | Consequence | Evidence / validation boundary |
| --- | --- | --- |
| Meta supports Unity OpenXR; the Oculus XR provider is deprecated | Select one OpenXR provider; OVR-prefixed Meta components do not require enabling the obsolete provider | [Compatibility](https://developers.meta.com/horizon/documentation/unity/unity-and-openxr-compatibility/) |
| Meta's setup uses Unity 6.1+ and Universal 3D/URP with Android tooling | Start with Unity 6.3 as the candidate required by the researched WebRTC package; validate the complete package set | [Project setup](https://developers.meta.com/horizon/documentation/unity/unity-project-setup/) |
| Unity hand setup distinguishes OpenXR's 26 joints from the legacy 24-joint OVR skeleton | Choose OpenXR hand skeleton explicitly; map by name into Trail's 25-joint format, with explicit bone-axis conversion | [Hands setup](https://developers.meta.com/horizon/documentation/unity/unity-handtracking-hands-setup/) |
| Hand-bone position/rotation access and hand prefabs are documented | Build capture and a separate replay rig; cached visual transforms are not validity evidence | [Hand capture tutorial](https://developers.meta.com/horizon/documentation/unity/unity-tutorial-basic-hand-tracking/) |
| MRUK PassthroughCameraAccess supplies camera images, poses, intrinsics and timestamps | Obtain real source pixels without rendered ghost overlays; test frame freshness and view coverage | [Camera integration](https://developers.meta.com/horizon/documentation/unity/unity-pca-documentation/) |
| Native camera API supports Quest 3/3S, Horizon OS v74+ and camera permission | Verify installed OS, permission denial/recovery and actual frames; passthrough rendering alone does not pass | [Camera overview](https://developers.meta.com/horizon/documentation/unity/unity-pca-overview/) |
| Unity WebRTC 3.0.0 documents Unity 6000.3 and Android ARM64/IL2CPP | Candidate native audio transport; pin/test with Meta XR rather than assuming browser sample code works | [WebRTC requirements](https://docs.unity3d.com/Packages/com.unity.webrtc@3.0/manual/requirements.html) |
| GPT Live accepts audio/text; visual interpretation uses a separate backend | Preserve Live conversation plus image-capable Responses assessment, with stale-result rejection | [Visual context delegation](https://developers.openai.com/api/docs/guides/live-delegation#add-images-and-visual-context) |

Controllers support menus, calibration controls and recovery; they do not supply bare-hand skeletons. Put controllers down and prove bare-hand tracking during real assembly. Do not assume simultaneous controller/hand modes or hand visibility through held objects. General scene/plane/depth APIs do not provide arbitrary bottle/LEGO object recognition or physical-result verification.

The required visual-coaching source is the **Quest headset camera**. A paired workspace webcam may assist development or a disclosed reduced demo, but it does not pass the headset-first acceptance target. The native route replaces the earlier ten-minute browser-camera probe/webcam-default policy.

## 4. Stack and repository setup

### Package choices

Keep the current pnpm workspace intact and add a separate Unity project at `apps/quest/`. Desktop review, synthetic replay and spectator screens stay in `apps/web`; the headset does not run that site or a WebView. Do not downgrade Vite or install IWSDK/Spatial SDK. These are proposed changes, not installations performed by this document.

| Layer | Selection / version policy |
| --- | --- |
| Headset engine | Unity 6.3 (`6000.3.x`) Universal 3D/URP candidate; choose and commit one exact editor patch after compatibility checks |
| XR provider | Unity XR Plug-in Management and Unity OpenXR with required Meta feature groups; one provider, no legacy Oculus XR provider |
| Meta features | Meta XR Core, Interaction SDK and MRUK; resolve a compatible release family and commit exact UPM lock entries |
| Spatial UI / ghost | World-space Canvas + TextMeshPro, Interaction SDK UI; separate licensed hand mesh/rig with translucent material and pooled path geometry |
| Camera | MRUK `PassthroughCameraAccess`; one selected camera with bounded CPU readback for snapshots |
| Voice candidate | `com.unity.webrtc` 3.0.0, microphone PCM bridge and remote audio output; prove Android ARM64/IL2CPP interoperability with GPT Live |
| Native domain | C# `Trail.Contracts` and `Trail.Motion` assemblies with no UnityEngine/Meta/network dependency |
| Native JSON | IL2CPP-safe serializer decided in TRAIL-18: System.Text.Json source-generated contexts preferred, or Newtonsoft with link.xml/preserve attributes; strict DTO validation; T37 parses fixtures inside the APK, not just the Editor |
| Server / web | Preserve current Node/pnpm/TypeScript, Vite, Three.js desktop viewer, Fastify, Zod and installed test versions |
| Backend AI | Main server owns Live/transcription/labels; separate `apps/vision` owns image-capable Responses calls. Both use the existing Node/TypeScript stack and server-only credentials |
| Persistence | Unity application-private persistent files; Fastify atomic local files; optional browser cache for desktop views |
| Testing | Unity EditMode/PlayMode and Android build/smoke gates alongside existing Vitest/Playwright/pnpm gates |

Meta's v203 Core release notes require at least Unity 6000.0.66f2, while the researched WebRTC 3.0.0 page specifies 6000.3. This supports the editor-family candidate, not an already-tested combined dependency set. Freeze actual editor/OpenXR/Core/Interaction/MRUK/WebRTC versions in `ProjectVersion.txt`, `Packages/manifest.json`, `Packages/packages-lock.json` and a setup evidence note. Check asset licenses and package requirements at installation. Keep the independent `pnpm-lock.yaml`; Unity packages do not belong in it. [Core release notes](https://developers.meta.com/horizon/downloads/package/meta-xr-core-sdk/203.0/?view=full_width)

### Unity runtime boundary

| Responsibility | Framework supplies | Trail implements |
| --- | --- | --- |
| Tracking/rendering | OpenXR runtime, one Meta camera rig, passthrough layer | Permission/capability preflight, common tracking origin, lifecycle recovery, registration |
| Live hands | Meta tracked skeleton/validity and Interaction SDK controls | Current-observation adapter, named-joint mapping, source provenance, strict missing-hand handling |
| Recorded ghost | Meshes, skinning, materials, scene transforms | Separate pose-driven rig, rig-axis mapping, lookahead, gaps, checkpoint cues |
| Camera | MRUK source texture and capture metadata | Nonce-bound fresh snapshot, CPU copy/encoding, reference images and upload limits |
| Audio | Android mic and tested WebRTC package | Ring buffer/clock mapping, permissions, duplex playback, echo handling, session lifecycle |
| Domain | No SDK dependency | Calibration, matching, segmentation contracts and deterministic progression |

Use one Meta camera rig with a documented device-relative tracking origin; disable locomotion, teleport and snap turns. Put all live poses through one `NativePoseAdapter` and render the calibrated workspace against that same origin. Never fit calibration in one rig space and render in another. Any recenter, origin change, focus loss with uncertain tracking continuity, headset removal or app restart invalidates registration and clears partial dwell. The rig is not rescaled to fit a mat.

Choose one live hand provider in the first spike: Meta Core tracked `OVRHand`/`OVRSkeleton` with OpenXR skeleton selection is the initial candidate. Explicitly validate tracking and required joint data in the selected release; do not read a cached skin, controller-driven hand, Interaction SDK synthetic pose, or replay rig as recorded evidence. Inspect the actual update ordering and sample once per fresh tracking update. Use one ordered capture → canonical conversion → pure reducer → effects path. Rendering may refresh at headset cadence without crediting duplicated samples to dwell. No blanket claim that every bone transform carries an independent confidence flag.

Keep Unity/Meta objects outside serialized contracts. `Trail.Motion` gets numeric observations, validity, revisions and monotonic time; it has no MonoBehaviours, coroutines, file/network I/O or timers. `Trail.Runtime` owns those effects. A separate recorded ghost has its live tracking scripts removed/disabled; its explicit named-bone adapter handles bind rotations and missing intervals.

Use a small world-space step/voice card beside the mat. Add local Repeat/Pause/Resume/Check controls and captions with Meta Interaction SDK. Do not parent a large panel rigidly to the head. Schedule the bounded MRUK scene milestone after accurate ghost replay; defer physics, virtual grabbing and optional depth occlusion until the basic ghost is accurate and readable; real object assembly does not require simulated object physics.

### Target repository tree

~~~text
trail/
├── apps/
│   ├── quest/                         # NEW native Unity project
│   │   ├── Assets/Trail/
│   │   │   ├── Contracts/             # pure C# DTOs/validation, asmdef
│   │   │   ├── Motion/                # pure C# calibration/matcher/reducer, asmdef
│   │   │   ├── Runtime/
│   │   │   │   ├── XR/                # tracked hands, coordinates, lifecycle
│   │   │   │   ├── Record/            # motion capture/markers/narration
│   │   │   │   ├── Guide/             # state/effect integration
│   │   │   │   ├── Coach/             # native WebRTC/mic/playback/context
│   │   │   │   ├── Scene/             # MRUK frame acquisition
│   │   │   │   ├── Network/           # pairing, HTTP, WebSocket
│   │   │   │   └── Storage/           # private files, manifests, recovery
│   │   │   ├── Presentation/          # ghost, cues, UI scripts
│   │   │   ├── Prefabs/               # owned by feature owner
│   │   │   ├── Scenes/Trail.unity      # integration owns scene composition
│   │   │   ├── Editor/                # proposed build/check entry points
│   │   │   └── Tests/                 # EditMode/PlayMode fixtures
│   │   ├── Packages/                  # manifest.json, packages-lock.json
│   │   └── ProjectSettings/           # exact editor/settings/build profile
│   ├── web/src/                       # desktop review, fixture replay, spectator
│   ├── server/src/                    # routes, files, Live/labels, relay, session security
│   └── vision/src/                    # NEW separate service: image interpretation, limits, provider adapter
├── packages/contracts/src/           # Zod wire schemas / TypeScript types
├── packages/motion/src/              # existing math; offline authoring/reference logic
├── fixtures/                         # shared canonical JSON and expected results
├── scripts/                          # existing pnpm tooling; planned Unity build/test wrappers
├── docs/                             # plan, team, device and validation evidence
├── pnpm-lock.yaml                    # preserve web/server dependency set
└── data/                             # ignored private server media
~~~

**Dependency direction:** C# Contracts → no engine; C# Motion → Contracts/pure math; Unity runtime/presentation → both plus SDKs. TypeScript contracts → Zod only; TypeScript motion → contracts/pure math; web/server → shared packages. C# is the sole learner-runtime authority. TypeScript performs offline tutorial compilation and supports desktop diagnostics; it does not independently advance a live guide. Shared JSON fixtures and expected numeric results are the cross-language contract. Preserve the existing tests while porting; do not claim a TypeScript pass proves the C# implementation.

### Unity migration sequence, owned by integration and XR

1. Record the existing revision, manifests and passing-check baseline. Keep the web diagnostic and server working. Install Unity Hub/editor with Android Build Support, SDK/NDK/OpenJDK on the build machine; account/editor activation is a setup gate, not something pnpm supplies. Select the candidate editor patch only after checking the SDK/audio requirements. [Meta setup](https://developers.meta.com/horizon/documentation/unity/unity-project-setup/)
2. Create the Universal 3D project in `apps/quest`, add the selected packages, choose the Quest/Android build profile, OpenXR and ARM64/IL2CPP. Review Meta Project Setup Tool diagnostics. Set a stable application ID and version code; document the exact build settings. Do not add platform accounts, social features or store entitlement dependencies unless actually required by the chosen SDK setup.
3. Enable Visible Meta Files and Force Text serialization; commit `.meta`, scene/prefab assets, `ProjectSettings`, UPM manifests and locks. Ignore `Library`, `Temp`, `Obj`, `Logs`, `UserSettings`, build outputs, recordings, keys and signing secrets. Use Git LFS only for necessary licensed binary assets. Person 4 owns the main scene/settings/locks; feature owners supply separate prefabs to avoid concurrent scene edits.
4. Build the minimal passthrough scene with hands and a small world-space control. Install and run a standalone APK via ADB/MQDH. Verify the app can contact Fastify and return authenticated diagnostics. A desktop Editor play session does not pass this step.
5. Freeze native/wire schemas with Person 2. Implement the coordinate and skeleton adapters described in section 6, pure C# tests, raw capture and separate ghost. Preserve existing TypeScript fixtures and compare numerical results across both implementations.
6. Person 3 proves native WebRTC mic/output; Person 1 proves fresh MRUK frames. Integrate both into the same APK early. The WebRTC requirements include Android build and frame-pacing constraints: check these against Meta's settings and measure XR cadence; do not blindly apply contradictory recommendations. Failure to deliver duplex speech is a real blocker, not permission to claim a desktop call as headset success.
7. Add reproducible Unity test/build wrappers and CI when editor licensing is available. Keep current `pnpm check`, fixture and browser gates for the web/server. Proposed `check:quest`/`build:quest` wrappers do not exist yet; document exact commands once implemented. Produce EditMode/PlayMode XML and an Android build artifact; if CI cannot activate Unity, report that gap and retain a reproducible local build requirement.
8. Pass the joint hand/ghost/camera/voice device slice, then proceed with the dependency graph. Record tested package versions, build/commit and actual observations in `docs/validation.md`. Freeze one working APK plus server revision before expanding scope.

**Migration pass:** preserved web/server checks, pure C# fixture tests, reproducible native build/install, valid hand observations, one separate ghost, permission/restart cleanup, fresh headset images and actual duplex voice together. TRAIL-18 owns setup; TRAIL-04/16/17 supply the feature evidence. The rescaffold prepares native source/project files and candidate pins without installing Unity; editor resolution, C# compilation, native runtime integration and headset tests remain pending.

### Environment contract

~~~dotenv
# Proposed .env.example additions; each backend validates its own settings
HOST=127.0.0.1
PORT=3001
DATA_DIR=./data
AI_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_TRANSCRIBE_MODEL=whisper-1
OPENAI_TEXT_MODEL=gpt-4.1-mini-2025-04-14
LIVE_PROVIDER=mock
OPENAI_LIVE_MODEL=gpt-live-1
VISION_SERVICE_URL=http://127.0.0.1:3002
VISION_SERVICE_TOKEN=
VISION_HOST=127.0.0.1
VISION_PORT=3002
VISION_PROVIDER=mock
OPENAI_VISION_API_KEY=
OPENAI_VISION_MODEL=gpt-6-astra
SCENE_SOURCE=mock
# Planned live scene choices: quest-camera or workspace-webcam
# Visual assessor: gpt-6-astra at low reasoning effort; gpt-4.1-mini is the documented fallback
OMNI_API_KEY=
OMNI_BASE_URL=
OMNI_MODEL=
SENTRY_DSN=
SENTRY_ENABLED=false
HAPTICS_DRIVER=mock
HAPTICS_SERIAL_PORT=
DEMO_PAIRING_SECRET=
~~~

Load `.env` explicitly in server startup; Vite's env loading does not configure a separately started Node process. Set mock providers by default. No provider key belongs in `VITE_*`, a browser bundle, Unity assets/Resources/StreamingAssets, an APK or a native client config. Camera frames, raw narration, API keys, and full hand recordings stay out of logs and source control unless a small test fixture was deliberately consented and approved for inclusion.

Vision listener/token/URL and mock-mode settings are implemented by the service skeleton; Live/scene/provider settings remain proposed. `OPENAI_VISION_API_KEY` is consumed only by `apps/vision`; `VISION_SERVICE_TOKEN` authenticates main-server calls to it. Local development may use keys from the same OpenAI project, but the service boundary must not forward provider credentials in requests. The development launcher and check/build scripts now include the vision skeleton; it reports image interpretation as unimplemented. Mock mode must be labeled in the UI and cannot satisfy live acceptance. The integration owner adds configuration validation and pins a Live-capable SDK with the voice owner; no unrelated dependency upgrades are needed.

### Device connection and runtime validation

1. Charge the confirmed Quest 3S, enable hand tracking/developer mode, connect a data-capable USB cable and accept the debugging prompt. Record Horizon OS, app ID/version, editor and SDK versions; browser version is relevant only to desktop/browser diagnostics.
2. Build and install the standalone Android ARM64 APK with Unity/MQDH/ADB. `adb devices` must report an authorized device. Use the official hand and CameraViewer samples to isolate capability failures from Trail adapters. On macOS, plan to test via installed APKs; do not make the workflow depend on Windows-only PC Link tooling.
3. For the wired development data path, start Fastify on its actual port (currently 3001), run `adb reverse tcp:3001 tcp:3001`, and configure the development app endpoint as `http://127.0.0.1:3001`. This is a native HTTP route, not a browser secure-context/XR permission trick. Enable cleartext only for loopback in a development Android network-security configuration; release/untethered builds use a trusted HTTPS/WSS endpoint. No global certificate bypass.
4. Pair the app with a short-lived code to obtain a scoped native bearer token. The browser UI retains its same-origin cookie path. Check authentication on every HTTP/WS connection; see section 6. A native client need not send Origin, so absence of Origin is never sufficient authentication.
5. Request Android microphone and headset-camera permissions visibly. Recheck permission/focus after return from OS dialogs. Start passthrough, bare-hand tracking and local UI; test denial/retry, removal/recenter, suspend/resume and app restart. Registration and partial dwell cannot survive an uncertain origin change.
6. Use ADB/logcat and Unity profiling with bounded metadata-only diagnostics. Prove real fresh frames, hand gaps, actual audio output and concurrent casting. Retain no raw media/secrets in logs.
7. For untethered use, configure the authenticated HTTPS/WSS API explicitly and test network reachability/voice ICE behavior. Treat a phone hotspot as the known-good demo network; venue Wi-Fi is unproven for ICE — rehearse on both. A tunnel reaches the server but does not install or run the Unity app. Do not expose unpaired scaffold endpoints. Verify the exact release build and network before the demo.

**Setup pass:** a second teammate can restore both dependency sets, run the implemented checks, build/install the APK, pair it, and operate passthrough/hands while reaching the server. The desktop fixture remains a separate useful diagnostic. Until native setup is implemented, README commands continue to describe only the existing scaffold.

## 5. Component ownership and end-to-end data flow

~~~mermaid
flowchart LR
  H[Quest hand poses and narration] --> C[Workspace calibration and recorder]
  C --> L[Local recording cache]
  L --> B[Fastify file storage]
  B --> S[Deterministic step boundaries]
  B --> A[Transcription and semantic labels]
  S --> T[Validated tutorial]
  A --> T
  T --> R[Expert review and local preload]
  R --> G[Local guide state machine]
  H --> G
  G --> V[Ghost path and checkpoint feedback]
  G -. sampled events .-> D[Spectator and telemetry]
  G -. current step and movement evidence .-> Q[Fastify coaching coordinator]
  Mic[Quest microphone and speaker] <-->|WebRTC audio| Live[GPT Live voice agent]
  Live <-->|trusted sideband and delegation| Q
  Camera[Quest MRUK camera] -->|paired fresh-frame upload| Q
  R -->|reviewed step and expert images| Q
  Q -->|authenticated bounded request and images| Vision[Separate apps/vision backend]
  Vision -->|image inputs| Model[Image-capable Responses model]
  Model -->|structured assessment| Vision
  Vision -->|validated visible findings| Q
  G -. bounded pulses .-> P[Optional haptic relay]
~~~

### Record flow

1. Preflight permissions, enter AR, calibrate, and verify a held-out mark.
2. Start audio, establish a monotonic recording clock, then start motion capture. Show a visible recording state.
3. Sample fresh named hand observations through the Unity native adapter, convert to canonical reference/workspace coordinates, and append bounded buffers at 30 Hz. Render/match at headset cadence without reusing an observation for dwell; never record cached visuals, controller proxies or simulated input as physical capture.
4. Record missing hands as missing; record explicit step markers and tracking-gap intervals. Never fill gaps with stale poses.
   During authoring, also capture the starting layout plus stills at explicit step markers and checkpoint holds (roughly 6–10 per recording; a sparse ~0.2 Hz periodic capture may supplement but is not required). Keep frame-delivery timestamps, source identity and the associated motion-time interval/uncertainty; use request/ack markers for a separate webcam clock. After automatic segmentation, select clear reference images from these captured states. If a relevant state was missed or its timing is ambiguous, require an explicit recapture/review rather than inventing it. Capture limits produce a visible failure, not silent loss.
5. Stop capture, drain the bounded native audio buffer and finalize its WAV header, persist the complete local recording, and upload motion metadata and audio separately.
6. The upload is complete only when the manifest, frame data, and required assets validate. A failed upload can be retried without repeating the demonstration.

### Processing flow

1. Validate the recording, produce deterministic step windows, and reject windows without usable start/end samples.
2. Transcribe narration; align words/segments to the same motion timeline using the stored audio offset.
3. Ask the model only for labels/instructions associated with existing segment IDs. Deterministic code owns frame ranges, poses, tolerances, and completion rules.
4. Produce a draft tutorial, display any missing narration or tracking gaps, and let the expert review boundaries, active hand, and instructions.
   Select a starting-layout image and a clear expert checkpoint image for each step from the authoring capture; review its visible outcome description and timing association. Bind assets to the actual recording and reviewed segment revision, then prune unselected stills. They provide task-specific evidence without task-specific code. Never substitute a reference from another tutorial or assume earlier physical states can be photographed after assembly without repeating them.
5. Finalize an immutable tutorial version and preload its recording, instructions, and assets into the learner client.

### Guide flow

Reset parts → enter AR → calibrate → verify → preload → show one movement → arm start gate → track learner attempt and required ordered gates → dwell at checkpoint → advance exactly once. A repeat replays the current step and invalidates pending asynchronous responses. The Unity headset client remains the sole progression authority.

### Conversation and inspection flow

The learner explicitly starts GPT Live conversation once, then asks naturally while using their hands. General questions use the reviewed tutorial and current movement state. Physical-correctness questions trigger a fresh image request and comparison with that step's reviewed expert reference. The main server forwards current images and context to the separate vision backend, checks its returned evidence against the still-current attempt, and supplies validated findings to GPT Live for a short spoken answer and a follow-up if the view is unclear. Captions and evidence source remain visible.

When an inspection is admitted, the headset acknowledges its exact step/attempt and locally pauses the guide, clearing partial dwell. This keeps the question about the same step; the learner can Resume or Repeat locally afterward. An explicit resume, repeat, new step, new question, recalibration or session restart invalidates outstanding inspection work. Routine conversation does not pause motion. Neither a favorable assessment nor speech automatically completes/resumes a step. This is not mandatory confirmation after every checkpoint.

The agent adapts wording, explanation detail, and a suggested next action. Replay/slower-preview suggestions use existing controls and recorded motion. No model-generated coordinates, tolerance changes, arbitrary commands or “advance” permission. See [GPT Live implementation](#gpt-live-conversation-and-fresh-visual-coaching) for transport and evidence rules.

### Spectator and haptic flow

The headset sends low-rate state snapshots and optionally downsampled poses to the backend. The laptop renders a schematic scene and step progress. Casting or an external webcam provides the real-world context. Haptics, if added, consume a separate bounded feedback event; failures cannot affect the matcher.

## 6. Shared contracts to freeze before parallel implementation

Keep wire schemas in `packages/contracts` and infer TypeScript types from them. Implement equivalent strict C# DTO validation in `Trail.Contracts`; Zod does not execute inside Unity. Validate shared fixtures in both languages, including required fields, enum/union cases, bounds and unknown versions. Use an IL2CPP-safe serializer and test the actual Android build. The examples below specify the intended interface; they are not compiled source. Version the external format independently of internal helper types.

### Coordinate and time conventions

- All positions/distances are meters; all internal angles are radians; all recording times are milliseconds.
- Right-handed workspace: +X to the learner's right, +Y above the mat, +Z toward the learner; the far edge is −Z.
- Quaternions use normalized `[x, y, z, w]`. A pose quaternion maps joint-local axes into its containing frame. `q` and `−q` represent the same orientation.
- A rigid transform is named by its direction: `referenceFromWorkspace`. Prefer position/quaternion serialization; if matrices are serialized later, use column-major order.
- Recording `tMs` uses one native monotonic clock relative to capture start, never a server receipt time. Store actual timestamps, not frame index divided by nominal Hz.
- Frame ranges are half-open: `[startFrame, endFrameExclusive)`. Checkpoint frames must lie inside them.
- Store explicit validity; zero position is a valid coordinate, not a missing-data sentinel.

~~~ts
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Side = "left" | "right";
// JointName is the literal union of the 25 WebXR skeleton names.
// Preserve the canonical v1 25 names; native OpenXR adds a palm that is not serialized in v1.
type JointName = typeof JOINT_NAMES[number];

interface Pose {
  positionM: Vec3;
  orientationXyzw: Quat;
}

type HandSample =
  | { status: "missing"; reason: "unavailable" | "nonfinite" | "jump" }
  | { status: "valid"; joints: Record<JointName, Pose> };

interface MotionFrame {
  tMs: number;
  hands: Record<Side, HandSample>;
  head: Pose | null; // optional diagnostic, also workspace-relative
}

interface WorkspaceDefinition {
  id: string;
  version: 1;
  widthM: number;
  depthM: number;
  calibrationMarksM: { A: Vec3; B: Vec3; C: Vec3; D: Vec3 };
  layoutId: string;
  dominantHand: Side;
  calibrationMethod: "three-point-index-tip-v1";
}

interface Calibration {
  id: string;
  referenceSpaceType: "native-device"; // planned Calibration v2, not a WebXR local claim
  trackingSessionId: string;
  originRevision: number;
  referenceFromWorkspace: Pose;
  sampledReferencePointsM: [Vec3, Vec3, Vec3];
  verificationErrorM: number;
  valid: boolean;
}

interface AudioAsset {
  assetId: string; // durable ID resolved via storage, never a blob: URL
  mimeType: string;
  durationMs: number;
  audioStartOffsetMs: number;
  syncMethod: "unity-dsp-clock-map" | "media-recorder-start" | "manual-markers"; // versioned audio metadata
  estimatedSyncErrorMs: number | null;
}

interface StepMarker {
  id: string;
  tMs: number;
  kind: "step-start" | "step-end";
  source: "expert-control" | "operator-control" | "review";
}

interface Recording {
  schemaVersion: 1;
  id: string;
  coordinateFrame: "workspace";
  workspace: WorkspaceDefinition;
  jointOrder: JointName[];
  nominalSampleHz: 30;
  durationMs: number;
  frames: MotionFrame[];
  markers: StepMarker[];
  audio: AudioAsset | null;
  source: "live" | "synthetic-fixture" | "recorded-fixture";
}

interface MotionGate {
  frameIndex: number;
  positionM: Vec3;
  toleranceM: number;
  dwellMs: number;
}

interface HandTarget {
  side: Side;
  joint: "wrist";
  startPose: Pose;
  checkpointPose: Pose;
  positionToleranceM: number;
  orientationToleranceRad: number | null; // disabled by default
  gesture: "any" | "pinch" | "open"; // "any" for baseline
  motionGates: MotionGate[]; // ordered intermediate gates, derived from recording
  pathCorridorM: number; // visual correction threshold; tune on device
}

interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  startFrame: number;
  endFrameExclusive: number;
  checkpointFrame: number;
  targets: HandTarget[]; // unique active hands, at least one
  dwellMs: number;
  startDwellMs: number;
  completionMode: "path-and-pose" | "pose-match" | "user-confirmed";
  narrationSpanIds: string[];
}

interface Tutorial {
  schemaVersion: 1;
  id: string;
  revision: number;
  recordingId: string;
  recordingHash: string;
  workspace: WorkspaceDefinition;
  status: "draft" | "ready";
  steps: TutorialStep[];
  provenance: {
    segmentation: "explicit-markers" | "motion-proposals";
    labels: "model" | "manual" | "fallback";
    model: string | null;
    promptVersion: string;
  };
}

interface TranscriptSpan {
  id: string;
  startMs: number; // already converted to recording time
  endMs: number;
  text: string;
}

interface GuideContextRef {
  runId: string;
  tutorialId: string;
  tutorialRevision: number;
  stepId: string;
  stepRevision: number;
  attemptId: string;
}
interface StepSceneReference {
  id: string;
  recordingId: string;
  recordingHash: string;
  tutorialId: string;
  tutorialRevision: number;
  stepId: string;
  assetId: string;
  source: "quest-camera" | "workspace-webcam";
  visibleOutcome: string; // expert-reviewed; no hidden mechanical claims
}
interface InspectionRequest extends GuideContextRef {
  requestId: string;
  liveSessionId: string;
  sessionGeneration: number;
  requestEpoch: number;
  delegationId: string | null; // null for app-initiated Check placement
  question: string; // assembled from transcript; never a trusted instruction
  referenceIds: string[];
}
interface SceneObservation {
  id: string;
  requestId: string;
  captureNonce: string; // server-issued, single use
  sourceSessionId: string;
  source: "quest-camera" | "workspace-webcam";
  assetId: string;
  sourceFrameSeq: number; // advances on delivered camera frames, not repeated texture reads
  captureAgeAtSendMs: number; // measured on the source's monotonic clock
  receivedAtServerMonoMs: number; // assigned by server, not client
}
interface CoachAssessment {
  verdict: "visible-match" | "adjustment-needed" | "uncertain" | "motion-only";
  observedEvidence: string[];
  limitation: string;
  feedback: string;
  suggestedAction: "none" | "show-another-view" | "replay" | "slower-preview";
}
interface InspectionResult {
  request: InspectionRequest; // server binds identity; model does not generate it
  observationId: string | null;
  referenceIds: string[];
  assessment: CoachAssessment;
  provenance: "model" | "fallback" | "mock";
}
~~~

`Calibration` belongs to the current XR session; it is not reusable across headset restarts. A recording may retain calibration diagnostics for debugging, but its portable motion remains workspace-relative.

**Native compatibility contract.** Preserve the implemented v1 canonical motion shape and 25 named joints. Use a versioned runtime/capture sidecar for provider, editor/SDK versions, OpenXR skeleton selection, origin/session identity, adapter version, clock mapping and confidence policy. The proposed Calibration v2 and audio metadata additions above must not be silently accepted as old strict schemas; document migration and retain legacy import fixtures.

Unity uses a left-handed engine basis. At the adapter boundary reflect Z: `C = diag(1,1,-1)`, `pCanonical = C * pUnity`, `RCanonical = C * RUnity * C`. For the same local basis this maps quaternion `(x,y,z,w)` to `(-x,-y,z,w)` up to sign. Normalize and round-trip test; do not negate just a position and leave orientation unchanged. Bone-local conventions may differ independently: explicit per-joint basis corrections and bind-pose offsets belong in the versioned rig adapter. Only after reference conversion apply the rigid `workspaceFromReference` transform. Playback uses the inverse conversion. Reflection belongs in this adapter, never in the calibration fit, which remains a proper rotation without scale.

Select Meta's OpenXR 26-joint skeleton. Map wrist and all finger joints by explicit semantic names into the existing WebXR-derived 25-joint order, excluding the extra palm. Never copy array indices or accidentally use the legacy OVR 24-joint skeleton. Required missing joints invalidate that canonical hand sample; an extra native palm does not justify inventing missing finger data. Test each finger, both sides, a known wrist rotation and translated/rotated workspaces. Store actual provider provenance separately from the portable poses.

Use one injected monotonic millisecond clock for motion/guide state; map Unity DSP sample positions and MRUK camera timestamps to that epoch using measured offsets/uncertainty. Do not equate scaled `Time.time`, DSP seconds, sensor nanoseconds and server time. Recalibration/recenter increments origin revision and invalidates outstanding observations. Simulator/editor fixtures stay explicitly synthetic.

Use a discriminated schema for guide state and events; never expose `payload: unknown` as the final runtime contract:

~~~ts
type GuidePhase =
  | "preloading" | "calibrating" | "showing" | "waiting-start"
  | "guiding" | "holding" | "tracking-lost" | "paused" | "complete";

interface GuideSnapshot {
  phase: GuidePhase;
  tutorialId: string;
  tutorialRevision: number;
  stepId: string | null;
  stepRevision: number;
  attemptId: string | null;
  dwellProgress: number; // [0, 1]
  pathProgress: number; // [0, 1]; cue progress, distinct from completion evidence
  nextGateByHand: Partial<Record<Side, number>>;
  calibrationValid: boolean;
  tracking: Record<Side, "valid" | "missing">;
}
interface EventEnvelope {
  schemaVersion: 1;
  sessionId: string;
  runId: string; // new on every guide start; independent of tutorial ID
  seq: number; // strictly increasing within run
  tMs: number; // run-local; not compared across devices
}
type GuideEvent = EventEnvelope & (
  | { type: "snapshot"; state: GuideSnapshot }
  | { type: "step-completed"; stepId: string; attemptId: string;
      evidence: "path-and-pose" | "pose-match" | "user-confirmed" }
  | { type: "tracking-changed"; state: GuideSnapshot }
  | { type: "guide-ended"; reason: "completed" | "cancelled" }
);
~~~

**Validation invariants:** finite tuples; unit quaternions within a documented tolerance; exact joint names/order; strictly increasing frame timestamps; bounded duration/count/size; valid, non-overlapping step ranges; active-hand data at start/checkpoint; unique IDs; workspace/layout identity; audio offset within a plausible bounded interval; no unknown schema version. Reject semantically invalid model output even when it parses as JSON.

**Contract freeze:** integration owns shared schemas. Propose changes with a fixture and migration note; coordinate before merging. All four workstreams start from the same synthetic recording/tutorial/event files.

The scene/Live types above are new planned contracts. Keep scene assets in a versioned sidecar manifest keyed to recording hash and tutorial revision; do not silently add fields to the implemented strict `RecordingSchema` v1. Add synthetic reference/inspection fixtures and document sidecar versioning in `docs/contracts.md` when implemented. A step-boundary edit invalidates its reviewed references until reapproved. The model returns only `CoachAssessment`; the server supplies identities, source, age and provenance. Neither `visible-match` nor `motion-only` is a completion event.

### Pure motion API

The signatures below are language-neutral pseudocode. Implement the learner engine in pure C#; retain matching TypeScript offline helpers only where server authoring or diagnostics need them. Shared expected-result fixtures cover their overlap.

~~~text
calibrateWorkspace(points, matDefinition): CalibrationResult
transformPose(pose, transform): Pose
proposeSegments(recording, options): SegmentProposal[]
buildCheckpoint(recording, segment, activeHands): CheckpointResult
buildMotionGates(recording, segment, activeHands): MotionGateResult
initialGuideState(tutorial): GuideState
reduceGuide(state, input, nowMs): { state: GuideState; effects: GuideEffect[] }
~~~

No timers inside the reducer; callers supply time and observations. Effects are typed suggestions such as replay/step-completed/stop-feedback. Rendering, network, audio playback, and hardware adapters execute them outside the pure package.

### HTTP and WebSocket interfaces

| Interface | Request / response | Owner and failure behavior |
| --- | --- | --- |
| `GET /api/health` | Build ID, mock/live provider flags, storage writable status | Integration; no secrets |
| `POST /api/pair` | Short-lived pairing code → browser session cookie or scoped native bearer token | Integration; rate-limited; do not expose APIs unauthenticated through a tunnel |
| `POST /api/recordings` | Validated manifest → server-generated recording ID | Integration; draft/incomplete until committed |
| `PUT /api/recordings/:id/motion/:chunk` | Ordered frame chunk, hash; retry replaces identical content only | Integration; ≤2 MiB/chunk, conflict on differing retry |
| `POST /api/recordings/:id/audio` | Binary multipart asset | Voice/integration; explicit size/MIME limits |
| `POST /api/recordings/:id/finalize` | Expected asset hashes/counts → finalized recording | Integration; atomic publish, reject missing assets |
| `GET /api/recordings/:id` | Manifest plus authorized asset URLs | Integration; complete recordings only for guide |
| `POST /api/tutorial-jobs` | Recording ID/hash + validated segment manifest (or explicit-marker policy) + segmentation revision → `202` job ID | AI; one active compile per recording revision |
| `GET /api/tutorial-jobs/:id` | queued/running/ready/failed/cancelled and typed reason | AI; visible progress, bounded retry |
| `GET /api/tutorials/:id` | Immutable versioned tutorial | Integration; schema-validated |
| `PATCH /api/tutorials/:id/draft` | Base revision + reviewed step boundaries/active hands/instructions → updated draft revision | Integration; validate edits, recompute targets, reject conflicting revisions |
| `POST /api/tutorials/:id/finalize` | Reviewed draft revision → ready version | Integration/AI; reject stale edits |
| `POST /api/live/sessions` | Paired learner's SDP offer + run identity → session ID/generation and SDP answer | Voice; server chooses model/config, one active session per learner, idempotent start and typed unavailable result |
| `DELETE /api/live/sessions/:id` | Owner-scoped graceful close → closed or finalization-incomplete | Voice; cancel jobs, bounded cleanup, no leaked mic/session |
| `POST /api/scene-observations` | Paired source uploads requested nonce + metadata + bounded image → observation ID | Integration; bind request purpose to authoring recording or learner inspection; reject unsolicited, duplicate-conflicting, old-source or late captures |
| `POST /api/tutorials/:id/scene-references` | Draft revision + reviewed scene assets/descriptions → versioned sidecar | Integration; same draft/revision and asset validation as tutorial edits |
| `WS /ws` | Role-scoped guide context, scene capture request/ack, inspection status, spectator snapshots | Integration; camera role only answers authorized capture requests; spectator is read-only |

Generate IDs server-side; do not interpolate supplied paths into filenames. Browser routes require same-origin cookies plus strict Origin checks, including WebSocket upgrade. Native routes require a short-lived role/session-scoped bearer token on HTTP and the WebSocket handshake; absence of Origin never bypasses authentication. Reject present unexpected Origins, expired tokens and role mismatches. Do not put tokens in URLs/logs. Keep native tokens in memory and re-pair after restart for the demo. Pairing codes are short-lived, single-use and rate-limited. TLS is required off the explicitly configured USB loopback development path. Spectators cannot advance the guide or request arbitrary camera frames. This is one paired demo session, not an account system.

Freeze a `TutorialDraftEdit` schema containing `baseRevision` and an ordered list of `{ id, startFrame, endFrameExclusive, checkpointFrame, activeHands, completionMode, title, instruction }`. The server validates ranges/IDs, recomputes start/checkpoint targets and ordered motion gates from the recording, and invalidates affected narration associations/labels for review. Gate indices must increase inside the step range and reference valid active-hand observations; `path-and-pose` requires at least one reviewed intermediate gate. The client never submits authoritative computed coordinates. Only drafts can be patched; finalization publishes an immutable snapshot. Later edits create a new draft/version. Bind compile results to the segmentation revision so a delayed job cannot overwrite newer edits.

Register the Fastify WebSocket plugin before its routes, attach handlers synchronously, and validate every message after upgrade. Relay state changes immediately, downsample spectator poses to about 10 Hz, bound the send queue, and drop obsolete pose updates. On reconnect, request a full snapshot; ignore older `runId/seq` data. Never send the full recording over WebSocket. [Fastify WebSocket plugin](https://github.com/fastify/fastify-websocket)

## 7. Calibration, capture, and guidance algorithms

### Reusable workspace calibration

Label mat corners A near-left, B near-right, C far-left, and D far-right. Freeze their workspace coordinates in `WorkspaceDefinition`: A=[0,0,0], B=[widthM,0,0], C=[0,0,−depthM], D=[widthM,0,−depthM]. Width/depth denote measured distances between the marks. The `layoutId/version` identifies this geometry; D is used only for verification. Sample each with the index tip held steadily for 300–500 ms; use a median and show a stability indicator. Consistent fingertip posture matters: the reported tip center is not guaranteed to be the surface contact point.

~~~text
origin = A
x = normalize(B - A)
y = normalize(cross(x, C - A))
z = cross(x, y)
referenceFromWorkspace = rigidTransform(columns = [x, y, z], translation = A)

recordedPosition = inverse(referenceFromWorkspace) * referencePosition
recordedOrientation = inverse(referenceFromWorkspace.rotation) * referenceOrientation

learnerReferencePosition = learnerReferenceFromWorkspace * recordedPosition
learnerReferenceOrientation = learnerReferenceFromWorkspace.rotation * recordedOrientation
~~~

This is a proposed rigid registration algorithm, not automatic spatial understanding. Normalize/orthogonalize the basis; never scale the recording to fit noisy samples.

Initial calibration gates to tune on the device:

- At least 20 cm separation between fit marks; reject near-collinear input.
- Approximately ≤1 cm sampling spread; mat edge lengths agree within 2 cm.
- Computed upward axis agrees with the XR reference-space vertical and the expected point order. Reject flipped axes.
- Use a **fourth mark D**, not used in fitting, to measure transferred alignment. Aim for ≤2 cm independent check error and repeat after a 90° rotation and session restart.
- Abort/retry calibration if the tray moves. On native recenter/origin change, app suspension/end, or suspicious scene jump, clear calibration and dwell, stop feedback, and require re-registration.

If two people cannot reproduce alignment within roughly 2–3 cm, enlarge geometry and improve mark sampling before changing matcher tolerances. Do not hide calibration failure with a huge acceptance radius.

### Scene understanding and object tracking feasibility

These are separate capabilities with different evidence requirements:

| Capability | Value for Trail | Scope and feasibility |
| --- | --- | --- |
| Workspace registration | Transfers a recording to a new room/table | Required now; independent rigid mat calibration plus held-out error and real transfer tests |
| MRUK Scene Model and room mesh | Gives local surfaces and coarse room context for placement review | Planned bounded milestone; use current learner-room data and verify coverage/freshness. Geometry must not replace the fine calibration gate |
| Environment depth | Can improve ghost occlusion and surface raycasts | Optional visual experiment; current Meta docs support Quest 3S. Benchmark with hands, camera and voice running; depth alone provides neither object identity nor persistent reconstruction |
| Object detection/localization | Helps point out a visible bottle or potential misplaced part | Useful experiment, not arbitrary part tracking. Meta's sample uses YOLOv9's 80 COCO categories with depth-based localization; a box/position does not supply full part orientation or assembly state |
| Persistent object pose tracking | Could adapt guidance when individual parts move | Later capability: identify the specific instance, estimate position/orientation, survive occlusion and report ambiguity. A spatial anchor marks a place; it does not automatically follow the object |
| Detailed object reconstruction | Could provide geometry for pose estimation and contact-aware guidance | Separate research effort; not needed for the confirmed same-layout transfer. Mesh geometry still needs task semantics and validated alignment |

Evidence: [Meta Scene Model](https://developers.meta.com/horizon/documentation/unity/unity-scene-build-mixed-reality/), [Scene best practices](https://developers.meta.com/horizon/documentation/unity/scene-best-practices/), [Quest 3S Depth API](https://developers.meta.com/horizon/documentation/unity/unity-depthapi-overview/), [object detection sample](https://developers.meta.com/horizon/documentation/unity/unity-sample-camera-object-detection/).

**MRUK implementation milestone (TRAIL-19):** load the current local Scene Model with permission handling, confirm that it describes the occupied room, and let the user select/confirm the working surface and clear mat placement. Inspect available planes/mesh in a diagnostic view. Meta describes the room mesh as coarse and static between Space Setup captures; fine part geometry and moved objects must not be inferred from it. If the room or furniture has changed, offer recapture. A stale, unavailable or wrong-room scene must be labeled and excluded from placement claims. A development prefab/JSON scene is synthetic and cannot pass device acceptance. Manual workspace setup remains available and must explicitly disclose that scene assistance is unavailable.

Use one authoritative tracking-origin conversion for hands, cameras, scene geometry and the mat. If MRUK world locking is enabled, coordinate its TrackingSpace adjustments with the existing rig/calibration adapter; do not let two systems independently move the origin. An unaccounted origin change invalidates registration and dwell. Verify alignment again after scene reload/recenter. Room context is advisory: it cannot move checkpoints, scale the tutorial, certify obstacle clearance or advance the guide.

The required deliverables are the cross-room transfer result and a recorded MRUK feasibility decision: permissions, actual geometry, stale/missing-room behavior, measured alignment and frame cost. Enable scene-assisted placement in the release only after those checks pass. If it fails, report the feature gap and retain independently calibrated transfer; do not claim reconstruction was delivered. Do not add this work by silently resetting the original deadline or removing voice/camera acceptance.

**Future object-aware architecture:** keep workspace-relative v1 recordings intact. A later versioned sidecar can describe tutorial-specific object IDs, reviewed reference images, optional measured geometry and phase-specific source/target bindings. Providers return timestamped poses with explicit coordinate frame, tracking status, uncertainty and origin revision; manual registration, markers and markerless trackers can implement the same boundary. User-supplied reference data is legitimate onboarding, not task-name hardcoding. Missing, stale or symmetric/ambiguous poses pause dependent guidance rather than fabricating coordinates.

Before accepting rearranged layouts, define pickup versus transport versus destination frames; do not attach the entire hand trajectory to the carried object's live pose, which can make the target chase the learner. Retargeting and path-clearance validation need their own algorithm and acceptance gates. This is a future contract direction, not permission to change the current matcher or let a language model generate coordinates.

Generalized pose estimation is technically plausible: [FoundationPose](https://github.com/NVlabs/FoundationPose) supports novel objects supplied through CAD models or reference images. Its reference implementation requires a substantial GPU/software pipeline; it is not a drop-in Quest tracking API. Evaluate actual sensors, model inputs, available compute, latency, occlusion recovery and rotational ambiguity before selecting it. No GPU service or model dependency is added by this plan.

### Motion capture and rendering

Use the [Unity runtime boundary](#unity-runtime-boundary). Read live provider observations against the one tracking origin and immediately convert numeric data to canonical coordinates. Begin each sampling tick with both hands missing, then fill only current validated hands. Preserve raw validity and explicit timestamps; confidence policy is frozen after real-task trials. Keep a flat numeric buffer and serialize outside the render hot path.

Handle application focus/pause, headset removal, tracking-origin/recenter events and scene teardown outside the sample loop too: frames may stop during suspension. Stop dwell and admission immediately, invalidate calibration when tracking continuity is uncertain, mute voice and release owned camera/audio/network resources. Resume reacquires permissions/resources and requires recalibration. Unsubscribe once; repeated scene loads must not create duplicate recorders, rigs or audio sinks.

Capture 30 Hz for at most 120 seconds. Matching/rendering continue at headset cadence. Store both hands when available even if only one is active. Persist invalid samples and stop with a clear error on buffer exhaustion. Never silently truncate or invent samples across a gap.

Start with a diagnostic skeleton, then drive a separate licensed skinned hand asset from recorded canonical poses. Resolve named bones, bind rotations and local/world transforms in a tested adapter. Remove live-tracking components from the ghost. Hide duplicate live visual meshes only when needed for legibility, while keeping the real tracking source active. Meta SDK assets are not a promise that arbitrary recorded poses can be assigned without rig conversion. [Hand setup](https://developers.meta.com/horizon/documentation/unity/unity-handtracking-hands-setup/)

Interpolate valid positions and quaternion orientations, preserve original timestamps, and hide the ghost across missing intervals. Use pooled geometry/materials and profile on the Quest 3S. Visual quality must fit the frame budget; avoid per-frame allocations and effects that obscure the physical task.

Show the expert motion once, then use learner progress to position a subtle ghost cue slightly ahead along the demonstrated path. Estimate that progress in a bounded neighborhood of the previous path position so crossing or looping paths cannot jump to their end. The learner can pause or move slowly without the ghost running away. “Again” restarts the demonstration without completing or skipping the physical step.

### Interaction and visual quality

- Keep the action area readable: one active ghost, a short path cue, one checkpoint, and concise step text placed beside the task.
- Use distinct styling for the expert ghost and learner feedback. Encode state with labels/shapes as well as color; fade completed path segments and avoid flashing error states.
- Apply visual smoothing without hiding invalid tracking or adding noticeable lag. Completion uses fresh validated observations, independently of cosmetic smoothing.
- Use comfortable, stable 3D controls for Repeat, Pause, and Help; avoid system-reserved gestures. Check text size and contrast inside passthrough on the actual headset.
- Build a review timeline with boundary handles, playback/scrubbing, narration, and clearly visible active-hand/target settings. Surface uncertain proposals for correction.
- Give spectators a composed view of the physical task, ghost movement, current instruction, and progress. Hide developer diagnostics from the demonstration view.

Person 1 owns in-headset visual quality; Person 4 owns review/spectator quality. Review both at H+11 and H+18, with measured rendering performance and a learner performing the real task.

### Step authoring and segmentation

Bootstrap and fallback: one continuous recording with explicit start/end markers for each step. The expert holds the active hand at the natural action start for at least 200 ms, marks Start, performs the movement, holds the visible end checkpoint for 500–1,000 ms, and marks End. Use the other hand for a large non-system 3D control where practical. An operator keyboard marker is acceptable **during capture** if headset controls are awkward; record that provenance. The learner's later progression is automatic.

Capture `startPose` from the stable hold at the **beginning** of that action and `checkpointPose` from the stable hold at its **end**, before reaching toward marker controls. Never derive both from the end window. Exclude control-reaching motion from the replayed segment, preserve references to the corresponding stable frames, and show both targets in review. If no valid separated start/end windows exist, adjust the boundaries, use an explicit local Start control, or re-record rather than guessing.

Target authoring: the expert records a natural narrated demonstration with brief holds, without needing a Start/End interaction for every step. After the marked pipeline works, propose boundaries from smoothed wrist speed, pauses of approximately 400–600 ms, and useful gesture transitions. Suggested starting speed threshold: 0.04 m/s. Require a minimum segment duration and displacement, merge short pauses, and reject tracking gaps as boundary evidence. These are tuning values, not established tracking characteristics.

Review confirms 3–5 boundaries, the active hand, a valid checkpoint, and instruction text. Voice labels the fixed movement segments. A cue word can suggest a boundary after transcription, but does not provide real-time reliability or override recorded motion.

### Learner state machine

~~~text
PRELOAD → CALIBRATE → SHOWING → WAITING_START → GUIDING → HOLDING → next SHOWING
                                                               └→ COMPLETE

Any active state → TRACKING_LOST / PAUSED
Reference reset or invalid calibration → CALIBRATE
Repeat → SHOWING for current step with a new attempt/revision
~~~

Default matcher parameters, explicitly subject to hardware tuning:

| Parameter | Initial value |
| --- | --- |
| Target | Wrist of active hand; full finger similarity off |
| Start gate radius / dwell | 7 cm / 200 ms |
| End checkpoint radius | 5 cm, reduced if actual transfer supports it |
| End dwell | 500 ms continuously valid |
| Orientation | Off; enable per step at about 30° only if it improves reliability |
| Gesture | Any; pinch/open only for a tested step |
| Sample/stall limit | Clear dwell if no fresh sample for >100 ms |
| Tracking reacquisition | 200 ms of consecutive valid samples before continuing |

Algorithm:

1. In SHOWING, completion is disabled even if the learner happens to be at the endpoint.
2. WAITING_START arms an attempt only after the active hand holds the demonstrated start region. This prevents most accidental endpoint completions. Segments with overlapping start/end regions need review; choose a separated start or an explicit local Start control.
3. In GUIDING, show direction/path feedback. Compare current learner pose in **workspace coordinates** to the next ordered gate and endpoint, independent of expert elapsed time. Only the next unpassed gate can accept evidence.
4. HOLDING accumulates real elapsed time only after required gates have been observed and every required active-hand endpoint condition is satisfied on consecutive fresh observations. Clear dwell on failure. Inactive-hand loss does not block a one-handed step.
5. Cap credited frame delta at 50 ms and reset after a large stall. An app pause must never return with a completed dwell.
6. Emit exactly one completion for `runId + stepId + attemptId`, then transition. Repeat creates a new attempt and increments `stepRevision`.
7. On missing/nonfinite/jumping active-hand data, enter TRACKING_LOST immediately, clear dwell, suppress directional-error feedback, and stop haptics. Do not interpret disappearance as a large positional error.
8. After valid tracking returns, resume the current attempt with empty dwell and a reacquisition notice. A new calibration invalidates the attempt and returns to SHOWING/WAITING_START. Never extrapolate across the gap.
9. Visibility loss, headset removal, session end, user pause, and application suspension suspend progression. Cancel outstanding voice requests or invalidate their revisions.

The initial `pose-match` mode verifies only start/end poses. The quality target uses `path-and-pose` for steps whose intermediate movement matters: derive one or two gates from meaningful path changes or arc-length positions, review them, and require them in order before endpoint dwell. Begin with approximately 6 cm gate radii and 100 ms holds; tune from valid recordings and learner attempts. Gates must be separated enough to discriminate progress and must not lie in tracking gaps. A simple straight placement can retain `pose-match` where an extra gate would add no meaningful information.

Keep cue progress separate from completion evidence. Use a local path-search window and bounded lookahead for the adaptive ghost; visual nearest-point projection must never mark skipped gates complete. On tracking loss, retain previously observed gates, clear partial gate/endpoint dwell, and require fresh evidence for the next gate after reacquisition. Do not infer that an occluded movement passed a gate. Offer Repeat if the learner needs to return to the next demonstrated movement.

Ordered gates verify selected motion checkpoints, not every point on the trajectory or the physical assembly state. Hand orientation and gesture can strengthen steps where they are meaningful and consistently observable; enable them based on comparative device tests rather than applying full-finger similarity everywhere.

An explicit “I completed this step” action may exist for a physically occluded step, using `completionMode: "user-confirmed"`. Show that mode visibly and log it. It cannot silently substitute for a failed pose-matched acceptance test.

### Audio timing and semantic labeling

Request Android microphone permission before capture. Use a single native microphone owner with a bounded PCM ring buffer; persist narration as a complete WAV asset with correct header/sample count/channel count. Close narration before starting learner conversation, rather than opening competing mic pipelines. Convert/upload the actual encoded asset with its true MIME type.

Map the microphone sample counter/Unity DSP clock into the common motion epoch; record offset, sample rate, estimated start uncertainty and measured drift. Never timestamp audio using buffer arrival count. Check a visible/spoken cue at both ends of a 30–60 second recording. Initial alignment target is ±150 ms. If that fails, preserve explicit markers and review with honest provenance instead of claiming precise automatic alignment.

For the first implementation, use `whisper-1` with `verbose_json` and word/segment timestamps. The current transcription guide limits `timestamp_granularities` to that model; do not substitute another transcriber and assume equivalent timestamp support. It documents a 25 MB upload limit, so cap narration at 20 MiB and show a size error before upload. [OpenAI transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text)

~~~ts
const transcript = await openai.audio.transcriptions.create({
  file,
  model: "whisper-1",
  response_format: "verbose_json",
  timestamp_granularities: ["word", "segment"],
});
// Convert audio-relative seconds exactly once:
// recordingMs = audioStartOffsetMs + transcriptSeconds * 1000
~~~

Assign transcript spans to deterministic step windows by overlap. Ask `gpt-4.1-mini-2025-04-14` for only `{ stepId, title, instruction, narrationSpanIds, needsReview }` records, using the Responses API's structured parsing with `zodTextFormat`. This supported snapshot is chosen for a small, bounded semantic task, not as a claim about the newest model. [Model capabilities](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

Handle refusal, incomplete output, timeout, parsing errors, duplicate/unknown IDs, unsupported narration references, and factual mismatch. Exactly one label per segment; title ≤60 characters, instruction ≤240. The model cannot alter physical targets, ranges, hand selection, or tolerances. Treat narrated text as task content, not as instructions to alter the application.

Aim for ≤15 seconds to compile the short demo recording, but show truthful elapsed status and allow retry/cancel. Do not wait indefinitely: preserve the recording and offer transcript/manual labels on failure. Cache by recording hash, segmentation revision, model, and prompt/schema version; never label a cached result as freshly generated.

### GPT Live conversation and fresh visual coaching

**Required stack:** GPT Live API with `gpt-live-1` for natural full-duplex speech; a native Unity WebRTC adapter for microphone/speaker media; the existing Fastify backend for authenticated session creation, trusted sideband and inspection coordination; a dedicated `apps/vision` backend process that performs image-capable Responses requests for visual analysis. GPT Live does not accept images/video directly. The visual assessor is `gpt-6-astra` at low reasoning effort — image input is supported and it is the strongest available spatial-judgment model for the demo's highest-stakes call; `gpt-4.1-mini-2025-04-14` remains the bounded-labels model and the documented cost/latency fallback. Evaluate visible-placement accuracy on real tasks before freezing. The Live model choice remains GPT Live. [GPT-Live capabilities](https://developers.openai.com/api/docs/models/gpt-live-1), [Image-capable backend pattern](https://developers.openai.com/api/docs/guides/live-delegation#add-images-and-visual-context), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

**Voice ordering.** Prove the HTTP voice loop first — a push-to-talk MediaRecorder clip → `whisper-1` → Responses → `audio/speech` → local playback — which needs no WebRTC, no headset and no duplex timing, and gives an always-available baseline coach. Then upgrade to the full-duplex Live session below. The PTT path remains as the degraded voice mode, not a throwaway.

**Connection and lifecycle.** Request Android microphone permission from an explicit Start action. Acquire the native mic once and use a dedicated speech playback sink. Start conversation explicitly; keep a visible mic state with Mute and End controls inside XR. After that, speech is hands-free for the active session. Optional push-to-talk is an alternate control, not the primary interaction. Test echo cancellation and speaker-to-mic feedback on the headset.

1. The Unity `Coach` adapter creates its native WebRTC peer, adds a microphone-backed audio track, installs event handlers and creates the `oai-events` data channel. Set the local SDP and await ICE gathering before sending the offer. Marshal events onto the runtime thread and keep audio work allocation-bounded. Unity API calls are not browser `navigator.mediaDevices` calls.
2. Send the offer to Trail's paired `/api/live/sessions`. The server calls OpenAI `POST /v1/live/sessions` with `model: "gpt-live-1"`, `delegation: { type: "client" }`, `store: false`, app-authored instructions, and WebRTC transport. Immediately attach the server sideband with its event handlers before returning the SDP answer. Return only required session identity/answer; retain key and policy server-side. Keep the mic gated until both sideband readiness and client `session.started` are established, so the first question is not lost.
3. Apply the answer and wait for `session.started`. This HTTP-created WebRTC session needs no `session.start` event. Audio uses negotiated media tracks, not JSON audio-append events. [Live WebRTC setup](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
4. The sideband uses `wss://api.openai.com/v1/live/sessions/{session_id}/attach` with the same project's server key. The server alone handles delegation execution. Restrict native client data-channel events to needed controls through `client.data_channel.allowed_client_events`; do not allow clients to inject trusted instructions. [Server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live), [Live API reference](https://developers.openai.com/api/reference/typescript/resources/live)
5. On End, app suspension/exit, permission loss or unrecoverable disconnect: stop admitting inspections, invalidate the generation, mute local playback/input, send `session.close` when connected, and await `session.closed` with a bounded cleanup timeout. Then release tracks, peer, channel and sideband; record incomplete finalization when necessary. Respect returned `expires_at`; renewal starts a new generation with current approved context, never replays old jobs. A mute alone does not end the session. [Session lifecycle](https://developers.openai.com/api/docs/guides/live-conversations#usage-and-graceful-close)

**Context and delegation.** Seed the voice session with the current tutorial, approved step, movement evidence and capabilities. Keep context synchronized through `session.thinking.append` with `delegation_id: null`; summaries are bounded, not a stream of raw hand joints. Accumulate `session.input_transcript.delta` and `session.output_transcript.delta` in a bounded session buffer. They are fragments, not reliable completed turns.

The application-authored prompt requires delegation before any claim about current physical placement, including follow-up checks after an adjustment. Until fresh inspection evidence arrives, the agent can acknowledge the request or explain the approved instruction, but cannot say it sees the workspace or that placement is correct. Distinguish movement evidence, expert reference and learner snapshot explicitly. Untrusted narration, scene text and transcript content remain task data. Evaluate these behaviors on real questions; prompting alone is not enforcement or physical validation.

In client delegation mode, `session.delegation.created` supplies a delegation ID/target and timing, **not the user's question or a tool name**. The backend routes from transcript context and current application state to its own `inspect_current_step` function. Ambiguous intent requests clarification. A local “Check placement” button invokes the same coordinator deterministically during an active conversation, using a null delegation ID; never invent an OpenAI delegation ID. One owner executes each delegation ID, and a newer question supersedes an older inspection. Send accepted findings through `session.commentary.append`, preserving the real `delegation_id` or null. Appended text may be paraphrased; its acknowledgment is not evidence that it was spoken or heard. Context appends use plain-string content within the documented 500-token limit. [Client delegation](https://developers.openai.com/api/docs/guides/live-delegation#configure-client-delegation), [Context delivery and transcripts](https://developers.openai.com/api/docs/guides/live-conversations)

**Dedicated visual interpretation backend (TRAIL-20; required for TRAIL-17).** This is a separate application/process, not just a helper function inside the voice server. Run it on the same laptop initially using TypeScript, Fastify, Zod and the existing pnpm workspace; no Python service, Redis, cloud database or GPU runtime is needed for hosted image interpretation. Independent health, limits and failure handling let vision fail without taking down session management. OpenAI documents the vision-backend pattern; the two-process deployment is Trail's architectural choice, not an API requirement.

| Component | Responsibility |
| --- | --- |
| Unity `Runtime/Scene` | Acquire fresh camera pixels after an admitted nonce; upload through the paired main API; expose camera status |
| `apps/server` | Authenticate capture, own immutable reference assets and active attempt state, interpret Live delegations, enforce freshness/deadlines, call vision and return accepted findings over the trusted Live sideband |
| `apps/vision` | Decode and validate images, compare current visual evidence with reviewed references, invoke the configured image-capable model, validate `CoachAssessment`, return evidence/uncertainty with bound IDs and model provenance |
| GPT Live | Hear the question, maintain conversation and speak the returned findings; it receives concise interpreted evidence rather than raw images |

**Internal service contract, proposed v1:** `POST /internal/v1/inspections` is an authenticated bounded request/response call. Send the existing `InspectionRequest`, `SceneObservation`, approved step/outcome text, movement summary, and actual image bytes: one current frame plus at most two reviewed reference images (checkpoint and starting layout). Attach server-resolved asset IDs/hashes and a remaining-duration budget; the vision service does not fetch caller-supplied URLs or arbitrary filesystem paths. Return a versioned envelope containing the exact request/epoch and observation/reference IDs, `CoachAssessment`, provider/model identity and measured service duration. The service code supplies identity/provenance fields; the model supplies only the assessment. Validate both sides with shared Zod contracts and synthetic fixtures; retain recording v1 unchanged. New service metadata is not silently added to existing serialized contracts.

Main-server deadlines and current guide revisions remain authoritative. Do not subtract clocks across processes: send remaining budget as a duration, use a local monotonic deadline inside vision, and recheck full observation age at the main server before delivery. Keep the existing 8-second total inspection bound and 5-second image-age limit; a separate process does not restart either budget.

**Service lifecycle and limits:** bind to loopback on candidate port 3002; require the service token on internal health/readiness, inspection and cancellation routes. Only the main API is reachable by the headset/browser. Pin the service URL in server configuration; a future remote deployment requires authenticated TLS. Admit one active inspection for the one-headset baseline; reject excess work with a typed `busy` response instead of building a stale backlog. Enforce at most three JPEG/PNG images, 2 MiB each, longest edge 1280 pixels and bounded metadata (initial 64 KiB); use bounded multipart parsing and validate decoded dimensions. Main-server upload limits still apply before forwarding.

Key work by request ID/epoch and a payload hash: duplicate active requests share the existing job, conflicting duplicates fail, and retries cannot execute another provider call for the same active job. Cancellation through `DELETE /internal/v1/inspections/:requestId` must match the epoch, abort the provider when possible and discard late completion. Keep deduplication/cancellation records bounded to the session/deadline window. A service crash/restart fails the active request visibly; never silently resubmit an old frame. Drop temporary pixels after completion/cancellation; logs contain bounded IDs, timings and error types, not images or raw user questions. Main-server retention rules continue to govern reviewed tutorial assets.

**Failure behavior:** independently display camera and vision availability. Without a usable image or with vision unavailable, GPT Live can explain the stored instructions but must state that it cannot currently inspect the scene. It must not reuse an earlier positive verdict. Local guidance remains available; an inspection pause still requires the learner's explicit Resume. After an adjustment or a request for another angle, capture a new frame and run a new request. This delivers visual conversation through requested fresh snapshots; continuous video understanding is a separate extension.

**Required end-to-end acceptance:** in the actual headset, ask the same “Am I doing this right?” question against correct-looking, visibly incorrect and obscured arrangements, then adjust a part and ask again. Trace request/observation IDs through both services and verify that the spoken answer changes appropriately with the fresh evidence. Measure from question end to useful audible feedback, including camera, upload, vision and Live delivery. Also kill/restart vision during an inspection and test late/cancelled results. Audio-only exchanges, text-only model input, mock images, generated captions or a successful HTTP response cannot pass this gate.

**Inspection pipeline and evidence policy.** These are Trail requirements, not capabilities obtained by connecting the voice API:

1. Admit a request only after the headset acknowledges the current run/tutorial/step/attempt and locally pauses for inspection. Snapshot movement evidence and the exact reviewed reference IDs. Show “Checking placement.”
2. Request a **new** frame from the native Quest MRUK source using a single-use capture nonce. Require camera permission and an active `PassthroughCameraAccess` feed. Choose a supported resolution intentionally; do not assume the highest resolution or fixed aspect ratio. Read real camera pixels without ghost/UI overlays and record camera identity and sensor timestamp. If expert/learner views are incomparable, obtain another view or return uncertain. A paired webcam is a disclosed development/reduced-demo source and cannot satisfy headset-camera acceptance. [MRUK camera integration](https://developers.meta.com/horizon/documentation/unity/unity-pca-documentation/)
3. Wait for a newly delivered camera/video frame **after** the source receives the nonce; a texture readback, re-encode or upload counter alone is insufficient. Advance `sourceFrameSeq` from frame delivery and retain media timestamps. A stalled source times out; identical pixels alone are valid for a stationary scene. Validate source session, sequence, request identity, MIME, dimensions and size. Proposed bounds: one in-flight inspection, ≤2 MiB per image, longest edge ≤1280 pixels, frame-to-send age ≤500 ms, and a ≤2 s server request-to-upload window. Retain the server's request timestamp: server-now minus request-start is a conservative upper bound on frame age when capture follows the nonce. Use that bound at result dispatch, plus source-local elapsed times; never subtract unrelated device clocks. These thresholds need device/network tuning.
4. The main server sends the fresh learner image, relevant expert checkpoint/layout images, approved visible-outcome description, question and movement summary to `apps/vision` over its authenticated internal contract. The vision backend performs the image-capable Responses call and validates its structured assessment. References come from this actual demonstration and are explicitly labeled as **expert references**, not current observations. No hardcoded bottle/LEGO recognition branches. No cached learner verdicts. Existing tutorial assets may be reused by immutable identity.
5. Validate structured `CoachAssessment` output and recheck request/session generation, every guide revision, observation age and source health before display or commentary. Initial maximum observation-age bound at answer dispatch: 5 seconds. If exceeded, reject the verdict; allow at most one recapture within an 8-second total inspection deadline, then show/speak unavailable with explicit Retry/Resume. Never retry indefinitely. Answers describe the checked snapshot, not continuous observation. A new view after adjustment always gets a new image and request.
6. Return one concise actionable observation and, when needed, one follow-up. Describe visible evidence; choose `uncertain` for occlusion, poor lighting, indistinguishable parts or a missing reference. Use `motion-only` without an image and say so. The learner decides whether to Resume or Repeat; the result cannot emit a movement-completion event.

| Question / evidence | Appropriate behavior |
| --- | --- |
| “What do I do next?” | Explain the approved current step; offer the existing replay control |
| “Am I doing this right?” + clear visible mismatch | Describe that mismatch against the demonstrated step and suggest an adjustment supported by the image |
| Same question + visible agreement | Say it appears aligned in the checked view; avoid certifying hidden attachment or tightness |
| Same question + blocked view or no camera | State what cannot be seen and ask to reveal the connection or provide another view; do not guess yes |
| “Is the bottle watertight?” | Explain that an image cannot establish a watertight seal; refer to the task's approved physical check if one exists |
| “Can you explain that more simply?” | Rephrase the reviewed instruction and refer to the recorded preview; do not invent an unseen action |

**Interruption and stale speech.** Native conversational interruption does not cancel application inspection jobs. Invalidate the request epoch on a superseding question/cancel/repeat/advance/resume/recalibration, abort the owned Responses request when possible, and suppress late captions/commentary. Do not use old Realtime `response.cancel` or `conversation.item.truncate` as Live commands. For already-playing stale audio, mute the local audio player immediately; a context acknowledgment cannot prove old audio is gone. Restore playback only under a tested recovery policy; use a fresh Live session/generation when old output cannot be reliably excluded. A trusted `session.instructions.append` correction may steer speech but is not an audio-stop acknowledgment. [Playback and server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live#control-playback-when-needed)

**Failure and data handling.** Keep Repeat/Pause/Resume, stored instructions and motion progression available when Live or vision fails. Show distinct connecting/listening/checking/speaking/muted/unavailable states; never label a caption or accepted commentary as audible success. Authoring narration uses the separate recorder/transcription pipeline; close it before the learner conversation to avoid competing mic lifecycles. Explain mic/camera transmission at preflight, restrict the frame to the workspace where practical, and collect images on request rather than uploading continuous video. Keep ephemeral learner images/transcripts in bounded memory with cleanup after the request/session. Persist only deliberately approved expert references as private tutorial assets; no media or transcripts in logs/Git. `store: false` is a request setting, not a blanket claim about provider retention.

The native scene adapter owns the MRUK camera component and bounded readback/encoding jobs. A returned texture alone does not prove freshness: bind its sensor timestamp/new-frame sequence to the nonce receipt and do not relabel a retained texture as new. Copy a specific frame into owned storage before asynchronous encoding; retain frame identity through GPU readback. Drop obsolete work, cap queued readbacks at one and dispose owned textures/buffers on teardown. Disable/release camera ownership on pause/exit; recheck permissions on resume. Native mic/WebRTC remain owned by `Coach`, independently of the camera.

**Native voice feasibility gate:** Unity WebRTC 3.0.0 is the initial transport candidate, not a built-in OpenAI/Meta integration. Prove Android ARM64/IL2CPP build, SDP/ICE/data-channel compatibility, inbound/outbound audio, resampling, echo/feedback control, interruption and cleanup on the actual headset. Its documented frame-pacing constraints must be reconciled with XR settings and measured. A successful browser or Editor call is only a server/protocol diagnostic. If this package cannot meet the gate, evaluate a maintained Android WebRTC bridge behind the same interface, record the dependency/license cost and rerun all audio/XR checks; do not silently drop hands-free conversation or substitute another model. [Unity transport requirements](https://docs.unity3d.com/Packages/com.unity.webrtc@3.0/manual/requirements.html)

## 8. Persistence, recovery, and performance budgets

### Storage

Use `data/recordings/<server-id>/` containing `manifest.json`, bounded `motion/0000.json` chunks, narration, transcript, and tutorial versions. Write assets to temporary names and atomically rename before finalizing the manifest. On restart, unfinished uploads remain incomplete and unfinished jobs become interrupted/retryable.

Use JSON first; no custom binary codec. The raw numeric lower bound for two hands is:

~~~text
2 hands × 25 joints × 7 floats × 4 bytes × 30 Hz × 120 s
= 5,040,000 bytes before timestamps/metadata
~~~

JSON and in-memory objects will be significantly larger. Initial application limits: 120 seconds, 3,600 frames, 2 MiB motion chunks, 64 MiB aggregate motion upload, 20 MiB narration, one active recording/compile. Measure a real recording before treating those limits as sufficient.

Set Fastify body and multipart limits explicitly; their defaults are too small for this design. Avoid a global unrestricted upload limit. Stream audio to disk, validate hashes/counts, and report a typed size/format error. [Fastify server limits](https://fastify.dev/docs/latest/Reference/Server/#bodylimit), [Multipart plugin](https://github.com/fastify/fastify-multipart)

Cache and validate completed tutorial data/assets in Unity application-private persistent storage before Guide begins. Use bounded temporary files plus atomic finalized manifests; check free space and surface partial writes. Browser IndexedDB is optional for desktop tools only. Keep a last-good exported recording/tutorial on the laptop. Export includes schema version, joint order, coordinate conventions, asset hashes, audio, and provenance; import validates all of them. A browser `blob:` URL is never durable storage.

### Reliability boundaries

- Losing the backend after preload leaves the open guide running locally; spectator/AI/haptics report disconnected.
- A cold offline app launch and tutorial selection are **not** accepted merely because the APK is installed; test cached asset completeness and startup separately. The baseline guarantee is continued local guidance in an already preloaded run.
- Server restart preserves finalized recordings but invalidates in-memory connections; the active headset resends its snapshot.
- Headset session restart requires calibration; loading a tutorial does not restore spatial registration.
- Duplicate upload retries are idempotent. Duplicate/stale guide events do not change local progression.
- Telemetry must be bounded and disposable; recording buffers must fail explicitly rather than discard motion silently.

### Proposed measured budgets

| Metric | Initial target | Measurement |
| --- | --- | --- |
| Local motion processing | ≤4 ms p95 per XR frame | Instrument capture + transform + matcher on device |
| Rendering | Sustain selected device cadence; no visible guidance hitch | Record frame intervals; investigate repeated >2-frame stalls |
| Capture | 30 Hz stored, real timestamps | Capture report includes samples, gaps, duration |
| Calibration transfer | ≤2 cm held-out mark error where feasible | Two independent users, three repeated registrations |
| End checkpoint | 500 ms dwell with no false advance | Wrong-pose and interrupted-dwell fixtures plus device test |
| Compile | ≤15 s for chosen demo clip | End-to-end stop-to-ready timing, including upload |
| Spoken response | First audible acknowledgment ≤2 s; useful answer ≤5 s or explicit unavailable/checking state | Measure utterance end to actual Quest playback; acknowledgment alone is not useful-answer success |
| Visual inspection | Fresh frame at request, ≤5 s age at result dispatch; one active request | Record source/request/capture/receipt/assessment/playback durations without media content; reject stale results |
| Spectator | ≈10 Hz, stale indicator after 1 s without updates | Disconnect/reconnect drill |

These are acceptance targets, not measured results or vendor guarantees. If performance slips, simplify ghost geometry and serialization before changing runtimes.

## 9. First two hours: feasibility spikes

One headset is a shared test resource. Reconcile these windows with actual time remaining; the Unity decision does not restart the original build clock. Editor/toolchain installation can exceed the nominal setup window: record readiness before promising the H+4 gate. Keep the current desktop fixture working while native setup proceeds.

| Spike | Owner | Procedure / pass evidence | If blocked |
| --- | --- | --- | --- |
| Native setup, first integration slice | 4 + 1 | Freeze compatible editor/packages, build/install minimal passthrough APK; authenticated server health | Isolate activation, Android tools, provider/settings or app permissions; a tunnel does not replace APK installation |
| Hand source, first headset slot | 1 + 2 | Named 26→25 mapping, both hands, known rotations, validity gaps, five-second real capture/replay | Diagnose provider vs adapter; no controller hand or stale visual substitutes |
| Exact task, 15 min | 1 + 2 | Grasp/place actual bottle/LEGO parts and restore occluded hands; report gaps | Use larger forgiving parts while keeping a fresh task |
| Registration, 30 min after raw replay | 1 + 2 | Independent two-user calibration, fourth-mark error, rotated mat, recenter recovery | Fix basis/mapping/calibration before semantic polish |
| Environment transfer, after registration | 1 + 2; 4 schedules headset slot | Same tutorial/parts/layout on a different table in a different room; then bounded MRUK current-room/placement probe | Fix registration independently of room geometry; record missing scene assistance as a gap, never use a synthetic room as evidence |
| Contracts/domain, first hour | 2 + 4 | Same synthetic wire JSON parses in C#/TS; transforms and reducer cases pass | Explicit schema migration, no permissive parser to hide drift |
| Native voice, first available APK | 3 + 1 | Actual `gpt-live-1` speech both ways, data channel/delegation, interruption/echo/close while XR active | Isolate native audio/ICE/provider; browser call is a diagnostic only |
| Scene source, first two hours if setup ready | 1 + 3/4 | Fresh MRUK frame after nonce, image of actual task, timestamp/source checks, wrong/obscured response | Debug permission/readback; webcam is a disclosed reduced demo, not native target acceptance |
| Narration/labels | 3 | Playable WAV, sample-clock alignment, timestamped transcription and fixed-segment labels | Preserve recording and marker fallback |
| Spectator/network | 4 | Authenticated events, reconnect snapshot, casting with physical context/audio | Webcam plus schematic audience view |
| Optional haptics | 4 after core gates | Identify hardware and one bounded pulse | Cut it |

Before broad feature work, the **same standalone APK** must show hands/ghost, fresh headset imagery and duplex speech together. Separate sample successes are not concurrency proof. At the first shared gate record: go, reduced physical task, or named blocker with owner. Keep useful fixture/backend work moving while the device owner resolves the blocker.

## 10. Dependency-ordered build sequence

The windows below retain the original elapsed build budget; review them against actual remaining time and installation readiness. Preserve the full quality target and report cuts honestly.

| Phase / window | Owner | Goal | Required evidence |
| --- | --- | --- | --- |
| 0: baseline, H0–1.5 target | 4 + 1, all supporting | Preserve scaffold; Unity toolchain/project, native pairing path, contracts | Current pnpm checks intact; compatible native build/install; C#/TS fixture validation |
| 1: physical proof, H0–4 | 1 + 2 | Raw hands, mapping, recorder, separate ghost and calibration | Fresh recording replays after second-person registration; no stale samples |
| 1b: voice/camera proof, H0–4 in parallel | 3 + 1 + 4 | Native WebRTC, MRUK snapshots, server coordination | Same APK runs hands/ghost/camera/audio; actual heard response |
| 2: one interactive step, H4–7 | 2 + 1 | Pure C# reducer/matcher, local effects/repeat/loss states | Slow learner advances once; invalid input never completes |
| 3: multi-step transfer, H7–11 | 1 + 2 + 4 | Markers, native cache, uploads, reviewed gates, spectator | Fresh 3–5-step run, save/reload and rejected shortcut |
| 4: natural authoring, H8–15 | 2 + 3 + 4 | Motion proposals, WAV alignment, bounded labels, reference review | Fresh narration/steps become a reviewed immutable tutorial |
| 4b: grounded coaching, by H15 | 3 + 1 + 4 | Step-bound image/voice, stale work suppression, captions | Correct/wrong/occluded trials, interruption and Resume/Repeat |
| 5: quality, H11–18 | All | Ghost/material/UI polish, second task, review/spectator | Two fresh task families, readable overlays, measured device frame budget |
| 6: freeze/drills, H18–20 | All, 4 coordinates | Known-good APK/server pair, preload/reconnect/restart | Three clean runs and real failure recovery |
| 7: demo/submission, H20–22 | 4 + all | Non-builder trial, runbook, video, evidence | Reproducible setup and timed demo; team handles submission |
| 8: reserve, H22–24 | All | Fix bugs and verify submission | No feature additions |

Sponsor work and haptics fit only after core gates. The original event research recorded September 19 14:00 EDT sponsor selection and September 20 08:00 EDT submission; Person 4 rechecks the live participant portal immediately. These historical schedule assumptions were not refreshed by the Unity planning revision and are not extra build time.

### Four parallel workstreams

Use [the four-person execution plan](team-plan.md) for file ownership, handoffs and headset scheduling.

| Person | Owns | Starts immediately | Unblocks others with |
| --- | --- | --- | --- |
| 1: headset/spatial | Unity XR/record/guide adapters, MRUK camera, ghost and world-space UI | App scene/hands with 4; raw pose and fresh frame probes | Real canonical recording, camera source and calibrated replay |
| 2: motion/contracts | Pure C# engine, cross-language fixtures; TS offline segmentation/math | Frozen DTO/schema fixtures, handedness/joint conversion cases, dwell/reducer | Tested C# APIs, tutorial boundaries/gates and expected results |
| 3: voice/AI | Native mic/WebRTC/audio, narration, server Live/Responses | Native transport spike plus provider/account diagnostic | Heard headset exchange, timestamps, bounded labels and assessment |
| 4: platform/integration | Unity project/locks/main scene/build, API/auth/files, web review/spectator | Toolchain/APK, scoped native pairing, storage and review | Reproducible build, network contracts, immutable tutorials and audience view |

Person 1 supplies feature prefabs; Person 4 composes the main scene. Person 3 owns a separate Coach prefab. Do not edit one Unity scene concurrently. Person 2 can take a bounded review widget after the engine gates pass; Person 4 is the coordinator, not the owner of everyone's unfinished implementation.

**Integration checkpoints:** initial setup/fixture gate; H+2 if ready, first raw sample and native voice/camera diagnostics; H+4 same-APK calibrated replay/audio/image; H+7 one step; H+11 multi-step inspection; H+15 natural authoring/second task; H+18 freeze. Record the actual build and gaps rather than moving the clock. Reserve early shared headset slots for voice/camera before Person 1 spends the whole window on spatial tuning.

### Agent and branch coordination

Keep `AGENTS.md` aligned with native and web boundaries, C#/TS contract ownership, source provenance and evidence requirements. Use `codex/<bounded-task>` branches. Delegated implementation, when authorized, should own a narrow assembly/module and its tests; humans retain device testing. Example: implement C# dwell/loss/repeat transitions against shared golden fixtures, without touching scene assets or provider code.

Person 4 owns `ProjectSettings`, UPM locks, the main scene and pnpm dependency changes. Preserve `.meta` GUIDs. Feature owners commit their own prefab with its script/tests; coordinate schema changes with all consumers and supply fixture/migration notes. Do not place UnityEngine, networking or provider APIs in the pure motion assemblies.

## 11. Verification strategy and acceptance checklist

### Tests without a headset

Use synthetic data for edge cases and the first real capture for realism. Inject time, input samples, provider responses, and storage failure states. Tests should target product failures rather than repeat implementation details.

| ID | Scenario | Expected result |
| --- | --- | --- |
| T01 | Translate/rotate a workspace, transform out and back | Position and orientation round-trip within numeric tolerance; no scale change |
| T02 | Collinear, reversed, jittery calibration points | Reject; no valid guide state |
| T03 | Learner follows at 0.5× or 0.25× expert speed | Same completion outcome; no clock-coupled failure |
| T04 | Wrong position or wrong active hand | No dwell accumulation or advancement |
| T05 | Correct endpoint before start gate | No advancement |
| T06 | Correct pose for less/more than dwell | No early completion; one completion after threshold |
| T07 | Tracking disappears 450 ms into a 500 ms dwell | Clear dwell; fresh valid hold required |
| T08 | Non-active hand disappears | One-handed step can still complete |
| T09 | Large frame/time jump or visibility pause | No dwell credited through gap |
| T10 | Repeat, duplicate completion effect, or old event arrives | New attempt stays isolated; no skipped step |
| T11 | Quaternion sign flipped; near-zero/invalid quaternion | Equivalent rotation accepted; invalid rotation rejected |
| T12 | Old AI response arrives after advance or repeat | Discard even if step ID is reused |
| T13 | AI unavailable/refuses/returns wrong IDs | Recording preserved; typed failure and deterministic fallback |
| T14 | Oversized/corrupt/missing upload and retry | Bounded failure; no incomplete recording published |
| T15 | Finalized save → server restart → reload/export/import | Same motion/tutorial and verified asset identity |
| T16 | Spectator disconnect/reconnect and stale sequence | Stale indicator, then authoritative snapshot |
| T17 | Server disconnect after guide preload | Local checkpoint progression still works |
| T18 | Hand disappears inside recorded ghost path | Hidden interval; no stale interpolation |
| T19 | Mock haptic disconnect/expired command | No crash, no queued late pulse |
| T20 | Learner reaches endpoint while skipping a required motion gate | No advancement in `path-and-pose` mode |
| T21 | Recorded path crosses or loops near its endpoint | Cue stays in its local path neighborhood; gate order remains intact |
| T22 | Hand disappears before a gate and reappears beyond it | No inferred gate passage; previous completed gates preserved, partial dwell cleared |
| T23 | Boundary edit races an earlier compilation result | Old result rejected; gates/targets recomputed for the reviewed revision |
| T24 | Duplicate Live start/delegation, denied mic, disconnect or close timeout | One session/job per identity; typed state, no leaked tracks; incomplete close reported accurately |
| T25 | Old inspection after repeat/resume/recalibration, new question or Live generation | Abort/invalidate; no late caption/commentary, no changed guide state; local stale playback muted |
| T26 | Cached, wrong-source, duplicate-conflicting, frozen or late camera frame; repeatedly slow assessor | Reject nonce/source/age mismatch; no positive visual verdict; bounded retry ends in unavailable with Resume |
| T27 | Assessor refusal, malformed output, no reference or occluded scene | Explicit uncertain/motion-only result; no invented placement proof or model-produced identity |
| T28 | Valid `visible-match` result or malicious narration/image text | Advice only; cannot emit step completion, change targets or override trusted instructions |
| T29 | Edited step boundaries or swapped reference assets | Stale sidecar invalidated; assessment cannot use another revision's reference |
| T30 | Live/vision unavailable after preload | Stored instructions and local movement continue; coaching clearly unavailable |
| T31 | SDK receives controller-only input, a missing joint or a cached visual pose | Raw observation is invalid; no controller fingertip fallback, recording of stale transforms or dwell |
| T32 | Hands/origin unavailable; recenter, suspend or repeated scene/app entry | Clear failure or recalibration; no duplicate sampler, retained dwell or stale attempt |
| T33 | Native clock/DSP/camera units differ; Editor/simulator input | Explicit epoch conversion and uncertainty; no duplicate-sample dwell; simulated provenance stays synthetic |
| T34 | Repeated scene load/pause/resume; UI input; APK permissions | One rig/sampler/mic/camera owner; controls work; resources released; retry rechecks permissions |
| T35 | Native dependency/build migration and ghost/live-hand separation | Existing web checks plus native build pass; replay cannot mutate real input; no second XR provider |
| T36 | 26→25 named joints, both hands, reflected basis and bone axes | Known fingers/rotations and inverse conversion agree across C#/TS fixtures; reject legacy/wrong mapping |
| T37 | Strict C# parsing, AOT/stripping, schema/sidecar versions | Same accept/reject cases as Zod; APK reads fixtures; no silent coercion/version overwrite |
| T38 | Native bearer vs browser cookie auth; missing Origin; wrong role/token | HTTP/WS reject unauthenticated native requests; browser Origin enforced; spectators cannot control/capture |
| T39 | Camera texture reused during async readback; denied permission | Sensor/frame identity bound to copied pixels; stale/late readback rejected; no positive verdict |
| T40 | Native PCM clock, duplex echo/interrupt, suspend/resume | Measured audio alignment; no self-triggered conversation, leaked mic, stale playback or progression during gap |
| T41 | Same tutorial/parts/layout, different room/table height and mat orientation | Independent registration; held-out error within frozen calibration gate; no scaling, imported expert-room origin or widened matcher tolerance; actual learner run required |
| T42 | Missing/denied/stale/wrong-room Scene Model or development prefab fallback | Explicit unavailable/synthetic status, recapture/manual setup; no claim of current room geometry or precise part placement |
| T43 | Scene reload/world-lock origin adjustment during guidance | Coherent origin conversion or invalidation/recalibration; no ghost jump accepted as hand progress or retained dwell |
| T44 | Changed background/lighting or visibly altered starting layout | Test fresh visual coaching and tracking in both rooms; learner layout confirmation required, mismatch restores layout before start; no pixel-identical-background requirement or automated correctness claim |
| T45 | Separate vision backend: absent/wrong token, oversized/invalid images, duplicate/conflicting requests, concurrent work | Strict authenticated contract, decoded-image limits, single active provider call per job, bounded admission; mocks cannot satisfy visual acceptance |
| T46 | Vision timeout/crash/restart/cancel or late result after new attempt | No stale verdict or silent image retry; audio/session management and local guidance survive; explicit vision-unavailable state and learner Resume after inspection pause |
| T47 | Same spoken question, correct/wrong/obscured/adjusted scene | Fresh image reaches real vision provider; validated evidence reaches Live; appropriately different answers are actually heard on Quest, with IDs and end-to-end latency recorded |

Use Unity EditMode tests for C# domain/contract fixtures and PlayMode tests for adapters, lifecycle and UI with injected inputs. Add an Android ARM64/IL2CPP build/smoke gate for serialization and native plugins. Use Fastify `inject()` for API/auth/storage failures and Playwright for desktop review/fixture/spectator flows. Browser tests exercise fixture input, rendered controls, persistence, and reconnect. They cannot validate Quest passthrough, hand accuracy, audio concurrency, casting, or physical calibration. [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Playwright web-server testing](https://playwright.dev/docs/test-webserver)

### Hardware and human acceptance

- [ ] Confirmed Quest 3S OS, APK/build, editor/OpenXR/Meta/audio package versions recorded; hands and controller modes validated.
- [ ] Standalone Unity APK launches on Quest with OpenXR, passthrough and real hands; correct tracking origin, no simulator, no duplicate rig/provider.
- [ ] Passthrough plus independent recorded ghost visible; raw source pose names, validity and time units verified.
- [ ] Unity world-space step/voice panel is readable and operable with selected hand/controller input; live hand visuals do not obscure the ghost or physical task.
- [ ] The actual part grasp/placement keeps enough hand visibility for the task.
- [ ] Two users independently calibrate; held-out mark checked, including rotated mat. Repeat the same tutorial on a different table in a different room, preserving objects/layout and measuring transfer error.
- [ ] TRAIL-19 records actual MRUK room/surface availability, stale/missing-room recovery, origin handling and performance; clearly distinguish scene-assisted placement from manual setup. Test altered lighting/background and an intentionally incorrect starting layout.
- [ ] Five-second real recording survives save/reload and replays spatially.
- [ ] Mic recording works while XR, hands, and chosen spectator path run together.
- [ ] A fresh four-step demonstration generates usable reviewed instructions.
- [ ] A natural demonstration produces useful motion boundary proposals without per-step marker controls.
- [ ] Articulated ghost, path feedback, and text remain clear during real manipulation and meet the frame budget.
- [ ] Required gates reject an endpoint shortcut; adaptive cues stay paced to a slower learner.
- [ ] GPT Live conversation is heard in the Quest while XR/hands and spectator run; questions require no push-to-talk after Start. Test Mute, interruption, follow-up, End and reconnect.
- [ ] “Am I doing this right?” inspects a newly captured view on both fresh tutorials. A correct-looking placement, visible mismatch and obscured view produce different, appropriately qualified answers; record actual responses and human judgments.
- [ ] Separate vision service passes T45–T47: current headset images produce evidence-dependent spoken answers; killing vision leaves voice/session management and local guide recovery usable.
- [ ] Repeat/resume/change question during a slow inspection: no stale spoken success or old-step captions. Measure first audible and first useful answer, including image latency.
- [ ] Camera denial/frozen feed and a moved/covered part yield unavailable/uncertain feedback, not cached success. Show the actual camera source and inspect what pixels the model receives.
- [ ] Bottle and LEGO-style tasks use new recordings/references with no application code changes, seeded motion, or canned verdicts.
- [ ] Slow learner succeeds; wrong checkpoint fails; hand loss clears dwell.
- [ ] Remove headset/recenter/restart: no false advance, recalibration is available.
- [ ] Disconnect AI/backend after preload: physical guide completes.
- [ ] Three consecutive full runs finish without developer intervention.
- [ ] At least one non-builder finishes with no step-by-step verbal help.
- [ ] Spectator/backup media contain the actual intended visuals; verify audio separately.

Write `docs/validation.md` as a table of test, commit/APK, device/OS/editor/SDK versions, observed result, measurements, and unresolved issue. Record “not tested” where appropriate. A unit-test pass is not a substitute for the non-builder trial.

## 12. Sponsor integrations and optional haptics

### OpenAI: the default sponsor fit

Use timestamped narration, structured labels, GPT Live conversation and Responses-backed visual coaching in the real pipeline. Document one concrete Codex contribution with a commit/test/demo explanation—for example, fixing false advancement after tracking loss. Actual OpenAI API use plus a meaningful Codex contribution are the researched track requirements; recheck the portal before submission. A plan is not working API evidence. [Official 2026 prize requirements](https://hackthenorth2026.devpost.com/)

### Sentry: only with a useful debugging story

The current track requires **at least two products beyond error monitoring**. Choose Tracing and Logs. Trace upload → transcription → labeling and log tracking-loss/recovery, compile failures, and stale-reply rejection with recording/run/step IDs. Record one concrete defect found or improved using those tools. Installing an SDK without using the results is insufficient. Keep capture data and transcript contents out of telemetry. [Official 2026 prize requirements](https://hackthenorth2026.devpost.com/)

### Huawei OMNI Live: an optional complete multimodal interaction

Use an approved OMNI model for one grounded learner question: raw speech, a recent Quest-camera image, and current tutorial context produce useful guidance about the next piece. The three modalities must contribute to the same interaction. AR rendering is not model vision, and an ordinary text-only call does not satisfy this requirement.

The official challenge permits a cloud model and requires a functional scenario plus repository setup instructions. Its example is Qwen3.5-Omni where applicable; obtain the actual supported model ID, endpoint, schema, and credits from the sponsor. Do not assume OpenAI-compatible request formats or that a different text/vision model qualifies. API access and usable latency still need testing. [Official Huawei challenge](https://github.com/cari-waterloo-rc/OMNI-Live-Build-the-Next-Generation-of-Real-Time-Multimodal-AI)

Time-box the access/payload spike, capture one valid response, and keep this additional integration behind capability flags. The required GPT Live + Responses path does not establish Huawei eligibility. If the OMNI interaction is not working by feature freeze, omit that sponsor feature/claim while retaining the core GPT Live and scene-inspection work.

### Haptics: first feature to cut

No TITAN prize was found in the checked 2026 Devpost inventory; hardware availability and any separate program remain unconfirmed. Do not promise a sponsor track on that basis.

If a kit is actually supplied, identify model/firmware and use the vendor's terminal to prove one bounded pulse before coding. TITAN's Core documentation supports USB/serial-based development, but the exact borrowed device's protocol still needs verification. [TITAN Core](https://titanhaptics.com/titan-core-development-kit/), [Vector Haptics terminal](https://vhterminal.titanhaptics.com/)

~~~ts
interface HapticsDriver {
  pulse(intensity: number, durationMs: number): Promise<void>;
  stop(): Promise<void>;
}
~~~

Default to a mock driver. For real hardware: clamp intensity, cap each pulse at 100 ms, enforce a refractory period, and require a device/firmware duration cutoff independent of the network. Stop on tracking loss, pause, recalibration, completion, disconnect, and watchdog expiry. Drop expired/old-generation pulses; do not queue them for replay after reconnect.

Only pulse during an armed attempt for a sustained path deviation—not merely because the hand is far from the final endpoint. A controller in the user's hand interferes with physical manipulation; do not present controller vibration as wearable hand guidance.

## 13. Risk decisions and ranked cuts

| If this happens… | Then do this… | Claim affected |
| --- | --- | --- |
| Unity/Meta/audio packages or settings conflict | Pin one compatible set, isolate plugin/frame-pacing issue, preserve web checks | Editor success does not prove Android XR/audio readiness |
| SDK visual hand looks tracked while raw joints are missing | Treat the observation as invalid and clear dwell | A rendered hand is not evidence of a current physical pose |
| Installed OS/app does not expose a required capability | Check OS, manifest, permission and provider; isolate with official native sample | Hardware model stays confirmed; actual runtime behavior needs proof |
| Developer mode, activation or USB installation stalls | Resolve account/toolchain/ADB blocker with device owner; use fixtures meanwhile | A web URL is not a substitute for installing the native app |
| Hand tracking fails during grasp | Change parts/motion; use wrist-level checkpoints after grasp | No fine-grip or object-state verification |
| Hands unavailable after feature/settings checks | Seek a working device/mentor; use desktop/controller proof only if necessary | Full bare-hand MVP is not achieved |
| Calibration cannot transfer | Improve marks/sampling and task scale; keep ghost replay local until solved | Cross-user spatial transfer is not achieved |
| Tray or origin moves mid-run | Pause and recalibrate | No persistent automatic anchoring claim |
| Automatic segmentation is poor | Use explicit markers and small review UI | Assisted segmentation rather than automatic authoring |
| Audio timing is inaccurate | Use markers and review transcript associations | No precise narration alignment claim |
| Headset mic fails in AR | Diagnose preflight/permissions/audio transport; laptop mic may support authoring with explicit synchronization | External learner mic is a disclosed fallback; headset conversation target is unmet |
| AI fails or is slow | Keep recording; use stored transcript/fallback labels; guide locally | Automatic semantic generation may be degraded |
| Quest image access fails | Diagnose native permission/component/readback; webcam only for a disclosed reduced demo | Headset-camera acceptance remains unmet |
| Neither scene source works or evidence is stale | Instruction/motion-only answer, explicit unavailable state | Visual coaching target is unmet; no claim to see current placement |
| GPT Live access/transport fails | Local controls and stored instructions; preserve current tutorial | Hands-free live conversation target is unmet; do not silently replace API |
| Casting fails or excludes passthrough | Webcam plus schematic spectator; labeled backup video | Schematic is not a headset recording |
| Venue internet fails | Wired local built server + preloaded tutorial + static instructions | Fresh cloud AI unavailable |
| Server/tunnel fails after preload | Continue local guide, display disconnected spectator state | No uninterrupted remote-view claim |
| Haptic protocol/driver is unstable | Mock driver or remove feature | No real haptic demonstration |
| H+7 interactive gate is missed | Remove every stretch feature; focus on one correct step before expanding | Do not call an animation an interactive tutor |
| Unity native path cannot ship a working APK in time | Deliver the disclosed reduced demo: explicit markers, joint-skeleton ghost, labeled webcam scene source, HTTP voice loop | Unity is committed; the fallback is reduced capability, not a second engine |

Use measured blockers and remaining time to trigger cuts. Prior experience is not a cut criterion. Remove optional breadth before reducing the quality of the central interaction:

1. Real haptics and its hardware integration.
2. Continuous video analysis, wake-word/background listening, unsolicited proactive commentary, and off-task conversation.
3. Additional Huawei OMNI integration; retain GPT Live and on-demand visual assessment.
4. Optional Sentry track work if its required evidence cannot be completed.
5. Extra dashboard views, custom-created hand assets, decorative effects.
6. A fifth step, or reduce four to three meaningful movements while keeping their guidance polished.
7. Only if still necessary, deliver a disclosed reduced prototype with explicit markers or unavailable voice/visual feedback. These are unmet requirements, not a redefinition of the requested finish line.

Preserve calibration, real recording/save/replay, legible spatial ghost/path, local learner-paced completion, truthful feedback, and tracking-loss behavior. Keep the articulated hand, useful motion gates, and finished core controls wherever the device budget permits. If any core behavior fails, describe the result as a reduced prototype rather than claiming the quality target.

## 14. Demo, recovery, and submission

### A 60–120 second live demonstration

| Time | Beat | Audience sees |
| --- | --- | --- |
| 0–10 s | Explain: “Record once; follow the expert in your own workspace.” | Real mat and current headset/spectator view |
| 10–35 s | Expert performs the small task with narration and brief checkpoint holds | Live motion and recording state; explicit markers only if using the disclosed fallback |
| 35–50 s | Stop and compile; display generated/reviewed labels | Actual compile status, no fake countdown |
| 50–65 s | Reset parts, swap headset, quick learner calibration | Different person and alignment confirmation |
| 65–105 s | Learner follows ghost, asks “Am I doing this right?”, hears a scene-grounded correction, then resumes | Guide waits during inspection; current frame and actual spoken feedback shown |
| 105–120 s | Show final object and limitation | Motion checkpoint and visual advice are distinct; hidden physical properties remain unverified |

Rehearse headset swap, calibration (target ≈20 s; narrate over it while resetting parts) and actual voice/vision latency; if they do not fit the timing, announce a longer live run or show a clearly labeled capture clip followed by live learner guidance. Do not silently replace fresh capture/compilation with a cached tutorial or replayed AI answer. Keep evidence of the second fresh task available even if the stage demo shows only one. Retain local controls for a failed live request and disclose the failure.

### Recovery kit

- Known-good standalone APK plus server build/revision and exported real tutorial on the laptop.
- Installed APK with preloaded tutorial and verified USB API connection; separate startup/recalibration runbook.
- Battery/charger, stable cable routing, reset layout photo, spare large parts.
- A 60–90 second backup recording labeled “Recorded demonstration.”
- Side-by-side webcam and schematic spectator if casting is unreliable.
- Short instructions for recenter/recalibrate/reload; no hidden operator advancement.

Meta documents casting/recording tools, but the final audience path and audio must be checked on the actual laptop/headset combination. [Meta Quest Developer Hub media tools](https://developers.meta.com/horizon/documentation/spatial-sdk/ts-mqdh-media/)

### Submission evidence

Prepare a short README, architecture diagram, setup commands, tested-device information, limitations, source/design assets, team badge IDs, and selected sponsor tracks. Capture one end-to-end video and the concrete Codex/Sentry/OMNI evidence for tracks actually completed. Recheck the event portal for final instructions. The team performs submission; this plan has not registered, selected prizes, or submitted anything.

## 15. Ambition after the hackathon

The narrow demo establishes only the first step toward broader physical-skill transfer. Expand after the central loop is measured:

| Stage | Investment | Gate before claiming success |
| --- | --- | --- |
| Reliable task library | Better authoring, asset export, repeatable calibration, onboarding | Several novice users can complete multiple approved tasks |
| Richer motion adaptation | Extend initial ordered gates to richer trajectory matching, hand-size handling, left/right retargeting | Measured false-accept/false-reject rates; no degraded usability |
| Object-aware transfer | Versioned object references/pose providers, source/destination bindings and validated retargeting | Independently rearranged parts work without task-name branches; measured pose uncertainty, occlusion recovery and path clearance |
| Stronger object-state verification | Extend snapshot coaching to measured task-specific state checks, tracking or sensors | Labeled real-world evaluation proves each claimed check; avoid inferring hidden state from appearance |
| Durable product | Auth/storage, privacy controls, deployment, analytics, accessibility, device support | Recovery/security testing and longitudinal use; cloud anchors justified by a real need |

Do not infer training effectiveness or universal object support from the two-task reuse check. A later study should compare completion time, errors, assistance requests, and retention against an ordinary video/manual across more tasks and learners.

## 16. Remaining decisions and evidence status

| Question | Current default | Who resolves it / by when |
| --- | --- | --- |
| Installed OS/app/tool versions | Hardware confirmed: Quest 3S with controllers; native versions to record | XR + integration at setup |
| Unity/Meta/audio compatibility | Unity 6.3/WebRTC 3.0.0 candidate; Meta release family and exact patches unverified | Integration + XR/voice in TRAIL-18 |
| Actual team size and available hours | Four people; 24 h cap | Team at kickoff; compress optional scope if fewer |
| Physical parts and mat | Bottle + large LEGO-style assemblies, fixed layout per tutorial; stand fallback | XR + motion in first 30 min |
| Hands while manipulating chosen parts | Unverified | Exact-task spike before H+2 |
| Registration accuracy across people | Unverified | Physical proof before H+4 |
| Model credentials and account access | `gpt-live-1` + image-capable Responses + narration; mocks are development only | Voice in first hour |
| Native camera access | MRUK headset frames required; actual readback/freshness unverified | XR first native slot; integrated by physical proof |
| Live conversation with immersive XR | Unverified; core acceptance gate | Voice + XR before H+2, full conversation by H+7 |
| Spectator passthrough and audio | Unverified | Integration in first two hours |
| Borrowed haptic hardware/protocol | Unconfirmed; mock | Only after physical loop |

This revision uses official Unity/Meta/OpenAI documentation. Earlier event and package research remains historical context; refresh it where the implementation depends on a current deadline or release. Device behavior, the proposed package combination, API-account access, latency targets, and the human task have not been validated by writing this plan. Source links sit beside the decisions they support; algorithm thresholds and schedule estimates are project proposals.

## 17. Immediate tickets to create

Use these stable ticket labels and their dependencies, checking existing implementation before starting each. Every ticket should include owned files and evidence requirements. Later-numbered Live/scene tickets begin early in parallel.

- [ ] **TRAIL-01 — Validate Quest 3S runtime, task, deadlines.** Owner XR/integration; no dependency. Record OS/APK/tool versions, hand mode, parts/layout, remaining hours, and sponsor cutoff in `docs/device-check.md`.
- [ ] **TRAIL-02 — Preserve scaffold and establish native API connection.** Owner integration; software scaffold already exists. Preserve manifests/scripts/CI and fixture; add native pairing/auth and fresh-install/API checks. Native project bootstrap is TRAIL-18; do not recreate the web repo.
- [ ] **TRAIL-03 — Freeze schemas and synthetic fixture.** Owner motion + integration; starts from the existing scaffold portion of 02 without waiting for native auth, and coordinates assembly integration with 18. Freeze canonical recording/tutorial/events plus versioned native sidecar, strict C# and Zod validators, handedness/joint maps and translated/rotated golden fixtures; T36/T37. Native auth T38 belongs to 02. Preserve existing v1 imports.
- [ ] **TRAIL-04 — Prove real AR capture and replay.** Owner XR; depends on 03/18. Unity passthrough/OpenXR, fresh native hand adapter, five-second canonical real fixture and separate ghost; report gaps and provenance.
- [ ] **TRAIL-05 — Implement and validate workspace registration.** Owner XR + motion; depends on 03/04. Three-point transform plus held-out mark; second-person and rotated-mat evidence.
- [ ] **TRAIL-06 — Build pure C# local motion progression.** Owner motion; depends on 03, tunes against 04. Start gate, ordered intermediate gates, adaptive cue progress, dwell, validity, repeat, pause, exactly-once completion; pass T03–T12 and T20–T22.
- [ ] **TRAIL-07 — Connect one interactive step.** Owner XR + motion; depends on 05/06. Second learner completes at their own speed and survives hand loss.
- [ ] **TRAIL-08 — Record, segment, review, persist a multi-step task.** Owner motion + integration + XR; depends on 04/06. Explicit-marker pipeline followed by motion proposals, bounded upload/finalize, cache/reload, editable boundary/gate review, fresh 3–5-step run.
- [ ] **TRAIL-09 — Capture synchronized narration.** Owner voice; depends on 02/03. Native mic/XR concurrency, complete WAV, offset/drift measurement, fallback provenance.
- [ ] **TRAIL-10 — Generate reviewed semantic labels.** Owner voice; depends on 08/09. Transcription timestamps, fixed-segment labeling, strict validation and provenance, immutable reviewed tutorial. Live conversation is a separate parallel ticket, not blocked on full authoring.
- [ ] **TRAIL-11 — Deliver spectator and recovery path.** Owner integration; starts with 03 mocks, completes after 07. Snapshot relay, stale indicator, real audience view, server/network recovery.
- [ ] **TRAIL-12 — Complete visual and interaction quality.** Owner XR + integration, with motion/voice support; depends on 07/08/10/11/16/17. Storyboard-aligned ghost/cues, small voice states/captions, review/spectator polish, in-headset clarity and frame-budget review.
- [ ] **TRAIL-13 — Complete learner acceptance and demo.** Owner all; depends on 12. Two fresh task families without code changes, three clean runs, non-builder test, correct/wrong/uncertain spoken visual feedback, recovery drills, backup video and setup/limitations.
- [ ] **TRAIL-14 — Optional sponsor additions and evidence.** Owner voice/integration; only with spare capacity after core quality work. Useful OMNI scenario or Sentry Logs+Tracing debugging story; preserve OpenAI/Codex evidence from core work.
- [ ] **TRAIL-15 — Optional bounded haptics.** Owner integration; only after core quality gates and a passing hardware spike. Mock-compatible adapter, duration cutoff/watchdog, disconnect test; otherwise close as cut.
- [ ] **TRAIL-16 — Deliver GPT Live headset conversation.** Owner voice; starts immediately on account/desktop spike, depends on 02/03 for integration and 07 for live guide context. Native Unity WebRTC/mic/playback, paired session routes, trusted sideband, client delegation, captions, interruption/echo handling, stale-generation protection and clean close; T24/T25/T30/T40 plus actual APK/Quest audio evidence. Requires 18 for native acceptance; desktop checks are diagnostics. Coordinate rendering with XR.
- [ ] **TRAIL-17 — Deliver fresh-scene inspection and spoken feedback.** Owner integration coordinates reference storage/review; voice owns the separate vision service/Responses and Live integration, XR owns native MRUK acquisition/readback and freshness. Start native source spike with 18; contracts/auth from 02/03, reviewed step references from 08, spoken delivery from 16 and the dedicated backend from 20. Nonce/age/revision checks, visible/uncertain verdicts, T26–T29/T45–T47 and real correct/wrong/obscured/adjusted-view trials with verified headset speech. No spatial coordinates or completion actions from AI.
- [ ] **TRAIL-18 — Add Unity + Meta XR headset project.** Owner integration + XR, voice coordinates audio dependency. Preserve existing 02 scaffold. Create `apps/quest`, pin compatible editor/OpenXR/Core/Interaction/MRUK/WebRTC set, configure Android ARM64/IL2CPP, versioned assets/locks and reproducible test/build wrappers. Install a minimal standalone APK with one rig and world-space UI. Pass T31–T35 plus native mapping/serialization/auth/audio gates T36–T40 as consumers land. Supplies setup for 04/09/16/17; their combined acceptance proves the full hand/ghost/image/voice slice. No IWSDK install or Vite downgrade.
- [ ] **TRAIL-19 — Prove different-room transfer and evaluate scene-assisted setup.** Owner XR; motion owns transform/origin fixtures and error analysis, integration owns scene setup/persistence boundaries and scheduling, voice owns cross-background inspection trials. Depends on 04/05/06/18 for native capture/calibration/replay; integrates 07/17 for final learner/coaching trials. Implement the bounded MRUK milestone in section 7, pass T41–T44, and record the enable/defer decision with actual device evidence. Cross-room transfer remains required even if scene assistance is unavailable. No arbitrary-object tracker or custom reconstruction pipeline is implied.

- [ ] **TRAIL-20 — Build the dedicated visual interpretation backend.** Owner voice/AI; integration owns package/launcher/locks, service authentication and main-server adapter. Starts alongside 16 after shared inspection contracts in 03; supplies backend for 17 without depending on completed voice transport. Add `apps/vision`, internal v1 routes, bounded image processing/Responses adapter, typed results, cancellation/deduplication and health/readiness. Use synthetic image fixtures for service tests; then real Quest pixels and model calls for T45–T47 with 17. Add it to applicable check/build/dev scripts and document two-process startup. A standalone service test is not full camera-to-spoken-feedback acceptance.

Ticket numbering preserves earlier references; execute dependencies rather than numeric order. **First working session:** Person 4 starts Unity setup/native connection; Person 1 prepares the rig, hand/camera probes and physical task; Person 2 builds shared fixtures and the C# domain engine; Person 3 proves native Live audio alongside server integration. Meet with actual APK, spatial, voice and image evidence before broader authoring/polish. Reconcile elapsed targets with remaining time; the stack change does not restart the build clock.
