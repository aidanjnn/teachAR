import { runQuest } from './quest-runner.js';
const artifacts = await runQuest(process.argv[2] ?? '');
console.log(`Unity command completed: ${artifacts}. This does not establish headset readiness.`);
