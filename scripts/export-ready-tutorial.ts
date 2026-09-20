/** Export one verified ready tutorial into a fresh private server data directory. No pairing or secrets. */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TutorialSchema, parseTutorialForRecording, parseSceneReferencesForTutorial } from '../packages/contracts/src/index.js';
import { TutorialRepository } from '../apps/server/src/storage/repository.js';
import { ReferenceStore } from '../apps/server/src/storage/references.js';
import { digest } from '../apps/server/src/storage/files.js';

function assertId(value: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('Expected a stored UUID.');
}

export async function exportReadyTutorial(dataDir: string, tutorialId: string, outputDir: string) {
  assertId(tutorialId);
  const source = new TutorialRepository(resolve(dataDir)); const references = new ReferenceStore(source);
  const bundle = await source.bundle(tutorialId); const tutorial = TutorialSchema.parse(bundle.tutorial);
  if (tutorial.status !== 'ready') throw new Error('Only a finalized reviewed tutorial can be exported.');
  const { recording, sha256 } = await source.recording(tutorial.recordingId);
  parseTutorialForRecording(tutorial, recording, sha256);
  parseSceneReferencesForTutorial({ schemaVersion: 1, recordingId: recording.id, recordingHash: sha256,
    tutorialId, tutorialRevision: tutorial.revision, references: bundle.references }, tutorial);
  // Resolve every used asset before creating output. This verifies trusted reference/image bindings.
  for (const step of tutorial.steps) if (bundle.references.some(reference => reference.stepId === step.id))
    await references.resolveReferences({ runId: 'export-validation', tutorialId, tutorialRevision: tutorial.revision, stepId: step.id, stepRevision: 0, attemptId: 'export' });
  const layout = await references.layout(tutorialId);
  const assetIds = new Set(bundle.references.map(reference => reference.assetId));
  if (layout) assetIds.add(layout.layout.assetId);
  const assets = [];
  for (const id of assetIds) { assertId(id); assets.push(await references.image(id)); }
  const recordingBytes = await source.recordingContent(recording.id);
  const narration = recording.audio ? await source.narration(recording.id) : null;
  const upload = await source.uploadStatus(recording.id);
  const output = resolve(outputDir);
  if (output === resolve(dataDir)) throw new Error('Export requires a new output directory.');
  // An existing output (including a running server data directory) is never overwritten.
  await mkdir(output, { mode: 0o700 });
  const target = new TutorialRepository(output);
  try {
    await target.files.writeBytes('recordings', recording.id, recordingBytes, 'recording.json');
    if (narration) await target.files.writeBytes('recordings', recording.id, narration, 'narration.wav');
    // Completed uploads need the verified content, not temporary upload chunks or resumable jobs.
    await target.files.write('recordings', recording.id, { ...upload, chunks: [], status: 'ready', hash: sha256 });
    for (const asset of assets) await target.files.write('assets', asset.id, asset);
    try {
      const review = await readFile(source.files.path('tutorials', tutorialId, 'narration-review.json'));
      await target.files.writeBytes('tutorials', tutorialId, review, 'narration-review.json');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await target.files.write('tutorials', tutorialId, { tutorial, references: bundle.references, ...(layout ? { layout: layout.layout } : {}) });
    // Read through production storage again, before reporting a portable directory as complete.
    await target.recording(recording.id); await target.tutorial(tutorialId);
    if (layout) await new ReferenceStore(target).layout(tutorialId);
    const manifest = { schemaVersion: 1, tutorialId, tutorialRevision: tutorial.revision, recordingId: recording.id,
      recordingSha256: sha256, narrationSha256: narration ? digest(narration) : null,
      assets: assets.map(asset => ({ id: asset.id, sha256: asset.image.sha256 })),
      recordingSource: recording.source, labelProvenance: tutorial.provenance.labels,
      format: 'Trail private server data directory; no pairing, credentials or upload chunks' };
    await writeFile(resolve(output, 'export-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return manifest;
  } catch (error) {
    // This invocation exclusively created this directory; never remove a preexisting target.
    await rm(output, { recursive: true, force: true }); throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [dataDir, tutorialId, outputDir, ...extra] = process.argv.slice(2);
  if (!dataDir || !tutorialId || !outputDir || extra.length) throw new Error('Usage: pnpm exec tsx scripts/export-ready-tutorial.ts DATA_DIR TUTORIAL_UUID NEW_OUTPUT_DIR');
  const result = await exportReadyTutorial(dataDir, tutorialId, outputDir);
  console.log(`Exported ready tutorial ${result.tutorialId}, revision ${result.tutorialRevision}. Private media is included; pairing and credentials are excluded.`);
}
