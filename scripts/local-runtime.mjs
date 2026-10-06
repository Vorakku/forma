import {Miniflare} from 'miniflare';
import {buildWorker} from './worker-build.mjs';
import {readFile,readdir,mkdir} from 'node:fs/promises';
export async function createRuntime({persist=true}={}){
 await mkdir('.sites-runtime',{recursive:true});
 await buildWorker('.sites-runtime/worker.mjs');
 const mf=new Miniflare({modules:true,modulesRules:[{type:'CompiledWasm',include:['**/*.wasm'],fallthrough:true}],scriptPath:'.sites-runtime/worker.mjs',compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'forma-db'},d1Persist:persist?'.sites-data/d1':false});
 const db=await mf.getD1Database('DB');
 await db.prepare('CREATE TABLE IF NOT EXISTS "__forma_migrations" ("name" TEXT PRIMARY KEY)').run();
 for(const name of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
  const exists=await db.prepare('SELECT name FROM "__forma_migrations" WHERE name=?').bind(name).first();
  if(!exists){const sql=await readFile('drizzle/'+name,'utf8');const parts=sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);await db.batch([...parts.map(s=>db.prepare(s)),db.prepare('INSERT INTO "__forma_migrations" VALUES (?)').bind(name)]);}
 }
 return mf;
}
