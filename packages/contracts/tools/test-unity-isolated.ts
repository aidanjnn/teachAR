// Compile and run the unchanged pure domain assemblies independently of app/vendor setup.
// This does not build an APK or validate the main scene, XR, providers or hardware.
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const root = process.cwd();
const projectVersion = await readFile('apps/quest/ProjectSettings/ProjectVersion.txt', 'utf8');
const version = /m_EditorVersion: (\S+)/.exec(projectVersion)?.[1];
if (!version) throw new Error('Missing pinned editor version');
const editor = process.env.UNITY_EDITOR || `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`;
await access(editor, constants.X_OK);
const project = await mkdtemp(join(tmpdir(), 'trail-contracts-unity-'));
const assets = 'apps/quest/Assets/Trail';
const sources: { path: string; sha256: string }[] = [];
async function copy(relative: string, destination: string) {
  await mkdir(resolve(destination, '..'), { recursive: true });
  await copyFile(relative, destination);
  sources.push({ path: relative, sha256: createHash('sha256').update(await readFile(relative)).digest('hex') });
}
for (const folder of ['Contracts','Motion']) {
  for (const file of await readdir(`${assets}/${folder}`)) {
    if (!file.endsWith('.cs') && !file.endsWith('.asmdef') && !file.endsWith('.meta')) continue;
    // Only basis conversion belongs to this contract-specific test project.
    if (folder === 'Motion' && !['CoordinateBasis.cs','CoordinateBasis.cs.meta','Trail.Motion.asmdef','Trail.Motion.asmdef.meta'].includes(file)) continue;
    await copy(`${assets}/${folder}/${file}`, join(project,'Assets/Trail',folder,file));
  }
}
for (const file of ['StrictContractTests.cs','StrictContractTests.cs.meta','CoordinateBasisTests.cs','CoordinateBasisTests.cs.meta','Trail.Tests.EditMode.asmdef','Trail.Tests.EditMode.asmdef.meta']) await copy(`${assets}/Tests/EditMode/${file}`, join(project,'Assets/Trail/Tests/EditMode',file));
await mkdir(join(project,'Packages')); await mkdir(join(project,'ProjectSettings'));
await writeFile(join(project,'ProjectSettings/ProjectVersion.txt'),projectVersion);
await writeFile(join(project,'Packages/manifest.json'),JSON.stringify({dependencies:{'com.unity.test-framework':'1.4.6'}},null,2));
await writeFile(join(project,'sources.json'),JSON.stringify({sourceRoot:root,editor,version,sources},null,2));
const results=join(project,'results.xml'), log=join(project,'test.log');
console.log(`Isolated Unity contracts project and evidence: ${project}`);
const child=spawn(editor,['-batchmode','-nographics','-projectPath',project,'-runTests','-testPlatform','EditMode','-testResults',results,'-logFile',log],{stdio:'inherit'});
const timeout=setTimeout(()=>child.kill('SIGTERM'),10*60*1000);
const code=await new Promise<number>((done,reject)=>{child.once('error',reject);child.once('exit',c=>done(c??1));}).finally(()=>clearTimeout(timeout));
if(code!==0) throw new Error(`Unity contract tests failed (${code}); see ${log}`);
const xml=await readFile(results,'utf8');
if(!/<test-run\b[^>]*\bresult="Passed"/.test(xml) || !/<test-run\b[^>]*\btotal="[1-9]\d*"/.test(xml) || !xml.includes('StrictContractTests.UnitQuaternionBoundarySurvivesNativeFloatConversionAndReexport')) throw new Error(`Missing passing nonempty contract results: ${results}`);
for(const source of sources) if(createHash('sha256').update(await readFile(source.path)).digest('hex')!==source.sha256) throw new Error(`Source changed during test: ${source.path}`);
console.log(`Pure domain Unity EditMode passed; evidence ${results}. Full app, Android IL2CPP and headset acceptance remain separate.`);
