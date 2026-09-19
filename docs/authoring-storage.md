# Authoring, storage and spectator

This implementation supports motion-only recording upload, deterministic step proposals,
manual review, immutable ready tutorials and private native preload. It does not implement
narration/transcription/semantic providers or GPT Live. `TutorialRepository.applyLabels`
is the revision-bound extension for a separately validated provider result.

## Run a local workspace

Build with `pnpm build`, then explicitly enable the USB/loopback development exception:

```sh
ALLOW_USB_LOOPBACK=true PAIRING_ORIGINS=http://127.0.0.1:3001 pnpm start
```

Open `http://127.0.0.1:3001`, choose **Author a guide**, and use the short-lived initial
browser-author code in private `data/pairing.json`. Codes are never put in logs or page source.
To pair another client, choose its role and **Client** (Quest app or Browser), then
create a code. A code is valid only for that client type; browser sessions use cookies,
while the native app receives its scoped bearer token.
Use `DATA_DIR` to isolate runs. Restart revokes credentials; recordings and ready guides
persist. For actual TLS, provide both `TLS_CERT_FILE` and `TLS_KEY_FILE`, configure an
exact HTTPS `PAIRING_ORIGINS`, and use a certificate trusted by the browser/headset.
Proxy headers do not confer secure-transport trust. The server binds loopback.

Import the four-step synthetic sample or a canonical v1 motion-only JSON file. Review
all step instructions, active hands, frame ranges and completion modes. **Apply step
edits** preserves a local edit; **Save reviewed draft** re-derives targets and checks the
revision. Placeholder instructions retain fallback provenance and cannot finalize.
**Finalize guide** publishes an immutable version; the library reloads that exact version.
A synthetic source remains labelled synthetic, including in spectator output.

For each step, an author may upload a PNG/JPEG captured from that recording's checkpoint
and approve a visible-outcome description. The server decodes the bytes, checks hashes,
size, dimensions and recording/frame binding. Source/timing supplied by a desktop import
are author assertions, not sensor-freshness evidence. Images must come from the actual
recorded state; re-record if it was missed. Draft edits clear previous image approvals.
Image approval is optional for motion guidance; visual inspection fails closed without it.

## Storage and recovery

- Server-generated UUID paths only; private files use mode 0600 and directories 0700.
  Synced temporary files are renamed atomically. A single server process owns each data
  directory. Keep it outside the static web root and do not share it between live servers.
- One unfinished recording; 120 seconds / 3,600 frames / 64 MiB motion aggregate,
  up to 64 chunks of at most 2 MiB. Identical retries are accepted, differing retries and
  out-of-order chunks fail. Resume by importing the same file; an author can discard an
  unfinished upload. Ready data cannot be discarded through that endpoint.
- Up to 128 recordings/jobs per local directory and 32 pending storage operations.
  A capture has at most 240 reference images / 64 MiB aggregate, each at most 2 MiB and
  1280×1280. At most two approved images per step reach the inspection service.
- Incomplete recordings stay incomplete after restart. Running jobs become interrupted;
  retrying compilation is safe and completed jobs deduplicate by recording hash/revision.
  Draft edits are serialized and require `baseRevision`. Ready tutorial + approved
  references publish in one atomic wrapper. Later draft edits cannot alter a ready guide.
- JSON frame chunks suit the browser. Native byte chunks preserve the exact UTF-8 JSON
  spelling and SHA256 across C# and JavaScript. Both paths validate the same Recording
  schema; raw byte finalization additionally checks server ID and metadata binding.
- Unity `PrivateTutorialCache` validates exact bytes/hash and recording/tutorial binding,
  checks free space, and atomically renames a complete temporary directory. Pending
  directories are removed on startup. An already loaded guide owns its data in memory.
  This is not evidence for cold offline application startup or Android filesystem durability.

## API and ownership

Pairing scopes every route. Browser safe reads use POST aliases to retain mandatory
Origin checks; native GET requires bearer authentication. Spectators cannot read raw
recordings or mutate authoring/progression.

| Operation | Endpoint |
| --- | --- |
| Create / resume status | `POST /api/recordings`, `POST /api/recordings/uploads/query` |
| Frame chunks / finalize | `PUT /api/recordings/:id/motion/:chunk`, `POST /api/recordings/:id/finalize` |
| Exact-byte chunks / finalize | `PUT /api/recordings/:id/bytes/:chunk`, `POST /api/recordings/:id/finalize-bytes` |
| Compile / result | `POST /api/tutorial-jobs`, `GET /api/tutorial-jobs/:id` |
| Review / publish | `PATCH /api/tutorials/:id`, `POST /api/tutorials/:id/finalize` |
| Library / ready tutorial | `GET /api/tutorials`, `GET /api/tutorials/:id` (browser `/query` POST aliases) |
| Reference upload / approval | `POST /api/reference-images`, `PUT /api/tutorials/:id/references` |
| Native preload bytes | `GET /api/recordings/:id/download`, `GET /api/recordings/:id/content/:chunk` |
| Headset state acknowledgment | `POST /api/guide-events` → 204 after accepted canonical event |
| Read-only audience | `WS /api/ws` (cookie path), `WS /ws` native alias |

The relay accepts one native learner publisher, rejects retired runs and stale sequence
numbers, limits messages and sockets, and closes slow readers instead of accumulating
queues. Reconnect receives a full snapshot. Freshness expires after three seconds; the
spectator is a schematic instruction/progress view, not camera video or physical proof.
The inspection coordinator checks a fresh calibrated paused snapshot and exact
run/tutorial/step/attempt identity. Resume, revision changes or disconnect invalidate work.

`NativeStorageFeature` registers at platform order 40, persists Capture.RecordingCompleted,
uploads as author, downloads ready guides as learner, invokes GuideController.Preload
only after verification, and forwards read-only telemetry. Pending native uploads survive
process restart and retry identical chunks. Guide preload requires independent calibration;
the expert registration is never restored. Native source and controls need actual headset QA.

## Reproduce checks

```sh
pnpm check
pnpm validate:fixtures
E2E_PORT=3107 pnpm test:e2e --workers=1
dotnet run --project apps/quest/storage-tests/Storage.csproj
dotnet build apps/quest/storage-tests/UnityCompile.csproj
pnpm quest:test
```

The .NET cache harness executes real production C# and hash/binding/recovery behavior.
The managed assembly diagnostic references the installed Unity 6000.3.24f1 DLLs; neither
replaces Editor import, IL2CPP, headset tracking, real captured references or novice transfer.
Per-run results are recorded in `docs/codex-log.md`; no physical LEGO run is claimed here.
