---
name: trail-manual-flows
description: Produce a focused Trail manual QA or demo checklist for real headset, physical calibration, audio/provider, and recovery behavior that fixture tests cannot prove. Use for manual test plan, headset QA, or demo rehearsal.
---

# Trail manual flows

Generate a runnable checklist for the current change or requested release tier.
This is read-only checklist generation unless execution or recording results is
also requested. Use [AGENTS.md](../../../../AGENTS.md), the diff, and
[plan section 11](../../../../plan.md#11-verification-strategy-and-acceptance-checklist).

First inspect actual tests and [validation routes](../../../references/validation.md)
so each item covers a remaining observation, not a duplicate assertion. Keep
only relevant flows for a small change; use the complete human acceptance set
when the user asks for whole-demo readiness.

Useful scenario groups:

- **Origin and device:** actual model/OS/Browser, hand/controller mode, secure
  headset origin, health, permission-before-XR, transparent passthrough and
  usable 3D controls. Do not assume an HTML overlay exists in immersive mode.
- **Registration:** expert and learner calibrate independently; measure the
  fourth mark; rotate the mat and restart XR. A moved mat/recenter requires
  re-registration and clears any in-progress dwell.
- **Fresh task:** record the real 3–5-step task with explicit markers, reset the
  pieces, review boundaries/active hands/labels, save/reload, then guide another
  person. A prerecorded fixture cannot replace this acceptance scenario.
- **Learner pace:** go slowly, visit the wrong endpoint or wrong hand, hold too
  briefly, then hold correctly. Lose the active hand just before completion;
  reacquire and require a fresh dwell. Also test inactive-hand loss separately.
- **Interruption:** Repeat, pause, remove headset, return from system UI, restart
  XR; observe no false advance and invalidation of stale answers/attempts.
- **Audio and semantics:** mic, hands, XR, and casting operate together; listen
  to the complete saved blob; measure start/end cue alignment. Check actual
  generated instructions, failure fallback, and source/provenance display.
- **Recovery and audience:** disconnect AI/backend after preload and continue
  local guidance; reconnect spectator to a fresh snapshot; verify actual
  audience visuals and audio, plus an honestly labeled backup recording.
- **Human acceptance:** three uninterrupted full runs and one non-builder with
  no step-by-step coaching. Observe the physical result separately from the
  system's “Movement checkpoint reached” indication.

Write each item as `- [ ] Setup — action → observable expected result`, ordered
so early steps prepare later ones. Name the exact remaining manual aspect when
a fixture partially covers it. Include needed device/parts/origin upfront.

No hardware is not a pass. If results are requested, write actual observations
to `docs/validation.md` with commit, device/browser, measurement, and remaining
issue; otherwise return the checklist without creating an evidence log.
