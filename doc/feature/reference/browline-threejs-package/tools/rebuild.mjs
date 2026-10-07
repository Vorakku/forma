import { build } from 'esbuild';
import { readFile,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const result=await build({entryPoints:[resolve(root,'src/viewer.js')],bundle:true,minify:true,format:'iife',write:false,legalComments:'eof'});
const reference=(await readFile(resolve(root,'reference.png'))).toString('base64');
const blueprint=(await readFile(resolve(root,'browline-blueprint.svg'))).toString('base64');
const license=await readFile(resolve(root,'THIRD-PARTY-LICENSES.txt'),'utf8');
let html=await readFile(resolve(root,'src/viewer-template.html'),'utf8');
html=html.replace('__REFERENCE__','data:image/png;base64,'+reference)
 .replace('__BLUEPRINT__','data:image/svg+xml;base64,'+blueprint)
 .replace('__BUNDLE__',()=>result.outputFiles[0].text)
 .replace('</head>','<!--\n'+license+'\n-->\n</head>');
await writeFile(resolve(root,'browline-workbench.html'),html);
console.log('Rebuilt browline-workbench.html');
