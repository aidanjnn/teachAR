# Guide adapters

`coach-state.ts` is the pure coach reducer (mute state, stale-reply rules).
`coach.ts` runs it against GPT-Live over WebRTC with a text fallback; `live-transport.ts`
wraps the SDK connection. The guide progression reducer (TRAIL-07) is still planned
and the coach has no access to it.
