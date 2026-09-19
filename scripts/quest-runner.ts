import { access, mkdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export function assertTestResult(xml: string): void {
  const root = /<test-run\b([^>]*)>/.exec(xml)?.[1];
  if (!root || !/\bresult="Passed"/.test(root) || !/\btotal="[1-9]\d*"/.test(root) ||
      !/\bfailed="0"/.test(root) || !/\bpassed="[1-9]\d*"/.test(root)) {
    throw new Error('Unity did not report passing nonempty tests');
  }
}
export async function runQuest(action: string, root = process.cwd(), env = process.env): Promise<string> {
  if (!['setup', 'test', 'test-play', 'build'].includes(action)) throw new Error('Use quest:setup, quest:test, quest:test:play or quest:build');
  const project = resolve(root, 'apps/quest');
  const version = /m_EditorVersion: (\S+)/.exec(await readFile(resolve(project, 'ProjectSettings/ProjectVersion.txt'), 'utf8'))?.[1];
  if (!version) throw new Error('Missing pinned Unity version');
  const editor = env.UNITY_EDITOR || `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`;
  await access(editor, constants.X_OK).catch(() => { throw new Error(`Unity ${version} is unavailable. Set UNITY_EDITOR to that editor with Android Build Support. No native check ran.`); });
  const artifacts = resolve(root, 'artifacts/quest', `${action}-${randomUUID()}`);
  await mkdir(artifacts, { recursive: true });
  const resultPath = resolve(artifacts, 'results.xml');
  const reportPath = resolve(artifacts, 'build.json');
  const apkPath = resolve(artifacts, 'Trail.apk');
  const logPath = resolve(artifacts, 'unity.log');
  const args = ['-batchmode', '-nographics', '-buildTarget', 'Android', '-projectPath', project, '-logFile', logPath];
  const testing = action === 'test' || action === 'test-play';
  if (testing) args.push('-runTests', '-testPlatform', action === 'test' ? 'EditMode' : 'PlayMode', '-testResults', resultPath);
  else args.push('-executeMethod', `Trail.Editor.ProjectSetup.${action === 'build' ? 'BuildAndroid' : 'Apply'}`, '-quit');
  const child = spawn(editor, args, { stdio: 'inherit', env: { ...env, TRAIL_APK_PATH: apkPath, TRAIL_BUILD_REPORT_PATH: reportPath } });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 30 * 60_000);
  const terminate = () => child.kill('SIGTERM');
  process.once('SIGINT', terminate); process.once('SIGTERM', terminate);
  let code: number;
  try { code = await new Promise<number>((done, reject) => { child.once('error', reject); child.once('exit', value => done(value ?? 1)); }); }
  finally { clearTimeout(timeout); process.removeListener('SIGINT', terminate); process.removeListener('SIGTERM', terminate); }
  if (timedOut || code !== 0) throw new Error(`Unity ${action} failed (${timedOut ? 'timeout' : code}); inspect ${logPath}`);
  const log = await readFile(logPath, 'utf8');
  const actualVersion = /(?:Initialize engine version:|Unity Editor version:)\s*(\S+)/.exec(log)?.[1];
  if (actualVersion !== version) throw new Error('Unity log did not confirm the pinned editor version');
  if (testing) assertTestResult(await readFile(resultPath, 'utf8'));
  if (action === 'build') {
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as Record<string, unknown>;
    if (report.result !== 'Succeeded' || report.editor !== version || report.platform !== 'Android' || report.architecture !== 'ARM64' || report.backend !== 'IL2CPP' ||
        (await stat(apkPath)).size < 1) throw new Error(`Missing or invalid ARM64/IL2CPP build evidence: ${artifacts}`);
  }
  // A resolved lock must be produced by Unity, never synthesized by this wrapper.
  await access(resolve(project, 'Packages/packages-lock.json')).catch(() => { throw new Error('Unity did not produce a resolved UPM lock'); });
  return artifacts;
}
