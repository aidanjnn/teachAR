import { access, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const action = process.argv[2];
if (action !== 'test' && action !== 'setup') throw new Error('Use quest:test or quest:setup');
const version = /m_EditorVersion: (\S+)/.exec(await readFile('apps/quest/ProjectSettings/ProjectVersion.txt', 'utf8'))?.[1];
const editor = process.env.UNITY_EDITOR || `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`;
await access(editor, constants.X_OK).catch(() => {
  throw new Error(`Unity ${version} is not installed at the configured path. Install it separately with Android Build Support, then set UNITY_EDITOR if needed. No native check ran.`);
});
const artifacts = resolve('artifacts/quest');
await mkdir(artifacts, { recursive: true });
// Unique result path prevents a previous successful run from masking missing output.
const resultPath = resolve(artifacts, `editmode-${Date.now()}.xml`);
const args = ['-batchmode', '-nographics', '-projectPath', resolve('apps/quest'), '-logFile', resolve(artifacts, `${action}.log`)];
if (action === 'test') args.push('-runTests', '-testPlatform', 'EditMode', '-testResults', resultPath);
else args.push('-executeMethod', 'Trail.Editor.ProjectSetup.Apply', '-quit');
const child = spawn(editor, args, { stdio: 'inherit' });
const code = await new Promise<number>((resolveCode, reject) => {
  child.once('error', reject); child.once('exit', value => resolveCode(value ?? 1));
});
if (code !== 0) throw new Error(`Unity ${action} failed (${code}); inspect artifacts/quest/${action}.log`);
if (action === 'test') {
  const result = await readFile(resultPath, 'utf8');
  if (!/<test-run\b[^>]*\bresult="Passed"/.test(result) || !/<test-run\b[^>]*\btotal="[1-9]\d*"/.test(result)) {
    throw new Error(`Unity did not report passing nonempty tests: ${resultPath}`);
  }
}
console.log(`Unity ${action} completed. This does not establish headset readiness.`);
