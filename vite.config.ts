import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { createRuntime } from './scripts/local-runtime.mjs';
export default defineConfig({plugins:[react(),tailwindcss(),{name:'forma-api',async configureServer(server){
 const runtime=await createRuntime();
 server.httpServer?.once('close',()=>runtime.dispose());
 server.middlewares.use(async(req,res,next)=>{
  if(!req.url?.startsWith('/api/'))return next();
  try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks);const headers=new Headers();for(const[k,v]of Object.entries(req.headers)){if(v)headers.set(k,Array.isArray(v)?v.join(','):v)}const url='http://'+(req.headers.host??'localhost:4174')+req.url;const result=await runtime.dispatchFetch(url,{method:req.method,headers,body:body.length?body:undefined});res.statusCode=result.status;result.headers.forEach((v:string,k:string)=>res.setHeader(k,v));res.end(Buffer.from(await result.arrayBuffer()));}catch(e){console.error(e);res.statusCode=500;res.end(JSON.stringify({error:'The local API is unavailable.'}))}
 });
}}],resolve:{alias:{'@':resolve(import.meta.dirname,'src')}},build:{outDir:'dist/client',emptyOutDir:true},server:{host:'0.0.0.0',port:4174,strictPort:true,allowedHosts:['localhost'],watch:{ignored:['**/.sites-data/**','**/.sites-runtime/**']}},preview:{host:'0.0.0.0',port:4174}});
