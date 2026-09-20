# Pull request checks

[Check](../.github/workflows/check.yml) runs on every pull request, pushes to
`main`, merge-queue groups and manual dispatch. There are no path filters, so
documentation-only PRs still produce the aggregate result. Feature branches run
through the pull-request event without a duplicate push run. New commits cancel
older runs for the same PR.

| Job | What it verifies |
| --- | --- |
| Typecheck, tests, build and fixtures | Frozen-lockfile install, `pnpm check`, then `pnpm validate:fixtures` |
| Desktop and WebXR browser tests | Built-server Playwright scenarios plus the WebXR Node/Python/synthetic Chromium suite |
| Workflow validation | All GitHub Actions workflow files with actionlint 1.7.12, including shell checks when ShellCheck is available on the runner |
| `check` | All three jobs succeeded; failures, cancellations and skipped jobs cannot produce a passing result |

Jobs use GitHub-hosted Ubuntu 24.04, the Node version in `.node-version` and the
pnpm version in `package.json`. Dependency installation uses the committed
lockfile and the pnpm store cache. Action references are pinned to commit SHAs;
the actionlint release archive is checked against its pinned SHA-256 checksum.
Updating these pins requires reviewing the upstream release and checksum.

The browser job uploads its HTML report and retained failure traces as
`browser-test-results` for seven days. Download the artifact from the Actions
run to inspect failures. These tests use synthetic inputs; do not add personal
recordings, camera frames, provider secrets or raw narration to test artifacts.

The workflow needs only `contents: read`, disables checkout credential
persistence and uses `pull_request`. No Actions secrets are needed.

## Reproduce hosted checks locally

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm validate:fixtures
pnpm exec playwright install chromium
pnpm test:e2e --reporter=list,html
pnpm setup:webxr
pnpm test:webxr
# With actionlint 1.7.12 installed:
actionlint
```

## WebXR foundation

The browser job prepares the WebXR Python environment and verified Three.js assets
with `pnpm setup:webxr`, then runs `pnpm test:webxr`. This covers Node/Python tests
and eleven synthetic Chromium workflows on an owned temporary server. Provider
credentials are disabled and runtime data is temporary. No live tutor is reused.

The quality job builds WebXR assets alongside shared packages and the desktop/API.
Unity/C# editor, APK, native harness and static GUID gates have been removed with
the retired runtime. No Unity account, license, SDK or self-hosted runner is used.

Green hosted checks establish software and synthetic browser behavior only.
Actual Quest hands, concurrent camera/mic/XR, provider response and physical
transfer need [device evidence](device-check.md). Current local results do not
imply that hosted CI has run for an unpublished branch.

## Merge enforcement

To make the hosted results mandatory, configure a GitHub branch rule or ruleset
for `main` that requires the `check` status from Check. The job name is preserved;
workflow files publish statuses but do not enable branch protection themselves.
This change does not modify branch protection. There is no automatic deployment.

References: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[actionlint usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md).
