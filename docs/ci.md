# Pull request checks

[Check](../.github/workflows/check.yml) runs on every pull request, pushes to
`main`, merge-queue groups and manual dispatch. There are no path filters, so
documentation-only PRs still produce the required result. Feature branches run
through the pull-request event without a duplicate push run. New commits cancel
older runs for the same PR.

| Job | What it verifies |
| --- | --- |
| Typecheck, tests, build and fixtures | Frozen-lockfile install, `pnpm check`, native-verifier regression tests, then `pnpm validate:fixtures` |
| Desktop browser tests | Fresh build and Chromium Playwright scenarios against the built server, using synthetic fixtures and mock providers |
| Workflow validation | All GitHub Actions workflow files with actionlint 1.7.12, including shell checks when ShellCheck is available on the runner |
| Native Unity gates | Actual full-project EditMode and PlayMode tests, then the production Android ARM64/IL2CPP build; nonempty passing XML and the APK binary are checked |
| Native guide validation | Pure C# guide scenarios and golden contract integration; full-project Unity coverage runs in Native Unity gates |
| `check` | All five jobs succeeded; failures, cancellations and skipped jobs cannot produce a passing result |

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
persistence and uses `pull_request`. Web/server checks do not need secrets.
The native jobs require Unity activation secrets; forks without those secrets
fail the native prerequisite explicitly. Do not switch to `pull_request_target`
or expose activation credentials to untrusted code to bypass that restriction.

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
and reproducible build gates (plan TRAIL-18). The reusable
[native workflow](../.github/workflows/native-unity.yml) now runs these gates and
is a required dependency of `check`. Missing credentials, skipped suites, failed
tests or missing/wrong-architecture APKs cannot pass that aggregate. Static
scaffold checks and the standalone .NET workflows remain supplemental.

These workflows establish automated web/server and desktop fixture evidence.
Live providers, physical calibration, cross-room transfer and headset/human
acceptance require separate validation. There is no automatic deployment;
deployment needs a selected destination and its own release configuration.

References: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[actionlint usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md).

The guide workflow retains its standalone C# harness. Its former self-hosted
Unity matrix is superseded by the required full-project hosted native workflow,
which includes guide EditMode/PlayMode tests and the same production APK build.
`TRAIL_UNITY_RUNNER_LABELS` is no longer required. No test/build gate is optional.

## Unity CI activation and local reproduction

Configure `UNITY_EMAIL`, `UNITY_PASSWORD` and either `UNITY_LICENSE` (a valid
CI license file) or `UNITY_SERIAL` (a suitable paid license serial) as repository
Actions secrets using the [GameCI activation instructions](https://game.ci/docs/github/activation/).
Never commit them or paste them into PR comments. At the time this gate was
added, the repository had no Actions secrets or self-hosted runners; hosted
Unity execution is blocked until activation is configured. Local activation
does not license the GitHub runner. The prerequisite job fails visibly instead
of skipping the native check. Repository rules still need to require `check`
to prevent merging a failing PR; no branch-protection rule was present when
this change was prepared, and this PR does not change repository settings.

Both test jobs use the editor pinned in `ProjectVersion.txt`, an Android-capable
GameCI image and `-buildTarget Android`. Coverage injection is disabled to keep
the package set unchanged. The build starts in a separate clean checkout and
calls `Trail.Editor.ProjectSetup.BuildAndroidCi`, which delegates to the same
production configuration/prebuild guard as `quest:build`. It produces a
non-development APK. Actions are SHA-pinned and the test runner's CLI is pinned.
See the upstream [test runner](https://game.ci/docs/github/test-runner/) and
[builder](https://game.ci/docs/github/builder/) input documentation.

On an activated local editor with Android SDK/NDK/JDK installed:

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

Each hosted test job retains its synthetic NUnit XML for seven days. A successful
build retains the verified APK and structured build report for seven days, named
with the workflow SHA. Raw editor logs and generated SDK credential assets are
not uploaded. These outputs prove software execution/build only; they do not
prove headset tracking, physical calibration or live-provider behavior.
