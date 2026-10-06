import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { catalog, sampleReviewers, sampleReviews } from './catalog';
import { lensPrice } from '../src/lib/rules';
export type Env={DB:D1Database;ASSETS?:Fetcher;APP_MODE?:string};
// Workers isolate I/O by request; sharing a client also shares request-bound promises.
export function database(env:Env){return new PrismaClient({adapter:new PrismaD1(env.DB)})}
export async function seedCatalog(env:Env){
 if(await env.DB.prepare('SELECT 1 FROM "Product" LIMIT 1').first())return;
 const avg=sampleReviews.reduce((s,r)=>s+r.rating,0)/sampleReviews.length;
 await env.DB.batch([
  ...catalog.map(p=>env.DB.prepare('INSERT OR IGNORE INTO "Product" ("id","name","category","brand","description","price","originalPrice","stock","sold","rating","image","images","sizes","colors","swatches","shape","material","dimensions","weight","rank","tag","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(p.id,p.name,p.category,'FORMA',p.description,p.price,p.originalPrice,p.stock,0,avg,p.image,p.images,p.sizes,p.colors,p.swatches,p.shape,p.material,p.dimensions,p.weight,p.rank,p.tag,p.createdAt)),
  ...sampleReviewers.map(r=>env.DB.prepare('INSERT OR IGNORE INTO "User" ("id","email","name","guest") VALUES (?,?,?,0)').bind(r.id,r.id+'@samples.forma.local',r.name)),
  ...catalog.flatMap(p=>sampleReviews.map((r,i)=>env.DB.prepare('INSERT OR IGNORE INTO "Review" ("id","userId","productId","rating","title","text","author","sample","createdAt") VALUES (?,?,?,?,?,?,?,1,?)').bind(`seed-${p.id}-${i}`,sampleReviewers[i].id,p.id,r.rating,r.title,r.text,sampleReviewers[i].name,new Date(Date.UTC(2026,8,20-i*5)).toISOString())))
 ]);
}
export const parse=(value:string|null|undefined,fallback:unknown=[]):any=>{try{return JSON.parse(value??'')}catch{return fallback}};
export const product=(p:any)=>({...p,images:parse(p.images),sizes:parse(p.sizes),colors:parse(p.colors),swatches:parse(p.swatches),reviewCount:p._count?.reviews??0,_count:undefined});
export const cartLine=(l:any)=>({...l,prescription:parse(l.prescription,null),unitPrice:l.product.price+lensPrice(l.product.category,l.lens,l.coating),product:product(l.product)});
export const order=(o:any)=>({...o,userId:undefined,cartVersion:undefined,idempotencyKey:undefined,items:parse(o.items),address:parse(o.address,{}),events:parse(o.events)});
export function publicUser(u:any){const {passwordHash,cartVersion,createdAt,...rest}=u;return rest}
