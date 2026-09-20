// Reuse the repository's exact Three.js pin; no runtime CDN or second JS lockfile.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const require=createRequire(new URL('./package.json',import.meta.url));
let build;
try{build=dirname(require.resolve('three'));}catch{throw Error('Run pnpm install --frozen-lockfile from the repository root first.');}
const manifest=JSON.parse(await readFile(resolve(root,'three-vendor-manifest.json'),'utf8'));
const installed=JSON.parse(await readFile(resolve(build,'../package.json'),'utf8'));
if(installed.version!==manifest.version)throw Error(`Expected Three.js ${manifest.version}; revalidate before updating WebXR.`);
const files=[];
for(const [name,expected]of Object.entries(manifest.files)){
 const source=resolve(build,name==='THREE-LICENSE.txt'?'../LICENSE':name),data=await readFile(source);
 if(createHash('sha256').update(data).digest('hex')!==expected)throw Error(`Unexpected Three.js artifact: ${name}`);
 files.push([name,data]);
}
await mkdir(resolve(root,'public/vendor'),{recursive:true});
for(const[name,data]of files)await writeFile(resolve(root,'public/vendor',name),data);
console.log(`Prepared verified Three.js ${manifest.version} and MIT license from the workspace lockfile.`);

for(const [name,expected] of Object.entries(manifest.addons||{})){
 const data=await readFile(resolve(build,'../examples/jsm',name));
 if(createHash('sha256').update(data).digest('hex')!==expected)throw Error(`Unexpected Three.js addon: ${name}`);
 const code=data.toString().replaceAll("from 'three'","from '/vendor/three.module.js'").replaceAll("from '../utils/","from './");
 await writeFile(resolve(root,'public/vendor',name.split('/').at(-1)),code);
}
const handManifest=JSON.parse(await readFile(resolve(root,'public/assets/hands/provenance.json'),'utf8'));
for(const [name,expected] of Object.entries(handManifest.sha256)){
 const data=await readFile(resolve(root,'public/assets/hands',name));
 if(createHash('sha256').update(data).digest('hex')!==expected)throw Error(`Unexpected hand asset: ${name}`);
}

// The coach runtime is bundled from apps/web so the tutor and the desktop share one implementation.
const coach=resolve(root,'public/vendor/trail-coach.js');
if(process.env.TRAIL_REBUILD_COACH==='1'||!(await readFile(coach).then(()=>true,()=>false))){
 const {execFileSync}=await import('node:child_process');
 // The bundle imports the shared contracts, so build those first. Hand guidance does not need the coach; a failed bundle must not stop the tutor.
 try{
  execFileSync('pnpm',['build:shared'],{cwd:resolve(root,'../..'),stdio:'inherit'});
  execFileSync('pnpm',['--filter','@trail/web','build:tutor-coach'],{cwd:resolve(root,'../..'),stdio:'inherit'});
 }catch(error){
  console.warn(`Coach bundle not built (${error.message.split('\n')[0]}). Hand guidance works without it; run pnpm --filter @trail/web build:tutor-coach to enable the voice coach.`);
 }
}
console.log(await readFile(coach).then(()=>'Coach bundle ready at public/vendor/trail-coach.js.',()=>'Coach bundle absent; the voice coach card will report it.'));
