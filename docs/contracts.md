# Shared wire contracts (TRAIL-03)

`packages/contracts/src/index.ts` preserves all existing imports and exports the
strict schemas below. `apps/quest/Assets/Trail/Contracts/` provides equivalent
pure C# DTOs and explicit parsing/serialization. These contracts describe data;
they do not establish tracking quality, physical calibration or assembly success.

## Versions and compatibility

| Surface | Version | Definition |
| --- | --- | --- |
| Portable recording | `schemaVersion: 1` | `recording.ts`, `Recording` |
| Tutorial | `schemaVersion: 1` | `tutorial.ts`, `Tutorial` |
| Guide event | `schemaVersion: 1` | `guide.ts`, `GuideEvent` |
| Native capture provenance | `schemaVersion: 1` | `native.ts`, `NativeCaptureSidecar` |
| Native session calibration | `schemaVersion: 2` | `native.ts`, `CalibrationV2` |
| Scene reference manifest | `schemaVersion: 1` | `scene.ts`, `SceneReferenceManifest` |
| Inspection request/observation/result | owned by the v1 inspection protocol | `scene.ts`, corresponding DTOs |

Recording v1 is unchanged: workspace-relative meters, canonical 25 names and
order, `[x,y,z,w]` quaternions, monotonic relative milliseconds, actual timestamps,
explicit valid/missing hand samples, nullable head/audio and bounded frame count.
The workspace is right-handed: +X right, +Y up, +Z toward the learner; angles
are radians. Pose quaternions map joint-local axes into the containing frame.
The original `fixtures/synthetic-reach.v1.json` remains an import/round-trip test.
Zero coordinates remain valid. Neither palm nor provider/session fields are added
to recording v1. Unknown fields and versions are rejected, never stripped.

The existing v1 audio `syncMethod` still accepts only `media-recorder-start` and
`manual-markers`. Native audio extensions require their own versioned agreement;
this change does not silently add `unity-dsp-clock-map` or implement voice.
`CalibrationV2` is separate and must not be imported as a legacy calibration.
Its `valid` flag is stored evidence, not permission to reuse registration in a
new session: runtime must check tracking session and origin revision.

Sidecars bind to recording ID plus a lowercase, exactly 64-character SHA-256
hash. Scene manifests also bind to tutorial ID/revision. The hash is of the
finalized recording bytes chosen and verified by storage. Do not recalculate it
from a reserialized native DTO: native float formatting and property ordering
can differ. Contract code accepts the already-verified hash as an argument and
has no hashing, storage or network dependency.

## Validation and use

TS boundaries use `SomeSchema.parse(unknown)`. Raw JSON imports should use
`parseContractJson(SomeSchema, json)` to additionally reject duplicate keys,
malformed JSON and nonfinite exponents before Zod. A server receiving an already
parsed object cannot recover duplicate-key evidence discarded upstream.

C# uses `ContractJson.ParseRecording(json)`, `ParseTutorial(json)`,
`ParseGuideEvent(json)` and corresponding `Parse{DTO}` methods. Matching
`Serialize{DTO}` methods validate the emitted wire form before returning it.
Failures throw `ContractException`. DTOs have PascalCase writable properties so
runtime adapters can construct them without reflection; unvalidated object
initializers are not trusted boundary data. Enum/discriminator properties are
strings, with exact permitted values enforced at parsing. Hand pairs use
`HandSamples.Left/Right`; optional guide gate indices are nullable integers, so
absence is distinct from zero. A `GuideEvent` DTO has the known union fields;
the wire parser accepts only fields belonging to its discriminator.

Both strict JSON readers limit input to 32 Mi UTF-16 code units, depth 64 and
2,000,000 value nodes. HTTP/asset boundaries must also enforce their byte limits
before decoding. The recording schema allows at most 120,000 ms, 3,600 frames and
256 markers. Frame times increase strictly and remain within duration. Required
fields are required even when nullable. Quaternions must be unit length within
`1e-4`; both signs are accepted. Every valid hand contains exactly 25 named poses.

Native vectors and quaternions use the existing `System.Numerics` float domain.
Finite JSON doubles outside float range fail native conversion explicitly, never
become infinity. Representable values are rounded for native math; parsed poses retain their
original double values for JSON re-export. Other vector fields round-trip within
`1e-6` relative/absolute error. The float-domain pose constructor allows an
additional `2e-7` normalization margin for conversion rounding; JSON validation
continues to enforce the exact double `1e-4` tolerance. The legacy TS
v1 schema retains double-valued coordinates and is not silently narrowed. Very
large finite coordinates can therefore fail native import; these are explicit
native representation limits, not a migration of v1. Normal workspace fixtures
are checked in both languages. Exact Android/IL2CPP behavior still needs the
native build gate.

A structurally valid tutorial is not sufficient to start a guide. Call
`parseTutorialForRecording(input, recording, verifiedHash)` in TS or
`ContractValidation.ValidateTutorialRecording(tutorial, recording, verifiedHash)`
in C#. These enforce recording/hash/workspace binding, ordered non-overlapping
half-open ranges, unique steps and active hands, start/checkpoint validity and
recorded wrist poses. Gates increase strictly between start and checkpoint;
`path-and-pose` requires gates for each active hand. Gate coordinates must derive
from valid recorded wrists. Position derivation tolerance is `1e-6` meters per
axis; quaternion comparison permits opposite signs with `1e-4` difference.
These are serialization comparison tolerances, not learner matching tolerances.

Titles are at most 60 characters and instructions at most 240. Model labels
require model provenance; manual/fallback provenance stays explicit. Draft edits
contain frame ranges/active hands/text, never authoritative target coordinates.
The server recomputes targets and binds delayed work to the current revision.

Guide event sequence numbers are safe nonnegative integers; revisions and frame
indices are bounded integers. Progress stays in `[0,1]`. Snapshot step and attempt
identities are present together. Consumers must additionally enforce session/run
binding and strictly increasing sequence across events; a single event parser
cannot establish ordering. Only the headset can create progression evidence.

Use `parseNativeSidecarForRecording` / `ValidateNativeCaptureRecording` to bind
recording ID/hash/source, and `parseSceneReferencesForTutorial` /
`ValidateSceneReferencesForTutorial` to bind sidecars to existing steps in the
current tutorial revision.

Scene references cannot cross their manifest's recording/hash/tutorial/revision.
Inspection requests contain full run/step/attempt/generation/epoch identity.
Results retain the exact requested reference list. Visual verdicts require an
observation, references and observed evidence; they are advice, never progression.
Freshness, one-use nonce consumption, asset hashes, decoded image limits, approved
references and stale-response cancellation belong to the inspection coordinator.
The model supplies only `CoachAssessment`, never authoritative identities.
Service-specific vision transports and authoring job/upload envelopes are owned
by their respective workstreams and are outside this native parity surface.

## Joint and coordinate agreement

`OPENXR_JOINT_MAP` and `OpenXrJointMap.CanonicalToNative` map each existing
canonical name to a semantic OpenXR enum name. The extra
`XR_HAND_JOINT_PALM_EXT` is explicitly excluded; pinky uses OpenXR's LITTLE names.
Do not use array index copying or an OVR 24-joint skeleton. These names follow the
[Khronos XrHandJointEXT definition](https://registry.khronos.org/OpenXR/specs/1.0/man/html/XrHandJointEXT.html).
Both sides use the same mapping. Missing any required joint invalidates the hand;
the map does not synthesize poses or establish bone-local rig corrections.

`fixtures/contracts/transforms.json` includes independent translated and rotated
expected poses plus a nontrivial wrist basis reflection. The TS transform code
is checked against these values; the C# harness tests the actual existing
`CoordinateBasis.ReflectZ` and its round trip. Calibration/rig workstreams can
consume the same expected rigid-transform vectors. These are synthetic numerical
tests, not evidence of actual OpenXR hand tracking or physical transfer.

## Regeneration and verification

Run from the repository root:

```sh
pnpm exec tsx packages/contracts/tools/export-schemas.ts /tmp/trail-contract-schemas.json
python3 packages/contracts/tools/generate-csharp.py /tmp/trail-contract-schemas.json
pnpm exec vitest run packages/contracts/test
DOTNET=/path/to/dotnet pnpm exec tsx packages/contracts/tools/test-native.ts
# Existing editor only; keeps its project, source hashes, log and XML in a temporary directory:
pnpm --filter @trail/contracts test:unity-isolated
pnpm check
pnpm validate:fixtures
```

Use an existing .NET 8 SDK; the native runner fails clearly if unavailable. The
console harness compiles the actual pure production C# files, uses no NuGet test
packages, and exercises the shared valid/invalid corpus, DTO round-trips, legacy
import, binding, joint map and basis conversion. `System.Text.Json` is used only
by the .NET test harness to apply fixture mutations and compare results; it is
not a Unity runtime dependency. Generated code uses explicit fields and a bounded
schema interpreter without reflection/dynamic code. This is suitable for an AOT
validation attempt but does not substitute for testing the actual IL2CPP APK.

The Vitest regeneration test fails if the generated models, readers or structural
constraints drift from the pinned Zod schemas (Python 3 is required). Refinements
are handwritten in both languages and checked against `corpus.json`; JSON Schema
cannot encode all cross-field rules. Add a valid/invalid corpus case when changing
semantics. `generate-fixtures.ts` reproduces synthetic examples, not real media.
The production files also passed 5 EditMode tests in a minimal temporary Unity
6000.3.24f1 project containing the unchanged Contracts/Motion/test assemblies and
Test Framework 1.4.6. The reproducible `test:unity-isolated` command records copied source hashes,
editor path/version, setup manifest, log and result XML in its printed temporary
project directory. It fails if production sources change during the run.
The full repository `pnpm quest:test` failed before running
tests because the baseline vendor dependencies require missing Animation and
Asset Bundle modules; native-platform owns that repair. No Android IL2CPP build,
headset, camera/provider or physical LEGO result is claimed by this delivery.

## Existing package and service boundaries

The shared packages still emit ESM/declarations with `.js` relative imports.
`packages/motion` retains `transformPose` and `invertTransform`; neither starts
I/O or timers. Shared-source architecture checks continue to enforce the allowed
imports. Zod's declaration checks use Node ambient standard types for its
universal `URL` reference without adding a platform runtime dependency.

This PR leaves `HealthSchema` and the existing `vision.ts` service health protocol
unchanged. Health exposes mock modes/build/storage writability without paths or
credentials. Vision reachability means the authenticated process responded;
its baseline `imageInterpretation: false` / `ready: false` remains honest until
the separate visual-inspection workstream deliberately extends those fields.

## Authoring transport compatibility (PR #11)

The existing authoring HTTP/WS envelopes are now explicitly included in the
shared Zod-to-C# registry and golden corpus. This adds native DTO/parser/serializer
coverage without changing any wire field, endpoint, Recording v1, Tutorial v1,
or native capture sidecar. No stored recording/tutorial migration is required.
Native uploads use generated `TutorialJobCreate` and `RecordingByteChunk`
serializers instead of assembling JSON strings; the server continues validating
hashes, actual decoded images, revisions, and permissions at its own boundary.
The other generated DTOs establish wire parity and do not imply new native UI.

| Contract | Existing transport | Current consumer |
| --- | --- | --- |
| TutorialJobCreate | POST /api/tutorial-jobs | Native upload and desktop authoring |
| TutorialFinalize | POST /api/tutorials/:id/finalize | Desktop authoring |
| ReferenceEdit | PUT /api/tutorials/:id/references | Desktop authoring |
| ReferenceImageUpload | POST /api/reference-images | Desktop authoring |
| SpectatorState | Read-only WS spectator-state message | Desktop spectator |
| TutorialLabelBatch | Provider-neutral label application boundary | Server authoring; not a public route |
| RecordingByteChunk | PUT /api/recordings/:id/bytes/:chunk | Native exact-byte upload |

These existing envelopes have no `schemaVersion` field; their endpoint/message
shape is frozen here, rather than silently inventing a version that would break
strict consumers. Future incompatible changes require an explicit API/message
version and coordinated migration. Reject unknown/missing fields and invalid
revisions, hashes, sources, base64 and bounds. Decode/verify chunk bytes only at
storage admission, and treat label provenance as declared input until validated
by the label pipeline. Spectator messages never control guide progression.

The corpus includes all seven contracts, connected/disconnected spectator states,
unknown/missing fields and malformed/over-limit examples. Both Vitest/Zod and
the actual pure C# parser consume the same files and expected acceptance results.
The image-upload fixture carries labelled synthetic placeholder bytes, not a
valid decoded image or camera evidence; image decoding remains a separate server
test. Recording-byte fixtures contain only the synthetic canonical recording.
Run the existing fixture/C# regeneration and parity commands above. Generated
C# remains pure and AOT-safe, without Unity, provider, file or network dependencies.
