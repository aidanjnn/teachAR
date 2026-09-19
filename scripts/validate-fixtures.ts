import { readFile } from 'node:fs/promises';
import { LabelSegmentsSchema, RecordingSchema, TranscriptResultSchema } from '../packages/contracts/dist/index.js';

async function load(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}
const recording = RecordingSchema.parse(await load('synthetic-reach.v1.json'));
console.log(`${recording.id}: ${recording.frames.length} frames, ${recording.durationMs} ms, ${recording.source}`);
const transcript = TranscriptResultSchema.parse(await load('narration-transcript.v1.json'));
console.log(`narration-transcript.v1: ${transcript.spans.length} spans, ${transcript.audioDurationMs} ms, ${transcript.source}`);
const segmentsFile = (await load('label-segments.v1.json')) as { segments?: unknown };
const segments = LabelSegmentsSchema.parse(segmentsFile.segments);
console.log(`label-segments.v1: ${segments.length} segments`);
