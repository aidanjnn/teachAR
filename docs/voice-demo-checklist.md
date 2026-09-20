# Voice demo checklist: Quest Browser tutor with the GPT-Live coach

Desktop and mock evidence cannot prove that microphone, WebRTC audio and an immersive WebXR session
work together on the headset. The coach runs in the headset's own browser tab: Start coach is pressed on
the Quest Browser page (cast to the laptop for the audience), before Enter the experience. This list is the remaining human observation. Tick items on the actual
Quest 3S; a missing device is not a pass. Record results (commit, Horizon OS build, Quest Browser
version, what was heard) in `docs/validation.md`.

## Before you touch the headset

- [ ] Laptop: `.env` has `AI_PROVIDER=openai`, a valid `OPENAI_API_KEY`, `ALLOW_USB_LOOPBACK=true`,
  `PAIRING_ORIGINS=http://localhost:3001`. `pnpm build && pnpm start:server` (or `pnpm dev:desktop`) →
  `curl -s http://127.0.0.1:3001/api/health` shows `"ai":"openai"`.
- [ ] Laptop browser at `http://127.0.0.1:3001/tutorial` → expand **Browser tools · review, import and
  backup**; the Voice coach card shows the badge `idle` and Start coach is enabled. If the card says
  the bundle is not built, run `pnpm --filter @trail/web build:tutor-coach` and reload.
- [ ] Phone hotspot or a known network on both laptop and headset. Venue Wi-Fi is unproven for the
  WebRTC leg; the SDP exchange works over the cable but audio travels headset ↔ OpenAI directly.
- [ ] `adb devices` lists the Quest; `adb reverse tcp:3001 tcp:3001` succeeds.
- [ ] The demo tutorial exists in the headset's browser library and is finished (every step has
  required hands chosen and is reviewed). Open Quest Browser at `http://localhost:3001/tutorial` →
  the launcher shows **Enter the experience** enabled; under Browser tools, Your tutorials lists it.

## Audio out and audio in, still on the flat page

- [ ] Quest Browser, tutor page, expand Browser tools → Review current shows the demo tutorial's title
  in the tutorial title field. The coach grounds on the tutorial loaded here.
- [ ] Press Start coach → Quest Browser asks for the microphone once; allow → within about 3 s the
  badge reads `live` and you hear "Coach ready. Ask me about the current step whenever you like."
  from the headset speakers. If the badge reads `text` instead, read the status line: it names
  the reason (microphone refused, server refusal with status, start timeout).
- [ ] Press Ask by voice, say "What do I do now?", stop talking → the badge shows `listening` while
  you speak, the answer is the first step's instruction, spoken, within about 2 s of your last word.
  The transcript shows one "You:" line and one "Coach:" line.
- [ ] Say "Is this step done?" → the coach refuses to confirm and says only the hand checkpoint is
  checked. Nothing on the page advances.
- [ ] Stay silent 10 s → the badge returns to `live` (mic closed). Start coach stays enabled.

## Inside AR

- [ ] Press **Enter the experience** (coach still `live` on the card) → passthrough appears and the
  in-headset home offers Create and Follow. The coach keeps its session across the XR entry.
- [ ] Follow → open the demo tutorial from the immersive library, place the workspace, watch step 1
  and start practice → the practice panel shows Ask coach as a button. Its label reads
  `Coach: text only` if voice is unavailable and `Coach connecting…` while starting; press it anyway
  and nothing else changes. The coach is not talking on its own.
- [ ] Point-and-pinch Ask coach, ask "What do I do now?" → the label reads `Listening…`, the answer is
  spoken from the headset, and the panel's detail line shows `Coach: …` for about 12 s, unless
  tracking is lost, the recording has a gap or the checkpoint is reached, which win.
- [ ] Complete the movement so the tutor advances to step 2, then immediately Ask coach again and
  ask "What now?" → the answer is step 2's instruction, not step 1's. If you asked while the old
  answer was still playing, the old answer went quiet and did not resume.
- [ ] Lift the headset slightly so hands are lost for a second, then continue → the coach did not
  reset; a follow-up question still answers for the current step.
- [ ] Ask coach while the tutor is reading a step aloud → the browser voice pauses; after the coach
  finishes, the held step text is read.
- [ ] Say a long question of about 12 words → the whole question is transcribed (the mic window
  re-arms while you speak) and the answer follows.

## Recovery

- [ ] Take the headset off for 20 s, put it back on, Ask coach → still answers; after exiting AR the
  card's badge still reads `live`.
- [ ] Exit AR, press Stop coach on the card, then Start coach again → greeting again, a fresh session.
- [ ] Stop the laptop server while the coach is live → Ask coach shows a problem line in AR
  ("Could not reach the server…" or the live error), the badge drops to `text`; the tutor keeps
  guiding; restart the server and press Start coach → live again.
- [ ] Turn the headset's Wi-Fi off during an answer → the badge drops to `text`; no crash; hand
  guidance continues without the coach.

## Presenter script for the judges, about 90 seconds

1. Headset page cast to the laptop: "Everything the coach hears comes through our server. The key
   never leaves it." Expand Browser tools, press Start coach, allow the microphone. Wait for
   "Coach ready." That line is the audio check.
2. Put the headset on the judge or the presenter. Enter the experience, Follow, open the tutorial.
   "The ghost hand shows the move; the headset decides when you have made it."
3. First move done, chime. Pinch Ask coach: "What do I do now?" Let the answer play.
4. Ask: "I'm done, is it correct?" The refusal is the point: "It cannot see the parts and will never
   say a step is done. Only your hands can advance it."
5. Optional if time: "How many steps are left?" answers from the reviewed step list.
6. Close: "Grounded on the expert's reviewed text, one origin over a USB cable, no key on the device."

## If something fails on stage

- Badge `text` with "microphone refused": Quest Browser site settings → allow microphone → Start coach.
- Badge `text` with "did not start in time": network blocks WebRTC; switch both devices to the
  hotspot; Start coach.
- No greeting but badge `live`: turn the headset volume up; the answer path is fine.
- Answer for the wrong step: wait for the panel's step number to update before asking; the
  runtime holds a queued Ask until the server acknowledges the new step.
- Everything else: Stop coach, Start coach. A fresh session takes about 2 s.
