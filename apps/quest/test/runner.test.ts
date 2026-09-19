import { expect, it } from 'vitest';
import { assertTestResult, runQuest } from '../../../scripts/quest-runner.js';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
it('rejects empty/failed/non-passing Unity results', () => {
  for (const xml of ['', '<test-run total="0" result="Passed" failed="0" passed="0">', '<test-run total="2" result="Passed" failed="1" passed="1">', '<test-run total="2" result="Failed" failed="1" passed="1">']) expect(() => assertTestResult(xml)).toThrow();
  expect(() => assertTestResult('<test-run total="2" result="Passed" failed="0" passed="2"></test-run>')).not.toThrow();
});
it('fails missing editors and prevents missing results/old artifacts from masquerading as a native pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'trail-wrapper-'));
  const editor = join(root, 'editor');
  try {
    await mkdir(join(root, 'apps/quest/ProjectSettings'), { recursive: true });
    await mkdir(join(root, 'apps/quest/Packages'), { recursive: true });
    await writeFile(join(root, 'apps/quest/ProjectSettings/ProjectVersion.txt'), 'm_EditorVersion: 6000.3.24f1\n');
    await expect(runQuest('test', root, { UNITY_EDITOR: editor })).rejects.toThrow('No native check ran');
    await writeFile(editor, '#!/bin/sh\nexit 0\n'); await chmod(editor, 0o700);
    await expect(runQuest('test', root, { UNITY_EDITOR: editor })).rejects.toThrow();
    await expect(runQuest('build', root, { UNITY_EDITOR: editor })).rejects.toThrow();
    await expect(runQuest('setup', root, { UNITY_EDITOR: editor })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
