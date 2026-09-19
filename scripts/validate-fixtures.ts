import { readFile } from 'node:fs/promises';
import { RecordingSchema } from '../packages/contracts/dist/index.js';
const fixture = RecordingSchema.parse(JSON.parse(await readFile(new URL('../fixtures/synthetic-reach.v1.json', import.meta.url), 'utf8')));
console.log(`${fixture.id}: ${fixture.frames.length} frames, ${fixture.durationMs} ms, ${fixture.source}`);
