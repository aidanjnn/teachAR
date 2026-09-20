# Immersive entry and continuous holographic hands

This extends the browser UI and [preview-first practice flow](web-practice-flow.md). Quest Browser remains the demo runtime. This is an implementation handoff, not headset acceptance evidence.

## User flow

1. Open `/tutorial`, then **Enter the experience**. WebXR hand permission/session entry happens directly from the click. The page does not request a microphone or camera automatically.
2. Inside AR, choose **Create tutorial** or **Follow tutorial**.
3. Create offers **Enable narration & photos** or **Hands only**. Requests are sequential; either resource may be denied without blocking hand capture. Already-live resources are reused within the session. Browser permission dialogs cannot be replaced by our immersive panels.
4. Choose the tutorial's save position once, mark the workspace, record, review, and save in AR. Starting-reference metadata defaults to the first recorded pose, so a browser text form is not required. Spoken narration and optional reference photos provide richer setup context; automatically understanding/transcribing that context remains future work.
5. Follow uses the existing local library, workspace placement, demonstration preview, broad starting regions and ordered movement gates. Reaching a movement checkpoint starts the next preview automatically. It never verifies a physical outcome.
6. Exit returns to the simple launcher. **Browser tools · review, import and backup** exposes the existing editor and recovery controls. Detailed text editing and file import/export still use browser UI.

Camera/microphone adapters release resources on session end and reject late permission results. Hands-only cancels pending setup. A browser permission prompt may temporarily take XR focus; its result stays bound to the same take/session generation and resumes preparation when it returns. Settings is unavailable while that prompt is pending, so navigation cannot strand setup. Existing recording exit confirmation now also works through the real XR action dispatcher. Device permission prompts, simultaneous camera/mic/XR, and first-use audio need headset testing; software mocks do not prove browser/device support.

## Hand rendering

`public/holographic-hand.mjs` loads left/right generic skinned hand assets from [Immersive Web input profiles](https://github.com/immersive-web/webxr-input-profiles/tree/f4992299601614adbfefd398dc8e281556bb7444/packages/assets/profiles/generic-hand). MIT license, source commit and SHA256 hashes are included in `public/assets/hands`. These are third-party generic models, not captured user hands.

- All 25 named WebXR joint positions/quaternions drive the skin; recorded data, calibration and matcher contracts are unchanged.
- Meshes use cyan translucent surfaces and view-dependent rim brightness. Learner surfaces are subtler; tracking markers and connecting rods are hidden in `/tutorial` and review once the skin is ready. Loading or failed models retain the measured joint outlines so capture and review remain visible; missing joints are never inferred.
- Incomplete joint data hides a skin rather than retaining a plausible frozen pose. Asset failure is surfaced and pauses learning. Motion checks still use their existing valid-hand rules, not mesh vertices.
- This is a generic hand silhouette, not anatomical personalization. No forearm, cloth/object occlusion, missing-hand inference, grasp verification or finger-pose grading is added. Real headset appearance/performance remain unmeasured.
- Three.js GLTFLoader and SkeletonUtils are copied from the exact locked Three version, source-hash checked and served locally. No runtime CDN fetches. `prepare-vendor.mjs` also validates the hand assets and license.

The surface is presentation only. Future vision/OMNI/voice integrations must preserve the existing local progression authority and freshness rules in [web-practice-flow.md](web-practice-flow.md). Do not advance steps from a green hand, audio response, or visual model verdict.

The optional Voice coach card remains available under **Browser tools · review, import and backup**. Start it there before entering AR; the in-headset Ask coach action and local progression remain unchanged.

## Source seams

- `apps/webxr/public/tutorial.html`, `tutorial.css`: minimal launcher and collapsed browser tools.
- `apps/webxr/public/ar.js`: user-activated XR entry, capture resource adapters, session cleanup and exit dispatch.
- `apps/webxr/public/experience-entry.mjs`: optional capture coordination and cancellation generation; adapters own late-acquired stream cleanup.
- `apps/webxr/public/tutorial-ui.mjs`, `tutorial-guide.mjs`: immersive preparation states and fallback.
- `apps/webxr/public/holographic-hand.mjs`, `hand-guide.mjs`, `tutorial-review.mjs`: skin loading, pose mapping and presentation.

## Acceptance on Quest

Leave any old AR session, reload the same origin (current development address `http://localhost:4345/tutorial`), and enter again. Keep matching USB port forwarding and the local server running.

- Enter without opening browser tools. Create with Hands only; set one save position, place the workspace, record two steps, review/save, then Follow from the immersive library.
- Watch the preview; move near the broad start regions; practise with lateral variation; reach the endpoint and keep holding the object. The next step should preview without a Next press. Still check the physical result yourself.
- Repeat with narration/photos allowed, each permission denied separately, permission setup cancelled, and XR ended while a permission request is pending. No stale setup should revive a cancelled stream or overwrite the next screen.
- Check both hands, curved fingers, bright and dark backgrounds, lost tracking, menu/pause, and exit confirmation during recording. No joint spheres or bone rods should show in the tutor. Check hand scale/orientation against real hands.
- Reload and verify the saved tutorial remains available at the same origin. Test browser export/import as recovery separately.

Automated coverage renders the actual GLBs and shader in Chromium, checks hidden joint geometry and preserved input poses, partial tracking, permission fallback/cancellation, launcher layout, and the XR request boundary. It does not impersonate a successful physical headset run. No paid provider calls are required.
