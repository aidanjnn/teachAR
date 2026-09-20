---
name: trail-manual-flows
description: Produce a focused Trail manual QA or demo checklist for real headset, physical calibration, audio/provider, and recovery behavior that fixture tests cannot prove. Use for manual test plan, headset QA, or demo rehearsal.
---

# Trail manual flows

## Local desktop execution notes

- Activate the installed Node 22 toolchain before every independent shell:
  `export PATH="$HOME/.local/share/fnm:$PATH" && eval "$(fnm env)"`.
  Run `pnpm build:shared && pnpm build` before the built desktop/backend `pnpm start:server`; use `pnpm dev` for the WebXR tutor.
- Isolate data and ports per branch; stop the old server before switching.
  Authoring needs `ALLOW_USB_LOOPBACK=true PORT=<port> DATA_DIR=<private-dir>`
  and the exact `http://127.0.0.1:<port>` origin. Pair via the UI with the
  short-lived code in `<private-dir>/pairing.json`; never publish that file.
- Authoring supports numeric boundary edits and recording-file import, not
  desktop marker insertion. Test coincident end/start markers using a disclosed
  synthetic JSON import; inspect all half-open boundaries in the review UI.
- Where `/voice-lab.html` exists, launch headed Chromium with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
  Keep fake microphone, mock transcript and fallback provenance explicit.
- For duplicate-request guards, delay a real request rather than fabricating
  its response; capture disabled controls and count requests. To demonstrate
  loaded local fallback, stop the actual backend without reloading the page.
- Use `#step-mode` or a combobox role for the authoring completion control;
  an exact label lookup may not resolve consistently.

### Devin Secrets Needed

None for local synthetic/mock flows. Real provider testing requires separately
authorized server-side credentials; do not substitute mock evidence for it.

Generate a runnable checklist for the current change or requested release tier.
This is read-only checklist generation unless execution or recording results is
also requested. Use [AGENTS.md](../../../../AGENTS.md), the diff, and
[plan section 11](../../../../docs/plan.md#11-verification-strategy-and-acceptance-checklist).

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
