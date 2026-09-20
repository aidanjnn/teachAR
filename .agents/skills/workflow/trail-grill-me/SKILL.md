---
name: trail-grill-me
description: Challenge TeachAR's plan one consequential decision at a time, grounding questions in the repository and physical-demo evidence. Use for grill me, stress-test this plan, or challenge assumptions.
---

# Challenge the TeachAR plan

Read [plan.md](../../../../docs/plan.md), [AGENTS.md](../../../../AGENTS.md), and any
actual evidence for the decision at hand. Inspect the repository before asking
a question the files can answer. Do not infer confirmed device behavior or
remaining time from an old planning snapshot.

Ask one consequential question at a time, give a recommended choice with its
tradeoff, and wait for the answer. Start with the earliest unresolved dependency:
device/hand feasibility, actual objects and visibility, cross-user calibration,
start/checkpoint separation, interruption recovery, then narration and extras.

Use concrete scenarios: the active hand vanishes at 450 ms of a 500 ms hold; a
second learner rotates the mat; the model responds after Repeat; the backend
dies after preload. Ask what behavior and observable evidence would count as
success. Distinguish motion matching, human-confirmed completion, generated
instruction, and observed assembly outcome.

Prefer a smaller demonstrable tier over an unproved feature list. Keep proposed
thresholds, hardware assumptions, sponsor requirements, and runtime capabilities
as unresolved until supported. Recheck time-sensitive facts from their official
source when the decision depends on them.

Capture agreed decisions in the plan or relevant existing docs when the user
asks to update them. Do not silently turn interview answers into application
implementation, publication, or a new documentation hierarchy. Finish with the
decisions reached and the remaining evidence required.
