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
// The coach runtime is bundled from apps/web so the tutor and the desktop share one implementation.
const coach=resolve(root,'public/vendor/trail-coach.js');
if(process.env.TRAIL_REBUILD_COACH==='1'||!(await readFile(coach).then(()=>true,()=>false))){
 const {execFileSync}=await import('node:child_process');
 execFileSync('pnpm',['--filter','@trail/web','build:tutor-coach'],{cwd:resolve(root,'../..'),stdio:'inherit'});
}
console.log('Coach bundle ready at public/vendor/trail-coach.js.');
