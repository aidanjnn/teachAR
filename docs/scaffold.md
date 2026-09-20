# Repository foundation

The current foundation is the Quest Browser tutor stack from PR #17, #23 and #24, promoted to
[`apps/webxr`](../apps/webxr/README.md). The older native scaffold is retired;
its setup history remains in Git and [the activity log](codex-log.md).

`pnpm dev` starts the tutor. `pnpm dev:desktop` starts the retained TypeScript
workspace for authoring, diagnostics, storage and provider services. The tutor's
browser v3 data and shared API v1 data still require an explicit integration adapter.

## Rescaffold verification

Run `pnpm check`, `pnpm validate:fixtures`, `pnpm test:e2e` and `pnpm test:webxr`
after the [documented setup](../README.md). Current worktree results belong in
the activity log; old passing runs do not verify a new revision. See
[CI](ci.md) and [validation routes](../.agents/references/validation.md).

These checks prove software and synthetic browser behavior. The [headset checklist](device-check.md),
real camera/audio concurrency and live provider results require separate evidence.
