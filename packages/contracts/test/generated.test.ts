import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { buildContractSchemas } from '../tools/schema-registry.js';
it('keeps generated C# DTOs, readers and shape constraints synchronized with Zod', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trail-contract-generation-'));
  try {
    const schemaPath = join(dir, 'schemas.json');
    writeFileSync(schemaPath, JSON.stringify(buildContractSchemas()));
    execFileSync('python3', ['packages/contracts/tools/generate-csharp.py', schemaPath, dir]);
    for (const name of ['ContractModels.cs','ContractJson.Generated.cs','ContractShapeData.Generated.cs']) {
      expect(readFileSync(join(dir,name),'utf8'), `${name} requires regeneration`).toBe(readFileSync(`apps/quest/Assets/Trail/Contracts/${name}`,'utf8'));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

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
