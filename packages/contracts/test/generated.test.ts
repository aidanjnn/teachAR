import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('regenerates every shared fixture without dropping regression cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trail-fixture-generation-'));
  try {
    execFileSync(process.execPath, ['--import', 'tsx', 'packages/contracts/tools/generate-fixtures.ts', dir]);
    const expected = readdirSync('fixtures/contracts').sort();
    expect(readdirSync(dir).sort()).toEqual(expected);
    for (const name of expected) {
      expect(JSON.parse(readFileSync(join(dir, name), 'utf8')), `${name} differs from its generator`).toEqual(
        JSON.parse(readFileSync(join('fixtures/contracts', name), 'utf8')),
      );
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
