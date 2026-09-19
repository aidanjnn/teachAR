# Scaffold contracts

The implementation authority is `packages/contracts/src/index.ts`. This is the
recording/pose subset of [plan section 6](plan.md#6-shared-contracts-to-freeze-before-parallel-implementation),
not the complete TRAIL-03 contract freeze. Tutorial, draft-edit, calibration,
guide-event, coach, and upload schemas remain to be implemented with their consumers.

## Coordinates and validity

- Meters, radians, monotonic milliseconds relative to recording start.
- Right-handed workspace: +X right, +Y up, +Z toward the learner.
- Quaternion order `[x, y, z, w]`; norm must be within `1e-4` of one. Both signs
  describe the same rotation. This tolerance validates serialization only.
- Zero is a valid coordinate. Every scalar must be finite.
- Valid hands contain exactly the 25 named WebXR joints, including `wrist` and
  excluding any invented `palm` joint. Missing hands carry an explicit reason.
- `jointOrder` must exactly match exported `JOINT_NAMES`. Frame times strictly
  increase and lie within duration; consumers must not reconstruct time from indices.
- Recording limits follow the plan: 120 seconds and 3,600 frames. The scaffold
  additionally bounds markers to 256, IDs to 128 characters, and audio offsets to
  ±5 seconds. Audio offsets/MIME coverage need review during TRAIL-09.

`RecordingSchema.parse(unknown)` validates imported data; schemas reject unknown
fields and versions. Upload byte limits, workspace calibration geometry, asset
hashes, half-open tutorial ranges, and active-hand checkpoint validity are not
implemented by this recording-only scaffold. They must be enforced before the
corresponding APIs and tutorial schemas ship.

## Motion entry points

`transformPose(pose, destinationFromSource)` applies rotation and translation
without scale. `invertTransform(transform)` reverses that mapping. Inputs must
already pass `PoseSchema`. The shared package performs no I/O, starts no timers,
and imports only contracts and `gl-matrix`.

Both shared packages emit ESM and declarations from `dist/` with `.js` relative
imports. Their runtime is platform independent. Typechecking uses Node's ambient
standard types because Zod 4.6.5 refers to the universal `URL` type in its
declarations; declaration checks remain enabled. An architecture test enforces
the allowed package imports and rejects platform globals in shared source.

## Version and migration note

`schemaVersion: 1` is the first implemented recording format; there is no prior
stored format to migrate. The committed `synthetic-reach.v1.json` is the baseline.
Add a fixture and migration note when serialized fields change. Do not silently
reinterpret coordinates, time, validity, or joint order under the same version.
Ready tutorial versioning remains a separate planned contract.

The additive `HealthSchema` describes the scaffold response only: `status`,
`buildId`, mock provider modes, and `storage.writable`. No paths, environment
values, keys, or recordings are returned. Storage failure returns HTTP 503.

## Vision service scaffold protocol v1

`packages/contracts/src/vision.ts` adds independent strict health/readiness/error
and dependency-status schemas. It does not modify recording v1. Vision health
explicitly reports the mock provider and `imageInterpretation: false`; readiness
reports `ready: false`. `reachable` means an authenticated service responded,
not that visual coaching is ready. A future implementation must deliberately
extend these literal capability/provider fields with fixtures and a compatibility
note. The proposed inspection job/result contract in the plan remains unimplemented.

`Trail.Contracts` currently supplies canonical joint names and a numeric pose
value. It is not a strict C# recording parser and does not yet pass full C#/Zod
wire compatibility. Those tests remain part of TRAIL-03/18.
