import { copyFile, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Actual source copies with hash provenance. Avoids importing unrelated Meta sample assets.
// This gate is explicitly isolated; the full apps/quest import/build remains a separate gate.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const platform = process.argv.includes('--play-mode') ? 'PlayMode' : 'EditMode';
const versionText = await readFile(resolve(repo, 'apps/quest/ProjectSettings/ProjectVersion.txt'), 'utf8');
const version = /m_EditorVersion: (\S+)/.exec(versionText)[1];
const editor = process.env.UNITY_EDITOR ?? `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`;
const output = resolve(repo, 'artifacts/quest', `capture-isolated-${platform}-${randomUUID()}`);
const project = resolve(output, 'project');
const files = [];
for (const name of await readdir(resolve(repo, 'apps/quest/Assets/Trail/Contracts')))
  if (name.endsWith('.cs') || name.endsWith('.asmdef')) files.push(`Contracts/${name}`);
files.push('Motion/Trail.Motion.asmdef', 'Motion/CoordinateBasis.cs', 'Motion/WorkspaceCalibration.cs', 'Motion/CaptureMotion.cs', 'Motion/HandContinuity.cs',
  'Motion/GuideDefinition.cs', 'Motion/SaveZone.cs', 'Motion/RecordingState.cs', 'Motion/RecordingDirector.cs', 'Motion/TakeLedger.cs',
  'Runtime/Record/CaptureReplaySession.cs', 'Runtime/Record/HandObservationSource.cs', 'Runtime/XR/Trail.XR.asmdef', 'Runtime/XR/XRHandsSource.cs',
  'Tests/EditMode/Trail.Tests.EditMode.asmdef', 'Tests/EditMode/CaptureFixtureAssertions.cs', 'Tests/EditMode/CaptureMotionTests.cs',
  'Tests/EditMode/RecordingFixtureAssertions.cs', 'Tests/EditMode/RecordingLifecycleTests.cs',
  'Tests/CaptureRuntime/Trail.Tests.CaptureRuntime.asmdef', 'Tests/CaptureRuntime/CaptureLifecycleTests.cs');
const hashes = {};
for (const file of files) {
  const source = resolve(repo, 'apps/quest/Assets/Trail', file);
  const target = resolve(project, 'Assets/Trail', file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target); await copyFile(`${source}.meta`, `${target}.meta`);
  hashes[file] = createHash('sha256').update(await readFile(source)).digest('hex');
}
await writeFile(resolve(project, 'Assets/Trail/Runtime/Trail.Runtime.asmdef'), JSON.stringify({ name: 'Trail.Runtime', references: ['Trail.Contracts', 'Trail.Motion'] }));
await mkdir(resolve(project, 'Packages'), { recursive: true });
await mkdir(resolve(project, 'ProjectSettings'), { recursive: true });
await writeFile(resolve(project, 'ProjectSettings/ProjectVersion.txt'), versionText);
await writeFile(resolve(project, 'Packages/manifest.json'), JSON.stringify({ dependencies: {
  'com.unity.xr.hands': '1.7.2', 'com.unity.test-framework': '1.6.0', 'com.unity.modules.xr': '1.0.0', 'com.unity.modules.jsonserialize': '1.0.0',
} }, null, 2));
await writeFile(resolve(output, 'source-hashes.json'), JSON.stringify({ editorVersion: version, platform, isolated: true, files: hashes }, null, 2));
const results = resolve(output, 'results.xml');
const args = ['-batchmode', '-nographics', '-projectPath', project, '-runTests', '-testPlatform', platform, '-testResults', results, '-logFile', resolve(output, 'unity.log')];
console.log(`Running real Unity ${platform} capture tests in ${project}; source hashes recorded.`);
const child = spawn(editor, args, { stdio: 'inherit' });
let timedOut = false;
const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 10 * 60 * 1000);
const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); }).finally(() => clearTimeout(timeout));
if (timedOut || code !== 0) throw new Error(`Unity isolated ${platform} failed (${timedOut ? 'timeout' : code}): ${output}`);
const xml = await readFile(results, 'utf8');
if (!/<test-run\b[^>]*\bresult="Passed"/.test(xml) || !/<test-run\b[^>]*\btotal="[1-9]\d*"/.test(xml)) throw new Error(`Unity tests did not pass: ${results}`);
console.log(`PASS real isolated Unity ${platform}: ${results}; this is not full-project/Android/headset validation.`);
