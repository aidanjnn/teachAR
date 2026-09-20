# Runtime/Coach

Owner: Voice/AI.

Native mic/WebRTC and GPT Live interaction. Visual interpretation belongs to apps/vision.

## Layering

Two layers, split the way the rest of the repository splits them.

1. **Pure session layer** (`CoachContext`, `CoachWire`, `CoachJson`, `CoachSessionState`,
   `CoachSession`, `CoachTransport`). No `UnityEngine`, `System.IO`, `System.Net`, timer,
   SDK type or credential. It receives events and returns state plus effects, so every rule
   below is decided here and is testable with plain .NET. `tests/native-coach` compiles these
   exact files and exercises them.
2. **Thin adapter** (`NativeVoiceCoach`, a `MonoBehaviour`). It owns the microphone, the
   transport handle and the paired HTTP calls, and executes the effects the pure layer returns.
   Unity is not installed in this checkout, so this file is **source-reviewed only** -- it has
   never been compiled or run here.

## Rules the pure layer enforces

- The provider credential never leaves the server. The native client authenticates with the
  scoped bearer token `NativeApiConnection` holds in memory from pairing; no coach type holds,
  encodes or logs a token, and `CoachJson` bodies carry none.
- The coach cannot advance the guide. `CoachEffectKind` has no start, complete, repeat or
  confirm member, and the harness asserts that list. Audible or visible agreement is advice.
- Replies are discarded across run, tutorial, attempt, step and revision changes, and any reply
  that arrives after an exit path is dropped rather than surfaced.
- The microphone is acquired silent *before* the transport opens (guaranteed by effect order),
  and it is released on every exit path: session end, live failure, live close, context-sync
  failure, microphone failure, backend loss, application pause and focus loss.
- Losing the backend leaves the loaded guide untouched and marks the coach explicitly
  unavailable rather than pretending to work.

## Not implemented here

`ICoachTransport` has no production implementation: no Unity/Meta WebRTC package is installed
or resolvable in this repository. Microphone permission handling, the real peer connection,
audio routing and every headset behaviour remain unimplemented and unverified.
