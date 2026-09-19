---
name: trail-staff-review
description: Review Trail branch or PR readiness at staff level, with an evidence-based weighted score and actionable findings for spatial correctness, runtime recovery, privacy, and architecture. Read-only unless fixes are separately requested.
---

# Staff review for Trail

Judge the changed behavior against [AGENTS.md](../../../../AGENTS.md) and the
relevant sections of [plan.md](../../../../plan.md). Be direct and specific.
Optimize for a small, trustworthy physical demo, not speculative production
infrastructure. Review does not authorize edits, commits, pushes, or posted
GitHub reviews. Keep the report in this conversation unless posting is requested.

## Scope and evidence

Inspect branch/status and the complete merge-base diff. Prefer the PR's actual
base, then the user-specified base, then `origin/main`/`main`. Include staged,
unstaged, and relevant untracked files when the user is reviewing current work;
state exactly what you reviewed. If HEAD/base does not exist, review available
files as an initial scaffold and say there is no branch comparison.

Read immediate consumers, contracts, and tests as needed. Do not block on
unrelated pre-existing debt or deferred features absent from this change.
Missing future application packages are not defects in a skills/docs scaffold.
Use existing checks as evidence; run verification if requested, keeping any
generated artifacts isolated. Do not call a missing hardware observation a
confirmed defect. Use [validation routes](../../../references/validation.md).

## Review priorities

1. **Spatial correctness:** transform direction, coordinate/time units, named
   hand/joint identity, quaternion validity, half-open ranges, workspace/layout
   compatibility, held-out calibration, reset invalidation, missing samples.
2. **Progression:** independent learner speed, start gate before endpoint dwell,
   fresh active-hand observations, no time credited through gaps, tracking loss
   and visibility pause, repeat/revision isolation, once-per-attempt completion.
   Model answers and spectators must never advance the reducer.
3. **Persistence and recovery:** bounded capture/uploads/queues, idempotent
   retries, atomic complete manifests, immutable ready tutorials, stale compile
   results/edits, preload and backend-loss behavior. No persistent `blob:` URLs.
4. **Trust boundaries:** server-only secrets; pairing and HTTP/WS Origin checks;
   storage path containment; malformed imports/messages/model output; privacy
   of recordings, audio, images, and logs; honest fallback provenance.
5. **Architecture and simplicity:** pure contracts/motion dependency direction,
   injected time, effects in adapters, one Fastify process, explicit ownership,
   small modules, no speculative abstractions or framework changes.
6. **Device behavior and claims:** same XR reference space, current-frame
   samples, no interpolation through occlusion, hot-path allocations, mic/XR
   concurrency, true secure origin. Endpoint matching proves a movement
   checkpoint; it does not prove assembly or an entire trajectory.

Trace concrete triggers to consequences. A useful finding names the relevant
changed file/line, failure scenario, impact, and smallest correction. Recommend
broader redesign only with a smaller concrete replacement shape.

## Score and verdict

Score each applicable dimension from 0–100. Weight them as follows:

| Dimension | Weight |
| --- | --- |
| Correctness and spatial/runtime behavior | 25 |
| Privacy, trust boundaries, data integrity | 15 |
| Architecture and ownership | 15 |
| Simplicity and maintainability | 15 |
| Behavioral tests and evidence quality | 15 |
| Recovery and demo operability | 10 |
| Repository discipline and docs | 5 |

Compute `round(sum(weight * score) / sum(applicable weights))`; mark truly
irrelevant dimensions N/A and explain normalization. This is a review judgment,
not a measured product metric. Missing evidence on an affected surface belongs
in its score, not N/A. Never let an average override a concrete blocker.

Return: **Approve**, **Approve with nits**, **Request changes**, or **Block merge**,
the score with a compact breakdown, scope/base, prioritized findings, and actual
verification gaps. Severity: P0 immediate severe failure; P1 must fix before
merge; P2 material follow-up; P3 polish. False progression, leaked credentials,
or corrupt published recordings are blocking when demonstrated in the change.
Explain any readiness limit when checks are missing. If no actionable defect
is found, say so without inventing findings to fill a template.
