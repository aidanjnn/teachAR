---
name: trail-catchup
description: Bring a TeachAR task branch up to date with its actual PR base or main, resolving merge conflicts while preserving shared schemas, motion semantics, and user work. Use for catch up, sync branch, or resolve conflicts.
---

# Catch up a TeachAR branch

Follow [AGENTS.md](../../../../AGENTS.md). Inspect status, current branch, base,
and any merge/rebase already in progress. Use the existing PR's base or the
user's explicit ref; otherwise use `main`. Fetch the selected remote ref.

- Preserve unrelated dirty/staged files. Prefer an isolated checkout when
  needed; do not blindly stash, reset, or overwrite work. An unborn branch or
  missing remote base needs bootstrap, not a merge with an invented history.
- If the base is already an ancestor of HEAD, there is no catch-up to perform.
- Merge by default for shared/pushed branches. Rebase only when requested;
  rewriting a published branch needs explicit authorization. Never use bare
  force push or discard one whole side without reading it.
- For each conflict, inspect both intents and nearby consumers/tests. Resolve
  routine and evidence-backed behavior changes directly. Ask only for a real
  unresolved product/contract choice or unavailable authority, not merely
  because a file is important.
- Pay particular attention to coordinate/time conventions, schema versions,
  tutorial revisions, start/dwell semantics, and storage finalization. Preserve
  both sides' intended behavior and regression coverage.
- Resolve manifest intent before regenerating `pnpm-lock.yaml` with the
  repository's pinned pnpm; do not hand-merge incompatible resolutions or
  upgrade dependencies as a shortcut. Coordinate integration-owned changes.
- Inspect the complete resulting diff, including automatic merges. Run relevant
  [checks](../../../references/validation.md), stage specific resolved files,
  and finish the merge/rebase. Preserve hooks and configured authorship.

Push only if requested or part of authorized PR delivery. Report the base,
resulting commit, validation, and whether published. If blocked mid-operation,
state its exact status and the concrete decision needed; do not silently leave
an unfinished merge or abort someone else's existing operation.
