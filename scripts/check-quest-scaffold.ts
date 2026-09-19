import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { JOINT_NAMES } from '../packages/contracts/src/index.js';

const root = resolve('apps/quest');
const assets = resolve(root, 'Assets');
const manifest = JSON.parse(await readFile(resolve(root, 'Packages/manifest.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
for (const [name, version] of Object.entries(manifest.dependencies)) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `${name} needs an exact stable candidate version`);
}
assert(!('com.unity.xr.oculus' in manifest.dependencies), 'Do not add a second XR provider');
assert.match(await readFile(resolve(root, 'ProjectSettings/ProjectVersion.txt'), 'utf8'), /m_EditorVersion: 6000\.3\.\d+f\d+/);
const entries = await readdir(assets, { recursive: true, withFileTypes: true });
const guids = new Map<string, string>();
let count = 0;
for (const entry of entries) {
  if (entry.name.endsWith('.meta')) continue;
  const path = resolve(entry.parentPath, entry.name);
  const metadata = await readFile(`${path}.meta`, 'utf8');
  const guid = /^guid: ([a-f0-9]{32})$/m.exec(metadata)?.[1];
  assert(guid, `Missing GUID: ${path}`);
  assert(!guids.has(guid), `Duplicate GUID: ${path}`);
  guids.set(guid, relative(assets, path)); count++;
  if (entry.isFile() && entry.name.endsWith('.asmdef')) {
    const assembly = JSON.parse(await readFile(path, 'utf8')) as {
      name: string; references: string[]; noEngineReferences: boolean;
    };
    if (['Trail.Contracts', 'Trail.Motion'].includes(assembly.name)) {
      assert.equal(assembly.noEngineReferences, true);
      assert(assembly.references.every(name => name === 'Trail.Contracts'));
    }
  }
}
const names = [...(await readFile(resolve(assets, 'Trail/Contracts/JointNames.cs'), 'utf8')).matchAll(/"([a-z-]+)"/g)].map(match => match[1]);
assert.deepEqual(names, [...JOINT_NAMES], 'C# joint names/order must match the canonical contract');
for (const [folder, forbidden] of [['Contracts', /\b(UnityEngine|UnityEditor|Meta|System\.IO|System\.Net)\b/], ['Motion', /\b(UnityEngine|UnityEditor|Meta|System\.IO|System\.Net)\b/]] as const) {
  for (const file of await readdir(resolve(assets, 'Trail', folder))) {
    if (file.endsWith('.cs')) assert(!forbidden.test(await readFile(resolve(assets, 'Trail', folder, file), 'utf8')), `${folder}/${file} has an impure dependency`);
  }
}
const scene = await readFile(resolve(assets, 'Trail/Scenes/Trail.unity'), 'utf8');
for (const match of scene.matchAll(/guid: ([a-f0-9]{32})/g)) assert(guids.has(match[1]!), 'Scene references missing asset');
console.log(`Quest scaffold structure checked: ${count} asset/folder GUIDs, exact candidate packages, pure domain boundaries and 25 named joints.`);
console.log('STATIC ONLY: no Unity package resolution, C# compilation, scene import, APK build or headset validation.');
