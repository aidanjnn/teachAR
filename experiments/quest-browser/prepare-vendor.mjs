// Reuse the repository's exact Three.js pin; no runtime CDN or second JS lockfile.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
let build;
try{build=dirname(require.resolve('three'));}catch{throw Error('Run pnpm install --frozen-lockfile from the repository root first.');}
const manifest=JSON.parse(await readFile(resolve(root,'three-vendor-manifest.json'),'utf8'));
const installed=JSON.parse(await readFile(resolve(build,'../package.json'),'utf8'));
if(installed.version!==manifest.version)throw Error(`Expected Three.js ${manifest.version}; revalidate before updating this prototype.`);
const files=[];
for(const [name,expected]of Object.entries(manifest.files)){
 const source=resolve(build,name==='THREE-LICENSE.txt'?'../LICENSE':name),data=await readFile(source);
 if(createHash('sha256').update(data).digest('hex')!==expected)throw Error(`Unexpected Three.js artifact: ${name}`);
 files.push([name,data]);
}
await mkdir(resolve(root,'public/vendor'),{recursive:true});
for(const[name,data]of files)await writeFile(resolve(root,'public/vendor',name),data);
console.log(`Prepared verified Three.js ${manifest.version} and MIT license from the workspace lockfile.`);
await import('./prepare-telemetry.mjs');
