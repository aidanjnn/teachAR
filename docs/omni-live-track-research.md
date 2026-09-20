# Huawei OMNI Live track: research and integration options

Research notes, 2026-09-20, about 07:25 EDT. Read-only findings from the track README, the yibuapi
gateway, the current `main`, the open PRs and a teammate's object-anchoring proposal. Nothing here is
implemented yet; this document exists so the team can pick the OMNI scope before judging (about 09:45).
Boundary rules from `AGENTS.md` apply to whatever is built: the provider key stays on the server, the
mock stays the default, the headset alone advances steps, model output is advice and never a completion
event, uploads and freshness are bounded, and no camera frames or audio reach Git or logs.


## Summary
- Track wants: a functional, demo-ready edge-device app that uses an OMNI multimodal model (Qwen3.5-Omni named) through a cloud API, with vision, speech/audio and language working together in one end-to-end scenario, plus a repo with setup/run instructions. Credits: 40 CAD per team through yibuapi (OpenAI-compatible gateway), apply once at https://luma.com/0fhypcu0, key by email.
- Trail has: the headset hand tutor, a paired Fastify API with the OpenAI voice coach, a fresh-frame camera snapshot module (apps/webxr/public/camera-snapshot.mjs) and per-step reference photos in the browser, a bounded but unconnected vision inspection service (apps/vision), and OMNI_* env placeholders that nothing reads.
- Missing: any OMNI/yibuapi adapter, any route that sends a headset frame plus a question to a model from the browser tutor, a UI action that plays a spoken multimodal answer, and the yibuapi key itself.
- Recommended minimal build (~2 h): POST /api/scene-coach sends current camera frame + the step's reference photo + approved step text + a short spoken question to qwen3.5-omni-flash at https://yibuapi.com/v1/chat/completions with modalities ["text","audio"], streams WAV audio back; a "Look & advise" button on the tutor page captures via nextVideoSnapshot and plays the reply. Advice only, never progression.
- Honest risk: no key in hand yet; yibuapi pass-through of Qwen-Omni audio-output fields unverified (5-minute curl test first); camera + immersive session concurrency on this Quest 3S unverified, so the fallback is the flat tutor page (Quest Browser 2D or laptop webcam), which the README allows as a "simulated edge-device environment".

## Judging weights (from the README)
Scenario Value & Creativity 30%; Use of OMNI Capabilities 25%; Demo Completeness 20% ("a small but complete experience"); Interaction Experience 15%; Technical Implementation 10%. Extra consideration: multi-device collaboration, edge inference, latency reduction/caching, privacy protection, safety-aware design. Concept-only designs, slide decks and static mockups are not eligible.

## yibuapi facts found
- https://yibuapi.com/api/pricing lists qwen3.5-omni-flash, qwen3.5-omni-plus-realtime, qwen3.8-omni-flash, all endpoint type "openai". Docs: https://yibuapi.apifox.cn list /v1/chat/completions, /v1/messages, /v1/audio/speech; they do not document input_audio, image_url, modalities or audio output. Alibaba's Qwen-Omni OpenAI-compatible format: stream=true mandatory for audio output; modalities ["text","audio"]; audio {voice, format:"wav"}; input_audio {data, format}; image_url data URL; streamed audio in choices[0].delta.audio.data (base64 WAV 24 kHz). Whether yibuapi forwards these is unverified until a key exists.

## Pieces, in dependency order
- A. yibuapi curl smoke test with the key (0.25 h, first).
- B. Server config (OMNI_API_KEY, OMNI_BASE_URL default https://yibuapi.com/v1, OMNI_MODEL default qwen3.5-omni-flash, SCENE_COACH off|omni) + apps/server/src/ai/omni-gateway.ts (fetch + SSE parse, bounded body, 12 s deadline, prompt = coach-prompts RULES + vision instructions) with a unit test (1.5 h).
- C. Route POST /api/scene-coach behind the learnerOrAuthor pairing guard: grounded context, VisionImageSchema image, optional reference, optional ≤6 s WAV, source quest-camera|workspace-webcam, captureAgeMs, epoch; returns transcript + WAV base64; mock/off -> 503; one in flight, 3 s spacing, 60 calls per process; lexical guard against completion claims/coordinates (1.5 h).
- D. Browser apps/webxr/public/scene-coach.mjs + "Look & advise" button in the learn panel, snapshot via the existing tutorialSnapshot(), Web Audio playback with a generation/context watchdog, caption via the existing Coach: detail line (2 h).
- E. Camera in Follow mode: Enable camera on the flat page before Enter; if in-AR frames stall, fall back to the flat page (0.5 h + 15 min headset probe).
- F. Env/README/docs incl. a "Run for the OMNI Live track" section (1 h).
Total A-F ~7 h. What fits before 09:45 judging: A+B+C plus a flat-page button with a fixed question (~2 h), demoed on the Quest Browser 2D page cast to the laptop or a laptop webcam. If the key has not arrived by ~08:15, stop building and pitch it as integration-ready with the request shape in the README; without real OMNI use there is no eligible entry, do not fake it.

## Boundary rules that must hold
Key on the server only; mock default; the headset alone advances steps (OMNI output is advice text/audio); bounded uploads (JPEG ≤2 MiB/1280 px, audio ≤6 s), capture age ≤2 s, one in flight, cooldown, process cap; late replies rejected on tutorial/step/epoch/mode/visibility change; server-side lexical guard; frames and audio ephemeral, never in logs or Git.

## How to impress these judges
- Scenario (30%): "A chatbot can't see your fold; a vision-only checker can't hear your question; this one does both and answers while your hands stay on the paper." Keep the ghost-hand loop as the spine; OMNI is the coach that looks.
- OMNI use (25%): one request carries the frame, the expert's reference photo and the spoken question; the answer is speech. Show the request shape; name qwen3.5-omni-flash and the delta.audio path; mention plus-realtime as next, not done.
- Completeness (20%): advisory, so a failed call degrades to the tutor; rehearse headset camera and flat-page fallback.
- Interaction (15%): log per-call latency; caption + voice, one voice at a time; the refusal to confirm completion is deliberate.
- Technical (10%) + extras: edge-to-cloud diagram (Quest Browser over USB loopback -> paired Fastify -> yibuapi); privacy (key on server, opt-in camera, ephemeral frames); safety (cannot advance steps, lexical guard, bounded uploads, freshness). State what was verified and what was not.
- Repo requirement: runnable README section (pnpm install --frozen-lockfile, pnpm build, .env with AI_PROVIDER, OMNI_API_KEY, OMNI_BASE_URL, OMNI_MODEL, SCENE_COACH=omni, ALLOW_USB_LOOPBACK=true, PAIRING_ORIGINS=http://localhost:3001, pnpm start:server, adb reverse tcp:3001 tcp:3001, open http://localhost:3001/tutorial).

## Related PRs
#10 (vision service, merged), #17 (camera snapshot + reference photos), #28 (voice coach), #31 open (voice commands; says "No OMNI or visual grading was added" and "do not wire OMNI observations into the local navigation dispatcher"), #32 (this hardening branch). No PR mentions OMNI.

## Future work to state, not claim
In-AR camera capture with verified concurrency; interruptible realtime via qwen3.5-omni-plus-realtime; periodic frames and a separate physical-result gate; laptop spectator view of the same advice; one cloud model for all speech.

# Addendum: reconciling the teammate's object-anchoring research with "Look & advise"

Source read: /Users/ultimateslayer/Library/Messages/Attachments/33/03/1FD33076-F5AC-40E2-B3D9-D3AB64309584/omni-spatial-research-2026-09-20.md

## Relationship and scoring
- Same track, two scenarios. Look & advise puts OMNI in the live loop (frame + reference photo + spoken question in, speech out, one call). Object anchoring uses OMNI for one "find the sheet" region; placement comes from local CV, a marker mat and geometry, speech optional.
- On the README weights, Look & advise scores better today: Use of OMNI (modalities work together in one call), Demo Completeness (buildable, degrades to the tutor), Interaction (spoken answer with caption). Anchoring is stronger on Scenario Value and Technical as a story, but its OMNI role is thin and its geometry is unvalidated, which the README penalises.

## What their flow needs that does not exist
- Placement today is two fingertip marks: workspace(start,end) in apps/webxr/public/motion-core.mjs (origin, heading, fixed up axis); setWorkspace in tutorial-guide.mjs; localJoints and save_position live in that frame.
- No marker/homography code in apps/webxr; no three-point mat registration; camera-snapshot.mjs gives timing only, no intrinsics or pixel-to-world.
- No object-anchor field: validateTutorial in tutorial-core.mjs reconstructs known fields (an added property is dropped) and requires calibration_span_m between 0.2 and 1.2 m, so a 15 cm sheet cannot be the span. Needs a versioned extension plus migration.
- Browser CV means vendoring opencv.js (large wasm, hash-checked by prepare-vendor.mjs) or hand-rolled contour fitting. Hard parts: composing paper pose into the workspace basis (yaw plus translation only, level surface assumed), keeping save_position and cues in that frame, invalidating on re-acquire via epoch.

## Invariants
- Respected: headset alone advances (placement is setup, not progression); scale preserved; OMNI output is a pixel ROI validated by local geometry, not metres; the coordinate guard in apps/vision/src/provider.ts stays intact.
- Compatible with "origin plus heading" if the detected pose only feeds the existing workspace transform: a rigid re-placement of the same-sized sheet, not arbitrary object retargeting.
- Collisions: calibration_span_m validation; mat re-registration must join the session/origin invalidation rule; locking after the first fold must be enforced or a deforming crane would move the whole demonstration.

## Feasibility and combined order
- Next two hours: neither full flow. Their Phase 1 alone (anchor metadata, manual learner pose) is 4-6 h with tests; Phase 2 (mat, homography, corner refinement) is days. Look & advise minimal (server route, flat-page button) is about 2 h once the yibuapi key exists.
- Today: pieces A-C (smoke test, OMNI gateway, POST /api/scene-coach, flat-page button). Next: their Phase 1 (versioned anchor extension, learner touches paper corners), then Phase 2 mat geometry, then OMNI acquisition, then spoken "Use this paper".

## One honest demo story using both
"Place the paper, look at it, ask." Learner marks the workspace with the existing two table points, lays the sheet down, asks "Is my paper placed right?" OMNI sees the fresh frame and the expert's reference photo for step 1 and answers in speech: "Turn the sheet so the marked corner is nearest you." The learner adjusts, the ghost hands appear, practice starts. Vision, speech and language run through OMNI; alignment is human-executed on the model's advice; the transform stays manual origin plus heading. Automatic acquisition is the stated next step, not a claim.
