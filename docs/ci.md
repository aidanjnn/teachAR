# Pull request checks

[Check](../.github/workflows/check.yml) runs on every pull request, pushes to
`main`, merge-queue groups and manual dispatch. There are no path filters, so
documentation-only PRs still produce the aggregate result. Feature branches run
through the pull-request event without a duplicate push run. New commits cancel
older runs for the same PR.

| Job | What it verifies |
| --- | --- |
| Typecheck, tests, build and fixtures | Frozen-lockfile install, `pnpm check`, then `pnpm validate:fixtures` |
| Desktop browser tests | Fresh build and Chromium Playwright scenarios against the built server, using synthetic fixtures and mock providers |
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
# With actionlint 1.7.12 installed:
actionlint
```

## Native validation runs locally

Unity EditMode/PlayMode, Android ARM64/IL2CPP and standalone C# native workflows
have been removed at the repository owner's request. The former self-hosted
runner is retired. Do not register a developer workstation as a runner for this
public repository: pull-request code can compromise its persistent environment.
See [GitHub's runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use).

`UNITY_EMAIL`, `UNITY_PASSWORD`, `UNITY_LICENSE`, `UNITY_SERIAL` and
`TRAIL_UNITY_RUNNER_LABELS` are no longer used by CI. The remaining `pnpm check`
includes static native scaffold checks; those inspect files and cannot prove
Unity compilation, test execution or a successful APK build.

Native scripts, test sources, standalone C# harnesses and result verifiers remain
available for local validation. On an activated local editor with the pinned
version and Android SDK/NDK/JDK installed:

```sh
pnpm quest:test
pnpm quest:test:play
pnpm quest:build
python3 -m unittest discover -s tests/native-ci -v
# Pass each printed artifact directory to the corresponding verifier:
python3 scripts/verify-native-ci.py tests artifacts/quest/test-<run-id>
python3 scripts/verify-native-ci.py tests artifacts/quest/test-play-<run-id>
python3 scripts/verify-native-ci.py build artifacts/quest/build-<run-id>
```

Record native results separately for the revision tested. A green hosted check
now establishes web/server, static and desktop fixture evidence only. It does
not establish native readiness, live-provider behavior, headset tracking,
physical calibration or human acceptance. Native changes still need the local
validation described in [the validation routes](../.agents/references/validation.md).

## Merge enforcement

To make the hosted results mandatory, configure a GitHub branch rule or ruleset
for `main` that requires the `check` status from Check. The job name is preserved;
workflow files publish statuses but do not enable branch protection themselves.
This change does not modify branch protection. There is no automatic deployment.

References: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[actionlint usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md).
