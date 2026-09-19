# Meta + object vision: decisions after the prototype tests

Investigated 19 September 2026. Recommendation: keep the reviewed fixed-workspace lesson as the demo foundation. Native camera projection is the next platform investment; evaluate free object localization separately. A model finding a shirt does not tell us whether a fold or grip is correct.

## What the existing experiments actually established

The user reported camera frames and AR feedback working on the Quest, and screenshots showed plausible AI arrangement match/mismatch messages. The user also reported that following an exact hand path was excessively precise. Those observations support separating demonstration from grading. They do not measure accuracy, registration drift, camera latency, clothing occlusion, or transfer of a skill to another person.

The new `/tutorial` implementation can record/review/replay paired hand streams without grading finger positions. Its software tests use generated data. The gold fold line is manually authored in the registered workspace; it is not dynamically inferred from a garment. Two real folding steps are the next necessary hardware test.

## Official Meta building blocks

**Passthrough camera samples:** Meta supplies camera access, timestamps/calibration, camera-to-world projection, and a multi-object detection example. Use these as reference implementations in the existing native project. The repository lists Quest 3/3S and explicitly distinguishes physical device support from simulator support. Sample requirements differ by sample/document version, so retain the native platform branch's tested pins instead of blindly upgrading packages. [Official samples](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples).

**Camera-to-world:** `PassthroughCameraAccess.GetCameraPose()` and `ViewportPointToRay()` are the relevant bridge from a camera observation to a spatial cue. Geometric consequence: a pixel supplies a ray, not a complete 3D position. Intersect it with a known table plane or another valid surface/depth observation. Preserve the pose associated with the captured image, not the headset pose when inference finishes. Account for resize/letterbox coordinates before constructing the ray. [Meta camera-to-world sample](https://developers.meta.com/horizon/documentation/unity/unity-sample-camera-to-world/).

**On-device inference example:** Meta's Unity Inference Engine sample uses YOLOv9t with a fixed 80-class vocabulary. Its documentation warns that the example's box visualization is not perfectly aligned and points to camera-to-world for better projection. Reuse camera/inference scheduling and lifecycle handling; do not assume its labels include custom plushies, folding stages, or precise grasp locations. That sample is a starting point, not an acceptance test for our task. [Meta inference sample](https://developers.meta.com/horizon/documentation/unity/unity-pca-sentis/).

**Development tooling:** Meta's `agentic-tools` repository provides `metavr` tooling for device/app operations, performance and documentation workflows. It could help the native owners inspect an installed build. Nothing from it was installed during this work, and it does not substitute for wearing the headset and checking registration. [Official tooling](https://github.com/meta-quest/agentic-tools).

## Free-model candidates and the local result

| Candidate | Useful role | Does not establish |
| --- | --- | --- |
| Grounding DINO Tiny | Text-prompted 2D object proposals, initially on the laptop | Persistent identity, 3D position, grip or fold correctness |
| OWLv2 | Text-conditioned or exemplar-image object localization | Reliable recognition of unseen sides or cloth state |
| EdgeTAM / SAM 2 | Follow a prompted object mask across video | Semantic correctness, invisible cloth geometry, or calibrated depth |
| Meta YOLOv9t example | Native closed-vocabulary inference/projection integration | Arbitrary expert-defined object categories |

Grounding DINO supports text-conditioned open-set detection. OWLv2 also exposes image-guided detection, which is relevant to selecting an object from an expert reference crop. Neither is a complete task verifier. [Grounding DINO docs](https://huggingface.co/docs/transformers/model_doc/grounding-dino), [OWLv2 docs](https://huggingface.co/docs/transformers/model_doc/owlv2).

EdgeTAM targets efficient prompted video segmentation and reports an iPhone benchmark; that is **not a Quest performance measurement**. SAM 2 supplies a broader prompted image/video segmentation baseline. Do not begin with either merely to get a mask if the immediate requirement is a stable table cue. [EdgeTAM](https://github.com/facebookresearch/EdgeTAM), [SAM 2](https://github.com/facebookresearch/sam2).

### Actual offline experiment

An isolated `../model-spike` environment now runs `IDEA-Research/grounding-dino-tiny` at pinned revision `a2bb814dd30d776dcf7e30523b00659f4f141c71`, using safetensors, Transformers 4.57.6, CPU with four Torch threads. No hosted inference, paid API, or image upload was used. Public model weights were downloaded; the private Quest reference stayed local. [Official model card](https://huggingface.co/IDEA-Research/grounding-dino-tiny).

On **one existing 960×720 Quest reference**, prompts for the orange fox, black/white goose and cube-shaped toy produced three boxes that visually cover the corresponding toys. Forward-pass times were **4.09 s first pass / 2.59 s second pass**, excluding preprocessing and loading. A separate negative-prompt pass took 4.29 s. This is too slow to drive frame-rate hand corrections on this CPU configuration. It may be useful for occasional object acquisition, followed by a faster local tracker if that tracker is independently validated.

The negative-prompt pass asked for a screwdriver, shirt and fox. At the default 0.25 thresholds it found the fox but also emitted false screwdriver/shirt detections and an uninformative label. A higher cutoff removes those particular low-score hits; tuning on the same image is not evidence of general reliability. Scores are not calibrated correctness probabilities. The experiment says “promising localization candidate with observed false positives,” not “object detection solved.” Raw JSON and private annotated results are under `../model-spike/runs/` and are ignored by Git.

## Next useful acceptance gates

1. **Teach two real folds:** record both hands, review/trim, mark an optional fold line, then have another person replay with the same garment layout. Export diagnostics. Measure whether useful portions of both hands survive grasp occlusion and whether the cue stays visually on the intended fold line.
2. **Collect a small held-out vision set:** correct fold, wrong edge folded, wrong direction, half-finished fold, occluded view, moved viewpoint, empty table, similar distractor. Capture multiple independent takes; keep some out of prompt/threshold tuning. No accuracy claim from the plushie image.
3. **Acquire an object without advancing a step:** detector result must retain frame ID, capture time, image dimensions, resize transform, prompt/model revision and uncertainty. Reject obsolete results after changing lesson, step, workspace, camera or capture. Hide stale highlights. Require a user-confirmed match before using a new identity in the first demo.
4. **Project a cue correctly:** use capture-time camera calibration/pose plus the registered table plane. Validate alignment at held-out points while moving the head. A bounding box centre projected to the table is a coarse target, not a precise contact point on a tall object.
5. **Only then grade a task checkpoint:** separate broad grasp/fold/release phases and outcome evidence. Use loose, task-relevant regions instead of forcing the learner to reproduce every joint. A completed hand path is insufficient evidence that cloth moved correctly. Keep unknown/occluded/delayed outcomes from advancing.

Do not put a slow detector or VLM in the live ghost-rendering loop. Quest tracking/rendering should stay local; asynchronous vision can update a validated observation at a checkpoint. No automatic fold verifier or dynamic object-relative remapping was enabled in this increment.
