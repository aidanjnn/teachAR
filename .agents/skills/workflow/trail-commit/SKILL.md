---
name: trail-commit
description: Stage focused TeachAR changes and create Conventional Commits; push when requested. Use for commit, commit and push, or committing a completed delivery task.
---

# Commit TeachAR changes

Follow [AGENTS.md](../../../../AGENTS.md). A commit-only request is local; an
explicit commit-and-push or PR delivery request includes pushing. Do not expand
this task into a review, cleanup, PR, or deployment.

1. Inspect status, unstaged and staged diffs, and relevant untracked files.
   Preserve unrelated work and already-staged changes; isolate only this task.
2. Resolve the branch. Use `codex/<bounded-task>` for new agent work. If HEAD is
   unborn, inspect remote refs before the first commit; handle an existing
   remote history instead of creating an unrelated root. Skip history commands
   that require HEAD until it exists.
3. Reuse appropriate validation for unchanged inputs. Run missing focused
   checks when needed; consult [validation routes](../../../references/validation.md).
   Do not pretend `pnpm check` exists on the plan-only scaffold.
4. Group related changes into coherent commits. Stage explicit paths, inspect
   `git diff --cached`, and ensure the commit contains no unrelated staged
   content, secrets, raw recordings, or generated build/test output. A feature,
   its tests, and its docs can belong in the same commit.
5. Use `type(scope): imperative summary`, under 72 characters, no final period.
   Examples: `fix(motion): clear dwell after tracking loss` or
   `chore(agents): add TeachAR delivery skills`. Explain non-obvious reasons in
   the body. For multiline messages use a temporary file with `git commit -F`.
6. Honor hooks and configured authorship. Fix an in-scope hook failure and
   retry; never bypass a hook. Do not amend or add attribution unless requested.
7. If pushing is authorized, push the task branch, setting its upstream when
   absent. Resolve a non-fast-forward from evidence; never force-push by default.
   Verify the remote branch SHA matches the intended local commit after push.

Report the commit hash, pushed/local state, checks, and remaining worktree
changes. A remaining unrelated change is not a reason to commit or discard it.
