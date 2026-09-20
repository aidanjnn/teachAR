# PR #29 review and fixes

Historical review of the pre-main catchup revision; source links below now point to the promoted `apps/webxr` tree. This is not validation of later commits.

Reviewed [PR #29](https://github.com/aidanjnn/trail/pull/29), **feat(xr): add continuous capture and movable workspace UI**, on 20 September 2026. Scope: the complete 25-file merge-base diff from actual base `codex/immersive-entry-holograms` at `7843bfbb848ed19688b9d48791c83a6f838e4b26` to head `0d026d1ca2565a497f23cc61ae8806ebde149aa7`, plus immediate consumers and tests. No existing GitHub reviews/comments were present. Repairs were prepared on isolated `codex/pr29-review-fixes` for the existing PR branch `codex/fluid-workspace-ux`. The user subsequently requested commit and push; no GitHub review was posted.

Reviewed head verdict: **Request changes — 76/100**. Repaired worktree verdict: **Approve for scoped code readiness — 91/100**. All six findings below are fixed in the accompanying changes. These judgments do not certify Quest behavior or physical task success; approval applies to the repairs, not the original reviewed head.

## Findings and corrections

1. **P1 — Home/Exit can discard an unfinished take from nested screens.** At original `tutorial-guide.mjs:211–215,377`, recording → Discard prompt → Home resets without confirmation. Recording → Settings → Boundary help → Exit also bypasses the recording guard. Added one unfinished-take predicate for Home, Exit and page-unload protection, preserved the Settings return path, and cleared explicitly ignored idle tails at Finish. The regression exercises confirmation, settings and help combinations, including nested navigation.
2. **P1 — Accepted segment narration is lost after discarding the next take or ending XR.** At original `tutorial-guide.mjs:95–97`, `takeGeneration` changes abort persistence even though the accepted step belongs to the same tutorial and its audio decoded successfully. Accepted segments now finalize independently of the unfinished take/session. Tutorial and step identity reject replaced results; generation still protects screen state. Creating/loading another tutorial waits for accepted jobs, and a failed write retains the in-memory tutorial. Concurrent desktop replacement cannot overwrite newly finalized narration.
3. **P2 — Desktop instruction/hand edits retain obsolete acceptance.** The new `acceptance` path in original `tutorial-core.mjs:145–146` lets the existing desktop edit handler at `tutorial-review.mjs:105–111` finish changed instructions or required hands with `reviewed:false`, because the cloned `hold`/`finish` acceptance survives. Desktop saves now clear that acceptance. The UI also renders the actual completion provenance instead of calling all finished tutorials expert-reviewed.
4. **P2 — Motion storage failure waits for audio decoding before pausing capture.** Original `tutorial-guide.mjs:90–97` observes the initial write failure only after awaiting narration. The next take can keep recording into failed storage while media finalizes. Failure handling now pauses capture and hold dwell immediately, preserves confirmation screens, and retains a retry/export message. A delayed-audio/rejected-storage test reproduces the original ordering.
5. **P2 — Dragging during the recording countdown leaves capture armed.** Original `ar.js:254` pauses only an already active capture or practice session. Start recording → drag the panel before the countdown ends still starts recording while the user moves the control. Manipulation handling now lives on the guide, cancels pending capture/calibration/photo countdowns, and pauses capture, practice and replay audio without changing calibration. The regression uses the actual spatial handle raycast.
6. **P2 — Continuous capture clears narration startup failures.** Original `tutorial-guide.mjs:86–95` does not carry `takeNarrationIssue` into the accepted step and clears the issue when there is no recorder take. Resuming motion after a microphone startup error can silently turn the segment into an accepted hands-only recording. Startup errors now remain on the affected draft, invalidate acceptance, and reset only for the next take.

Implementation: [guide lifecycle](../apps/webxr/public/tutorial-guide.mjs), [desktop review](../apps/webxr/public/tutorial-review.mjs), [XR wiring](../apps/webxr/public/ar.js). Regressions: [browser-fluid-recovery.cjs](../apps/webxr/tests/browser-fluid-recovery.cjs).

## Review score

| Dimension | Weight | Published head | Repaired worktree |
| --- | ---: | ---: | ---: |
| Correctness and spatial/runtime behavior | 25 | 72 | 92 |
| Privacy, trust boundaries, data integrity | 15 | 78 | 94 |
| Architecture and ownership | 15 | 90 | 91 |
| Simplicity and maintainability | 15 | 82 | 85 |
| Behavioral tests and evidence quality | 15 | 70 | 91 |
| Recovery and demo operability | 10 | 60 | 89 |
| Repository discipline and docs | 5 | 88 | 94 |

All dimensions apply. Scores are review judgments; totals are the rounded weighted averages. The missing headset evidence lowers the runtime/evidence scores but is not itself a demonstrated code defect.

## Verification and limits

- Five initial regression scenarios failed against the published behavior, then passed after repair: nested Home, nested Exit, accepted-audio persistence after discard, immediate storage-failure pause, and desktop acceptance invalidation.
- `pnpm install --frozen-lockfile` passed without lockfile changes. Verified Three.js vendor preparation passed.
- Full prototype `test-all.sh` passed **91 Node tests, 52 Python tests and 15 isolated synthetic Chromium workflows**, with provider credentials disabled. This includes real browser MediaRecorder/WebAudio using synthetic audio.
- After final new-tutorial failure handling and expanded coverage, reran fluid recovery (**14 named cases**), fluid workspace, and UI-base browser workflows; all passed. The added library case reads finalized media back through actual IndexedDB. Other previously passing scenarios were not rerun after that focused refinement.
- Reused the reviewed head's successful hosted workspace typecheck/test/build/fixture, desktop and workflow checks after verifying the repair does not change their app/package/script/test/lock inputs. The prototype checks above are fresh local evidence; the reviewed head's hosted green status does not cover the repair commit. Check that commit's CI separately.
- Patch whitespace and new/updated documentation links passed. The actual remote PR head remained `0d026d1` and mergeable with its actual base at the pre-publication status check.
- No Unity build, live provider call, real microphone recording, Quest session, headset ergonomics, system keyboard acceptance or physical transfer test was performed. Browser tests use synthetic inputs. Keep the [fluid workspace headset checklist](web-fluid-workspace.md#integration-seams-and-acceptance) open.
