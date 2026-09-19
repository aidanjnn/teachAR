# Pull request checks

[Check](../.github/workflows/check.yml) runs on every pull request, pushes to
`main`, merge-queue groups and manual dispatch. There are no path filters, so
documentation-only PRs still produce the required result. Feature branches run
through the pull-request event without a duplicate push run. New commits cancel
older runs for the same PR.

| Job | What it verifies |
| --- | --- |
| Typecheck, tests, build and fixtures | Frozen-lockfile install, `pnpm check`, then `pnpm validate:fixtures` |
| Desktop browser tests | Fresh build and Chromium Playwright scenarios against the built server, using synthetic fixtures and mock providers |
| Workflow validation | All GitHub Actions workflow files with actionlint 1.7.12, including shell checks when ShellCheck is available on the runner |
| `check` | All three jobs succeeded; failures, cancellations and skipped jobs cannot produce a passing result |

Jobs use Ubuntu 24.04, the Node version in `.node-version` and the pnpm version
in `package.json`. Dependency installation uses the committed lockfile and the
pnpm store cache. Action references are pinned to commit SHAs; the actionlint
release archive is checked against its pinned SHA-256 checksum. Updating these
pins requires reviewing the upstream release and its matching SHA/checksum.

The browser job uploads its HTML report and any retained failure traces as
`browser-test-results` for seven days. Download the artifact from the Actions run
to inspect failures. These tests must continue to use synthetic inputs; do not
add personal recordings, camera frames, provider secrets or raw narration to
test artifacts.

The workflow needs only `contents: read`, disables checkout credential
persistence and uses `pull_request`, so it does not require repository secrets
or elevated permissions to execute fork code.

## Reproduce locally

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm validate:fixtures
pnpm exec playwright install chromium
pnpm test:e2e --reporter=list,html
# With actionlint 1.7.12 installed:
actionlint
```

## Merge enforcement and remaining gates

To make these results mandatory, configure a GitHub branch rule or ruleset for
`main` that requires the `check` status from the Check workflow. The original
job name is preserved for existing rules. Workflow files publish statuses;
they do not enable branch protection themselves. This change does not modify
repository rules.

`pnpm check` follows the scripts available on the checked-out revision, so
additional workspace packages or static scaffold checks added to that command
are included automatically. Native Unity EditMode/PlayMode tests and Android
ARM64/IL2CPP builds still need an activated editor, compatible resolved packages
and reproducible build gates (plan TRAIL-18). Static scaffold checks, when
present, cannot establish native compilation or headset readiness.

These workflows establish automated web/server and desktop fixture evidence.
Live providers, physical calibration, cross-room transfer and headset/human
acceptance require separate validation. There is no automatic deployment;
deployment needs a selected destination and its own release configuration.

References: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[actionlint usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md).
