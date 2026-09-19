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
| Native guide validation | Pure C# harness plus licensed Unity EditMode, PlayMode and Android ARM64/IL2CPP gates |
| `check` | All four jobs succeeded; failures, cancellations and skipped jobs cannot produce a passing result |

Hosted jobs use Ubuntu 24.04. Node and pnpm jobs use the versions in
`.node-version` and `package.json`. Dependency installation uses the committed lockfile and the
pnpm store cache. Action references are pinned to commit SHAs; the actionlint
release archive is checked against its pinned SHA-256 checksum. Updating these
pins requires reviewing the upstream release and its matching SHA/checksum.

The browser job uploads its HTML report and any retained failure traces as
`browser-test-results` for seven days. Download the artifact from the Actions run
to inspect failures. These tests must continue to use synthetic inputs; do not
add personal recordings, camera frames, provider secrets or raw narration to
test artifacts.

The workflow needs only `contents: read`, disables checkout credential
persistence and uses `pull_request`. The native jobs require a separately
provisioned, licensed runner as described below.

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
are included automatically. The Check workflow calls
[Native guide software](../.github/workflows/guide.yml) as a reusable workflow,
so native failures and missing configuration fail the existing `check` status.
The guide workflow can also be dispatched manually. No path filters or
optional-success fallback bypass native validation.

## Native runner setup

Provision a disposable self-hosted Linux or macOS Actions runner with the exact
editor from `apps/quest/ProjectSettings/ProjectVersion.txt`, an active Unity
license and Android Build Support (SDK, NDK and OpenJDK). Use isolated runners
approved for the repository's PR trust model; do not attach a developer's
persistent machine or expose its credentials to arbitrary PR code. Fork PRs
need the same approved isolated execution environment to obtain a native pass.

Set repository variable `TRAIL_UNITY_RUNNER_LABELS` to a JSON array matching the
provisioned runner, for example `["self-hosted", "trail-unity"]`. Set
`TRAIL_UNITY_EDITOR` to its absolute Unity executable path (optional only when
the wrapper's macOS Hub default matches). License activation belongs in runner
provisioning; no license or provider credential belongs in repository files.
The hosted configuration job fails explicitly when labels are missing or
invalid. A configured but unavailable runner leaves validation queued, not green.

Each matrix job checks out the revision and runs the existing wrapper:
`pnpm quest:test`, `pnpm quest:test:play`, or `pnpm quest:build`. Tests require
fresh, passing, nonempty NUnit XML. Builds require a nonempty APK and matching
Android/ARM64/IL2CPP evidence. All commands verify the pinned editor from its
log and require a resolved UPM lock. The matrix runs one gate at a time and
attempts the other gates even after a failure. Logs, test XML, build reports and
any APK are retained for seven days, including diagnostics from failed runs.

Runner provisioning remains an external prerequisite: at implementation time,
GitHub reported zero repository self-hosted runners and no Actions variables.
Adding these workflow gates does not establish a native pass until that runner
is configured and the actual jobs succeed. Static scaffold checks cannot
establish native compilation or headset readiness.

Passing jobs establish automated web/server, desktop fixture and native
build/test evidence.
Live providers, physical calibration, cross-room transfer and headset/human
acceptance require separate validation. There is no automatic deployment;
deployment needs a selected destination and its own release configuration.

References: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[actionlint usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md).
