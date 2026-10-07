import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
import WebSocket from 'ws';
import assert from 'node:assert/strict';

// Run with the dev server on :4175. Chrome's fake camera loops the still hero face.
const label=process.argv[2]??'after',runtime=resolve('.sites-runtime/tryon-visual'),output=resolve(process.argv[3]??'doc/feature/phase-1.6'),fixture=process.argv[4]??'neutral';
await mkdir(runtime,{recursive:true});await mkdir(output,{recursive:true});
let source=sharp('public/images/hero.webp');
if(fixture==='bright')source=source.linear(1.2);
if(fixture==='dim')source=source.linear(.45);
if(fixture==='warm')source=source.linear([1,.85,.6],[0,0,0]);
if(fixture==='cool')source=source.linear([.7,.85,1],[0,0,0]);
if(fixture==='left'||fixture==='right'){
 const {data,info}=await source.removeAlpha().raw().toBuffer({resolveWithObject:true});
 // The test face is on camera right (display left). Split lighting through its centre.
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const gain=(x<info.width*.8)===(fixture==='left')?1:.35;for(let c=0;c<3;c++)data[(y*info.width+x)*3+c]*=gain}
 source=sharp(data,{raw:{width:info.width,height:info.height,channels:3}});
}
const jpeg=await source.jpeg({quality:95}).toBuffer(),capture=resolve(runtime,'face-'+Date.now()+'.mjpeg');
await writeFile(capture,Buffer.concat(Array.from({length:120},()=>jpeg)));
const chrome=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=9335','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-video-capture='+capture,'--user-data-dir='+resolve(runtime,'chrome-profile'),'--enable-unsafe-swiftshader','about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
let chromeLog='';chrome.stderr.on('data',data=>{chromeLog+=String(data)});
let socket,closeBrowser;
try{
 let tabs;
 for(let i=0;i<100;i++){try{tabs=await(await fetch('http://localhost:9335/json')).json();if(tabs.length)break}catch{}await new Promise(r=>setTimeout(r,100))}
 if(!tabs?.length)throw Error('Chrome did not start: '+chromeLog);
 socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((yes,no)=>{socket.addEventListener('open',yes,{once:true});socket.addEventListener('error',no,{once:true})});
 let id=0;const pending=new Map(),exceptions=[],diagnostics=[],scripts=new Set();
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}else if(m.method==='Debugger.scriptParsed')scripts.add(m.params.url);else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')diagnostics.push(m.params.entry);else if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))diagnostics.push(m.params.args.map(a=>a.value??a.description))});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('DevTools timed out: '+method)),30000);pending.set(++id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id,method,params}))});
 closeBrowser=()=>send('Browser.close');
 const evaluate=async expression=>(await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;
 await send('Runtime.enable');await send('Log.enable');await send('Debugger.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://localhost:4175/try-on?product=the-ellis'});
 for(let i=0;i<100;i++){if(await evaluate("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start camera')"))break;await new Promise(r=>setTimeout(r,100))}
 if(label==='after'){
  // Test-only inspection of the actual Three scenes, without adding a debug API to the app.
  const threeUrl=[...scripts].find(url=>/\/\.vite\/deps\/three\.js\?/.test(url));assert.ok(threeUrl,'Three runtime must be loaded by the lazy route');
  await evaluate(`(async()=>{const THREE=await import(${JSON.stringify(threeUrl)}),update=THREE.Object3D.prototype.updateMatrixWorld;window.tryonTestScenes=new Set();THREE.Object3D.prototype.updateMatrixWorld=function(force){if(this.isScene)window.tryonTestScenes.add(this);return update.call(this,force)}})()`);
 }
 await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start camera').click()");
 let status;
 for(let i=0;i<200;i++){status=await evaluate("document.querySelector('.tryon-status')?.textContent");if(status?.startsWith('Tracking'))break;if(/could not|denied|stopped|cannot/.test(status??''))throw Error(status);await new Promise(r=>setTimeout(r,100))}
 if(!status?.startsWith('Tracking'))throw Error('No face tracked: '+status);
 await new Promise(r=>setTimeout(r,1000));
 const screenshot=async(name,clip)=>{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,...(clip?{clip}: {})});const bytes=Buffer.from(shot.data,'base64');if(fixture==='neutral'||[label,'after-stage','raw-camera'].includes(name))await writeFile(resolve(output,name+'.png'),bytes);return bytes};
 await screenshot(label);
 const report={label,fixture,status,exceptions,diagnostics,stage:await evaluate("(()=>{const v=document.querySelector('video'),c=document.querySelector('.tryon-stage canvas');return{video:[v.videoWidth,v.videoHeight],canvas:[c.width,c.height],mirror:getComputedStyle(c).transform,hiddenSource:getComputedStyle(v).opacity==='0'&&getComputedStyle(v).display!=='none'}})()")};
 if(label==='after'){
  report.rendering=await evaluate("(()=>{const scenes=[...window.tryonTestScenes],scene=scenes.find(s=>s.getObjectByName('face.noseBridge')),pass=scenes.flatMap(s=>s.children).find(n=>n.material?.uniforms?.layer)?.material,key=scene.children.find(n=>n.isDirectionalLight),ambient=scene.children.find(n=>n.isHemisphereLight),shadow=scene.children.find(n=>n.material?.isShadowMaterial),materials=new Set();scene.traverse(n=>{if(n.isMesh&&n.material.isMeshPhysicalMaterial&&n.material.transparent)materials.add(n.material)});return{lightCount:scene.children.filter(n=>n.isLight).length,ambientIntensity:ambient.intensity,ambientColor:ambient.color.toArray(),keyIntensity:key.intensity,keyOffset:key.position.clone().sub(key.target.position).toArray(),shadowOpacity:shadow.material.opacity,environmentIntensity:scene.environmentIntensity,lenses:[...materials].map(m=>({opacity:m.opacity,clearcoat:m.clearcoat})),pass:{blur:pass.uniforms.blur.value,grain:pass.uniforms.grain.value,seed:pass.uniforms.seed.value,contrast:pass.uniforms.contrast.value,saturation:pass.uniforms.saturation.value,premultipliedAlpha:pass.premultipliedAlpha,layerSize:[pass.uniforms.layer.value.image.width,pass.uniforms.layer.value.image.height]}}})()");
  assert.equal(report.rendering.lightCount,2,'reuse the existing two lights');assert.ok(report.rendering.keyOffset[1]>0,'key remains above the face');assert.deepEqual(report.rendering.pass.layerSize,report.stage.video);assert.ok(report.rendering.lenses.every(m=>m.opacity<=.06),'clear lenses cannot become milky');
  // Native camera pixels avoid differences from the browser's video and canvas CSS resamplers.
  await evaluate("document.querySelector('.tryon-stage').style.cssText='position:fixed;left:0;top:0;width:1280px;height:720px;border:0;border-radius:0;z-index:1000'");
  const clip=await evaluate("(()=>{const r=document.querySelector('.tryon-stage').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()");
  const canvasShot=await screenshot('after-stage',clip);
  // Compare the rendered camera with a plain, equally sized and mirrored video, outside the overlay.
  await evaluate("document.querySelector('.tryon-stage canvas').style.visibility='hidden';document.querySelector('video').style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:1;transform:scaleX(-1)'");
  const rawShot=await screenshot('raw-camera',clip);
  const a=await sharp(canvasShot).removeAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(rawShot).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual(a.info,b.info);
  let sum=0,max=0,count=0;
  for(let y=2;y<a.info.height-2;y++)for(let x=Math.ceil(a.info.width*.7);x<a.info.width-2;x++)for(let c=0;c<3;c++){const i=(y*a.info.width+x)*3+c,d=Math.abs(a.data[i]-b.data[i]);sum+=d;max=Math.max(max,d);count++}
  report.cameraColour={meanAbsoluteChannelDifference:sum/count,maxChannelDifference:max,region:'right 30% outside the frame/shadow at native resolution, 8-bit RGB'};assert.ok(sum/count<.5&&max<=3,'camera colour must match the raw video');
  await evaluate("document.querySelector('.tryon-stage canvas').style.removeProperty('visibility');document.querySelector('video').style.cssText=''");
  const difference=async(a,b)=>{const first=await sharp(a).removeAlpha().raw().toBuffer(),second=await sharp(b).removeAlpha().raw().toBuffer();let sum=0;for(let i=0;i<first.length;i++)sum+=Math.abs(first[i]-second[i]);return sum/first.length};
  const movingA=await screenshot('grain-moving-a',clip);await new Promise(r=>setTimeout(r,200));const movingB=await screenshot('grain-moving-b',clip);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await new Promise(r=>setTimeout(r,1000));
  const staticA=await screenshot('grain-static-a',clip);await new Promise(r=>setTimeout(r,200));const staticB=await screenshot('grain-static-b',clip);
  report.grain={animatedDifference:await difference(movingA,movingB),reducedMotionDifference:await difference(staticA,staticB),staticSeed:await evaluate("[...window.tryonTestScenes].flatMap(s=>s.children).find(n=>n.material?.uniforms?.layer).material.uniforms.seed.value")};assert.equal(report.grain.staticSeed,0);assert.ok(report.grain.animatedDifference>report.grain.reducedMotionDifference,'reduced-motion grain must stay static');
  await evaluate("document.querySelector('.tryon-stage').style.cssText=''");
  await evaluate("Array.from(document.querySelectorAll('.tryon-frame')).find(b=>b.textContent==='The Margot').click()");await new Promise(r=>setTimeout(r,500));await screenshot('generated-frame');
  await evaluate("Array.from(document.querySelectorAll('.tryon-frame')).find(b=>b.textContent==='The Ellis').click()");await new Promise(r=>setTimeout(r,500));
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,300));
  report.mobile=await evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,stageAspect:document.querySelector('.tryon-stage canvas').getBoundingClientRect().width/document.querySelector('.tryon-stage canvas').getBoundingClientRect().height,videoAspect:document.querySelector('video').videoWidth/document.querySelector('video').videoHeight,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches})");assert.ok(report.mobile.scrollWidth<=375,'no horizontal scroll at 375px');await screenshot('mobile');
  report.release=await evaluate("(()=>{const video=document.querySelector('video'),tracks=video.srcObject.getTracks();Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Stop camera').click();return{tracks:tracks.map(t=>t.readyState),sourceReleased:video.srcObject===null}})()");assert.ok(report.release.sourceReleased&&report.release.tracks.every(s=>s==='ended'));
 }
 assert.equal(exceptions.length,0,'no uncaught browser exceptions');await writeFile(resolve(output,label+'-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(socket?.readyState===WebSocket.OPEN)await closeBrowser?.().catch(()=>{});socket?.close();chrome.kill()}
