---
name: trail-signoff
description: Verify and repair TeachAR's applicable readiness checks for the current revision, separating code readiness from real headset and demo acceptance. Use for signoff, final verification, or checking readiness after PR fixes.
---

# Sign off a TeachAR revision

Read [AGENTS.md](../../../../AGENTS.md) and
[validation routes](../../../references/validation.md). Signoff establishes
evidence for the requested scope. It does not start a staff review, publish
GitHub statuses, or require an external reviewer service.

## Verify and repair

1. Record status, branch, HEAD if present, and any task/unrelated dirty files.
   Identify whether the request concerns code, a provider integration, or the
   physical demo. Inspect actual scripts and CI before naming the gate.
2. Docs/skills-only changes use structural/document checks. Once the workspace
   exists, run `pnpm check` and relevant fixture/`pnpm test:e2e` checks. For a
   setup signoff, also verify the frozen-lockfile fresh-install path in an
   isolated checkout when possible. Report absent/unrunnable checks honestly.
3. Read all failures from the run, repair their in-scope causes, and run focused
   checks for those repairs. Do not weaken tests, tolerances, tracking validity,
   schemas, pairing, or privacy rules to obtain a pass. An incompatible product
   decision or unavailable external prerequisite is a concrete blocker.
4. Rerun the applicable final gate after changes. Stop a repeated identical
   infrastructure failure when no new local action can resolve it; report the
   command, evidence, and missing prerequisite rather than retrying blindly.
5. If commit/push is part of the user's delivery request, use
   [trail-commit](../trail-commit/SKILL.md), verify the final SHA and upstream,
   and attribute only evidence valid for that revision. Otherwise leave edits
   uncommitted and label results as worktree verification. Never claim an exact
   commit was verified when dirty relevant files supplied the tested code.

## Readiness report

Give the revision/worktree scope, actual commands/results, fixes, and unresolved
issues. Hosted CI is a separate result; local success does not imply CI passed.
Any later relevant change invalidates the affected evidence.

For physical-MVP/demo signoff, require the plan's actual headset/human evidence,
including fresh capture, independent calibration, learner-paced progression,
loss/recovery, backend disconnect after preload, three consecutive runs, and
one non-builder. When absent, state **code verified; physical acceptance not
tested** (or the actual partial result). Never fabricate device observations or
treat mocks/manual fallback labels as live semantic generation.
