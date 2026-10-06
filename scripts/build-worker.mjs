import {writeFile} from 'node:fs/promises';
import {buildWorker} from './worker-build.mjs';
await buildWorker('dist/server/index.js','production');
await writeFile('dist/server/package.json','{"type":"module"}\n');
console.log('Built React client + Prisma Worker backend.');
