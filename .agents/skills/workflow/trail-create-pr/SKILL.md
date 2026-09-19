---
name: trail-create-pr
description: Create or update a Trail GitHub PR with a Conventional Commits title, plan context, and truthful automated versus headset validation. Also supports drafting PR text without publishing.
---

# Create a Trail pull request

Use [AGENTS.md](../../../../AGENTS.md) and the
[PR template](../../../../.github/pull_request_template.md). If asked only for
title/body text, prepare text without committing, pushing, or creating a PR.

## Prepare

1. Inspect status, remote, branch, existing PR, and actual base. Use the user's
   requested base or an existing PR's base; otherwise use `main`. Fetch that
   base before reviewing the complete branch diff and all its commits.
2. Use a `codex/<bounded-task>` head branch, never the base as the PR head. Keep
   an existing suitable task branch. Preserve unrelated uncommitted changes.
3. Bootstrap edge: a PR needs an existing remote base and shared history. Check
   remote refs if the repo is unborn/empty. Prepare the files and description;
   if no base exists, explain the concrete bootstrap requirement before a
   separate initial base publication. Never create an artificial empty base,
   duplicate root history, or force-push to make GitHub accept a PR.
4. Review all changes from the merge base, including pending task files, not
   just the latest commit. Check contracts, runtime authority, data handling,
   and the evidence requirements that the diff actually touches.
5. Run the applicable [validation](../../../references/validation.md). For code
   PRs with the implemented workspace, require `pnpm check` and relevant
   fixture/end-to-end checks. Docs-only work uses document/skill checks. Fix
   in-scope failures; disclose unavailable checks and hardware gaps. No
   Copperlane-specific signoff service or review bot is required.

## Describe and publish

- Write a whole-branch Conventional Commits title under 72 characters.
- Fill Summary, Context, Changes, Validation, and Notes & Risks. Lead with the
  problem and resulting behavior. Reference actual plan sections/tickets;
  `TRAIL-06` in the plan is not automatically a GitHub or Linear issue.
- Include only actual test results, with mock/fixture/live/headset boundaries.
  Missing headset evidence must be visible for spatial/runtime changes. Avoid
  unmeasured performance claims, assembly-verification claims, empty headings,
  template comments, or agent-attribution footers.
- Use the [commit workflow](../trail-commit/SKILL.md) for task changes and push
  the branch. Commit/push is part of an authorized PR delivery request.
- Write the body to a temporary UTF-8 file and use `gh pr create --base ...
  --head ... --title ... --body-file ...`; use `--draft` when requested. Update
  an existing matching PR instead of creating a duplicate. Do not silently
  publish known-broken code as ready; respect a requested draft and explain gaps.
- Verify returned URL, base/head, and remote head SHA. If running in Codex with
  `attach_artifact` available, attach the created/updated PR to this task.

Return the PR link and concise validation/remaining gaps. Do not merge, deploy,
submit an entry, request reviewers, or post review comments just to open a PR.
