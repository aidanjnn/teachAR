# Trail validation routes

Use [the current plan](../../docs/plan.md#11-verification-strategy-and-acceptance-checklist)
and [AGENTS.md](../../AGENTS.md). Quest Browser / WebXR is the product runtime.

## Select checks from the current repository

| Changed surface | Applicable checks |
| --- | --- |
| Docs/skills | Local links, discovery symlinks, frontmatter and `git diff --check`; inspect new files |
| Shared TypeScript/API | Focused Vitest, then `pnpm check` for cross-package changes |
| Shared schemas/math | Contract corpus, golden math fixtures and `pnpm validate:fixtures` |
| Desktop/backend integration | Build first, then `pnpm test:e2e` |
| WebXR app, local server, launch/vendor paths | `pnpm setup:webxr`, then `pnpm test:webxr` |
| Whole foundation / PR preparation / signoff | All four: check, fixtures, desktop e2e and WebXR suite |
| GitHub workflow | actionlint and the applicable commands invoked by CI |

Setup requires pinned Node/pnpm, Python 3.12+ and `pnpm exec playwright install chromium`.
The WebXR suite creates an isolated temporary server with temporary data and
provider credentials disabled. It does not reuse the user's live tutor server.
No Unity/editor/APK/.NET check exists in this foundation.

Reuse passing results when inputs are unchanged. Record the tested revision or
label an uncommitted worktree. Failed, unavailable or empty suites are not passes;
never weaken schema, tracking, security or freshness checks to make them green.

## Claims and readiness

- **Automated:** typechecks, unit/API tests, builds, source/link/workflow checks.
- **Synthetic browser:** mock hands/media/providers; cannot establish device accuracy.
- **Live provider:** actual service, input provenance, response/failure and latency.
- **Headset/human:** Quest model/OS/browser, origin, revision, scenario, observations
  and unresolved issues. Follow [device acceptance](../../docs/device-check.md).

Physical acceptance requires fresh capture, independent learner placement,
preview/practice/automatic movement transitions, loss/recovery, optional-backend disconnect after preload,
three consecutive runs and a non-builder. Verify voice/camera/hands concurrency
and a second safe task family independently. Cold offline start, hidden-hand
accuracy and physical assembly verification do not follow from any unit test.
