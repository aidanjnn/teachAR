import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PrivateFiles } from '../src/storage/files.js';

it('serializes conflicting edits, persists across restart and rejects path traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'trail-files-'));
  try {
    const store = new PrivateFiles(root); const id = randomUUID();
    await store.write('tutorials', id, { revision: 0 });
    await Promise.all(Array.from({ length: 12 }, () => store.serial(id, async () => {
      const current = await store.read<{ revision: number }>('tutorials', id);
      await store.write('tutorials', id, { revision: current.revision + 1 });
    })));
    expect(await new PrivateFiles(root).read('tutorials', id)).toEqual({ revision: 12 });
    expect(await readdir(join(root, 'tutorials', id))).toEqual(['manifest.json']);
    expect(() => store.path('tutorials', '../secret')).toThrow('Invalid storage ID');
    expect(() => store.path('tutorials', id, '../secret')).toThrow('Invalid asset name');
    expect(JSON.parse(await readFile(store.path('tutorials', id), 'utf8'))).toEqual({ revision: 12 });
  } finally { await rm(root, { recursive: true, force: true }); }
});
