// Build from the workspace lockfile; never load Sentry from a runtime CDN.
import {createRequire} from 'node:module';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=dirname(fileURLToPath(import.meta.url));
const require=createRequire(new URL('./package.json',import.meta.url));
const packageFile=require.resolve('@sentry/browser/package.json');
const installed=JSON.parse(await readFile(packageFile,'utf8'));
const manifest=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
if(installed.version!==manifest.dependencies['@sentry/browser'])throw Error('Sentry version differs from the exact workspace pin.');
await mkdir(resolve(root,'public/vendor'),{recursive:true});
await build({entryPoints:[resolve(dirname(packageFile),installed.module)],outfile:resolve(root,'public/vendor/sentry.mjs'),
  bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,sourcemap:false,
  define:{__SENTRY_DEBUG__:'false'},legalComments:'eof'});
await copyFile(resolve(dirname(packageFile),'LICENSE'),resolve(root,'public/vendor/SENTRY-LICENSE.txt'));
console.log(`Prepared local Sentry ${installed.version} browser bundle and license.`);
