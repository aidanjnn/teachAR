# Trail interaction diagnostics

The browser tutor observes gesture delivery, reconstructs approved diagnostic
state for Sentry Session Replay, and summarizes interruptions within each tutorial
step. These implement **Tracing, Logs and Session Replay**, three products named
in the [Hack the North Sentry prize criteria](https://hackthenorth2026.devpost.com/).
The integration alone is not evidence that Sentry improved the product. Record an
actual discovery, its fix and a comparable follow-up run before making that claim.

For a concise sponsor walkthrough of the implemented features and the verified
debugging story, read [Trail × Sentry](sentry.md).

## Run locally

This implementation targets `apps/webxr`, not the separate Vite
dashboard or Unity runtime. From the repository root:

```sh
pnpm install --frozen-lockfile
cd apps/webxr
sh start.sh
```

Open `/tutorial`. Expand **TRAIL / OBSERVATORY** to inspect observations. Diagnostics
are local until explicitly configured. The Sentry SDK is bundled from the exact
workspace dependency pin; no runtime CDN is needed. A blocked configuration request,
unavailable SDK or failed transport must not interrupt recording or local guidance.

## Enable a Sentry browser project

Create/select a JavaScript browser project in Sentry and copy its **public DSN**.
Set environment variables in the terminal that starts the tutor's server:

```sh
export SENTRY_ENABLED=true
export SENTRY_BROWSER_DSN='https://PUBLIC_KEY@oYOUR_ORG.ingest.us.sentry.io/PROJECT_ID'
export SENTRY_REPLAY_ENABLED=true
export SENTRY_ENVIRONMENT=hackathon-demo
export SENTRY_RELEASE="trail-browser@$(git describe --always --dirty)"
export SENTRY_TRACES_SAMPLE_RATE=1
sh start.sh
```

For repeatable local setup, copy
[`apps/webxr/.env.example`](../apps/webxr/.env.example)
to `.env` in that directory, fill in the public DSN and set both enable flags to
`true`, then run `. ./.env` before `sh start.sh`. The template defaults to local-only
diagnostics. The copied `.env` is ignored by Git.

Replace the example DSN with the complete value from Sentry. This implementation
accepts hosted HTTPS `ingest[.region].sentry.io` DSNs. It rejects credentials,
queries, fragments and unrelated hosts. Do not put a Sentry auth token in these
variables: the browser only needs the public DSN. No source-map upload or Sentry
administration token is required for these custom interaction traces.

The Python prototype reads process environment variables, not the repository's
`.env` file. Restart an already-running server after changing its configuration
and reload `/tutorial`. The existing background helper reuses running servers;
it does not reload their environment.

The Fastify server also serves `/api/telemetry/config` when running the tutor at
its origin for the voice coach. Use the same public Sentry variables from the
root environment example for that server. This configures the browser SDK; it
does not instrument server requests or change pairing/voice authorization.

For this Mac's connected development checkout, the public settings are saved in
ignored `apps/webxr/.runtime/sentry.env`. After stopping that
checkout's server, restart it with:

```sh
cd /Users/aidanjeon/.codex/worktrees/sentry-observability/trail/apps/webxr
. .runtime/sentry.env
"$TRAIL_PYTHON" start-background.py
```

The connected preview is `http://127.0.0.1:4331/tutorial`; the original server on
4321 is a different checkout. The ignored file is local setup, not a portable
credential or a committed project default.

`/api/telemetry/config` returns only validated public configuration. Both external
telemetry and Replay are explicitly enabled above; invalid configuration fails
closed to local-only diagnostics. `configured` means the SDK initialized, **not**
that Sentry received an event. Confirm actual reception in Sentry's Logs, Traces
and Replays pages. The demo sample rate captures all instrumented interaction
traces; reduce it for sustained usage. Keep the diagnostics panel expanded when
recording a useful diagnostic replay.

## What the observations mean

An interaction can contain `targeted`, `activated`, `hit_test`, `dispatched`,
`state_changed`, `feedback_rendered` or `rejected` stages. Targeting is deduplicated
and rate limited. A missed hit, rejected action, unchanged state, timeout or session
exit has an explicit outcome. Trace/log correlation uses an opaque interaction ID.

`feedback_rendered` means the matching UI state was drawn and submitted through
the renderer. It does not establish that the wearer saw it or that an asynchronous
save succeeded. Persistence remains governed by the existing save lifecycle.
Only actual headset observation can establish physical control usability.

Step reports group by an opaque tutorial alias, revision, step and source. They
separate following time, automatic preview, waiting at the start,
explicit user pause/watching a demonstration, required-hand tracking loss,
application waiting, checkpoint waiting and unknown time. Missing a hand that
the step does not require must not count as a tracking interruption. Long gaps
and hidden periods are not credited as uninterrupted activity. Repeats, requests
to watch the demonstration, and accepted confirmations are explicit actions.
The current practice flow advances through movement checkpoints without a user
confirmation; confirmation counts apply to the retained older guide path. Reached
checkpoints count separately from interruptions. Help counts describe the
instrumented Watch action, not all possible human assistance.

The report includes sample counts, ongoing versus ended attempts and provenance.
Aliases and local aggregates are scoped to the current page session; they are not
stable cross-device learner identities. Reloading resets the local comparison.
Revisions and sources are kept separate. Small samples are investigation prompts,
not proof of confusing instructions, successful learning or improved teaching.

## Privacy and authority

Telemetry constructs fresh, allowlisted scalar records. It excludes tutorial
titles/instructions, real tutorial IDs, hand coordinates, images, audio, narration,
request bodies, authentication material and arbitrary error text. Opaque IDs
correlate events within the page without exposing the original recording identity.

Session Replay reconstructs only the diagnostic panel. It is **not headset video**,
a replay of the wearer's room, or a physical-motion recording. Normal product DOM,
media, WebXR canvases and user input are excluded. The final transport filters
Logs, Traces and Replay as well as their metadata; default PII flags alone are not
the privacy boundary. Local JSON export contains bounded sanitized observations.

The event sanitizer retains the pinned SDK's explicit `infer_ip: "never"` setting.
Removing that setting would re-enable Sentry's legacy JavaScript IP inference.
Also enable **Project Settings → Security & Privacy → Prevent Storing of IP
Addresses** as a server-side safeguard. This affects new events; it does not
retroactively remove data from earlier test sessions.

Observers execute at runtime boundaries. They cannot change the follower,
tolerances, calibration, recordings, saved tutorials or completion decisions.
Movement checkpoints and user confirmations remain distinct from assembly proof.

## A defensible Sentry demonstration

1. Run a real tutorial and reproduce an unresponsive control or repeated tracking
   interruption. Record the commit, source/device and scenario separately.
2. Find its interaction trace and matching structured logs in Sentry. Use Replay
   to examine the diagnostic state before and after the action.
3. For step observations, compare attempts at the same revision and source;
   inspect whether interruption clusters justify reviewing the demonstration.
4. Make a focused code or tutorial-content change based on that evidence.
5. Repeat comparable trials. Report counts, conditions and measured results;
   include the Sentry evidence links and change reference in the submission.

Deliberate fault injection and synthetic fixtures must remain labelled synthetic.
An observed interruption is not automatically a bug, and a synthetic improvement
does not establish headset or human learning performance.

## Verification

```sh
cd apps/webxr
sh test-all.sh
```

The suite includes privacy/bounds checks, runtime interaction observations,
friction accounting, configuration boundaries and browser behavior. The real-SDK
payload test uses an in-memory transport: it verifies Logs, Tracing and Replay
envelopes while injecting sensitive sentinels, without sending data to Sentry.
This is SDK payload evidence, not live account reception or headset acceptance.

### Live development connection verified on 2026-09-20

The signed-in `trail-yf` organization initially had no projects. Created
[`trail-browser`](https://trail-yf.sentry.io/projects/trail-browser/) with Logs,
Tracing and Session Replay, connected its public DSN locally, and verified all
three products in Sentry after the initial indexing delay:

- [Structured Logs](https://trail-yf.sentry.io/explore/logs/?project=4512117401321473):
  real desktop `trail.guide_state` and `trail.interaction` events in
  `hackathon-demo`; labelled synthetic SDK checks use `integration-test`.
- [Desktop interaction trace](https://trail-yf.sentry.io/explore/traces/trace/e6c860257f1c45158bc8d26e960248a1/?project=4512117401321473):
  a click in the desktop headset preview produced activation, hit-test and
  rejection (`no_control`) observations. This is desktop software evidence.
- [Corrected anonymous diagnostic replay](https://trail-yf.sentry.io/explore/replays/9a672b0807cd4591a4cd6dacb6afd03f/?project=4512117401321473):
  played after the IP-inference correction. At about 21 seconds, the panel shows
  the desktop activation, hit-test and `no_control` rejection. The reconstruction
  contains the diagnostic panel, without the product UI or media.

**A real finding from Sentry:** the first hosted Replay showed an inferred IP
address even though the application payload omitted user data. Inspection found
that the final sanitizer had removed the SDK's IP-inference opt-out. Preserved
that fixed setting, added transport and real-SDK regression assertions, enabled
the project IP-storage safeguard, and verified that the next hosted Replay was
labelled **Anonymous User**. The earlier test replay remains historical evidence;
the change applies to subsequent sessions. This is an observability-driven
privacy correction, not a headset usability or learning-outcome improvement.

The recorded release was `trail-browser@32d3020-sentry-working`, before the move
from `experiments/quest-browser` to `apps/webxr`. All 93 Node cases passed after that correction, and the
real-SDK privacy payload test passes with zero external requests. Prior Python,
browser and workspace validation is recorded in [the activity log](codex-log.md).
Current PR checks after reconciling the package move and newer practice flow are
recorded separately in the activity log. No new Quest, physical-task, learner or
AI-provider acceptance is claimed.

Primary references: [custom tracing](https://docs.sentry.io/platforms/javascript/tracing/instrumentation/),
[structured Logs](https://docs.sentry.io/platforms/javascript/logs/),
[Session Replay](https://docs.sentry.io/platforms/javascript/session-replay/),
and [Replay privacy](https://docs.sentry.io/platforms/javascript/session-replay/privacy/).
