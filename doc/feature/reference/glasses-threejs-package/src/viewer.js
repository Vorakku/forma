import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createGlasses, DEFAULTS } from './glasses-model.js';

const $=s=>document.querySelector(s), host=$('#stage');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setClearColor(0xffffff);host.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label','Interactive 3D glasses model. Drag to rotate and scroll to zoom.');
const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);
const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();
const env=pmrem.fromScene(environment,0.03);scene.environment=env.texture;
environment.dispose();pmrem.dispose();
const key=new THREE.DirectionalLight(0xffffff,3.0);key.position.set(-0.15,0.28,0.18);
key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-0.23;
key.shadow.camera.right=0.23;key.shadow.camera.top=0.23;key.shadow.camera.bottom=-0.23;
key.shadow.camera.near=0.01;key.shadow.camera.far=1;key.shadow.bias=-0.00003;key.shadow.normalBias=0.00015;
scene.add(key);scene.add(new THREE.HemisphereLight(0xffffff,0x9b9fa4,0.8));
const floor=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.ShadowMaterial({opacity:0.035}));
floor.rotation.x=-Math.PI/2;floor.position.y=-0.031;floor.receiveShadow=true;scene.add(floor);
const perspective=new THREE.PerspectiveCamera(30,1,0.005,10);
const ortho=new THREE.OrthographicCamera(-0.13,0.13,0.10,-0.10,0.005,10);
let camera=perspective,controls,view='perspective',glasses,wire=false,explode=0;
let autoRotate=false,currentParameters={...DEFAULTS};
function connectControls(){
  controls?.dispose();controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=0.09;
  controls.minDistance=0.13;controls.maxDistance=1.2;
  controls.target.set(0,-0.006,-0.049);controls.update();
}
function setView(name){
  view=name;camera=name==='perspective'?perspective:ortho;
  camera.up.set(0,1,0);
  if(name==='perspective')camera.position.set(0.115,0.060,0.250);
  if(name==='front')camera.position.set(0,-0.006,0.45);
  if(name==='side')camera.position.set(0.45,-0.003,-0.05);
  if(name==='top'){camera.position.set(0,0.45,-0.050);camera.up.set(0,0,-1);}
  connectControls();
  if(name==='front')controls.target.set(0,-0.006,0);
  if(name==='side')controls.target.set(0,-0.004,-0.064);
  if(name==='top')controls.target.set(0,-0.004,-0.064);
  controls.update();floor.visible=name==='perspective';resize();
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $('#viewname').textContent=name[0].toUpperCase()+name.slice(1)+' view';
  window.__activeCamera=camera;
}
function refreshReadouts(){
  $('#width-value').textContent=currentParameters.frontWidth+' mm';
  $('#temple-value').textContent=currentParameters.templeLength+' mm';
  $('#opening-value').textContent=$('#opening').value+'°';
  $('#roughness-value').textContent=Number(currentParameters.roughness).toFixed(2);
  $('#explode-value').textContent=explode+' mm';
  let triangles=0;glasses.group.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;});
  $('#stats').textContent=Math.round(triangles).toLocaleString()+' triangles · meters · Three.js r'+THREE.REVISION;
}
function applyVisibility(){
  glasses.materials.acetate.wireframe=wire;glasses.materials.silver.wireframe=wire;
  glasses.parts.lens_L.visible=glasses.parts.lens_R.visible=$('#lenses').checked&&!wire;
  glasses.setOpen(Number($('#opening').value));glasses.setExploded(explode);
  glasses.materials.acetate.roughness=Number(currentParameters.roughness);
}
function rebuild(){
  if(glasses){scene.remove(glasses.group);glasses.dispose();}
  glasses=createGlasses(currentParameters);scene.add(glasses.group);applyVisibility();refreshReadouts();
  window.__model=glasses;window.__renderer=renderer;window.__scene=scene;
}
function resize(){
  const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  renderer.setSize(w,h);perspective.aspect=w/h;
  // Keep the whole model in view when the canvas becomes portrait-shaped.
  perspective.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(15))*Math.max(1,1.45/(w/h))));
  perspective.updateProjectionMatrix();
  let halfY=view==='front'?0.066:0.107;
  if(w/h<1.4)halfY=Math.max(halfY,0.113/(w/h));
  ortho.left=-halfY*w/h;ortho.right=halfY*w/h;ortho.top=halfY;ortho.bottom=-halfY;ortho.updateProjectionMatrix();
}
function download(blob,name){
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
window.__exportGLB=async()=>{
  // Export an assembled, unfolded copy; preserve the state being inspected.
  const angle=Number($('#opening').value),originalWire=wire;
  glasses.setOpen(90);glasses.setExploded(0);
  glasses.materials.acetate.wireframe=false;glasses.materials.silver.wireframe=false;
  glasses.parts.lens_L.visible=glasses.parts.lens_R.visible=true;
  try{return await new GLTFExporter().parseAsync(glasses.group,{binary:true,onlyVisible:true});}
  finally{wire=originalWire;glasses.setOpen(angle);glasses.setExploded(explode);applyVisibility();}
};
$('#export').onclick=async()=>{
  const b=$('#export');b.disabled=true;b.textContent='Exporting…';
  try{download(new Blob([await window.__exportGLB()],{type:'model/gltf-binary'}),'black-acetate-glasses.glb');}
  catch(e){$('#notice').textContent='Export failed: '+e.message;}
  finally{b.disabled=false;b.textContent='Export GLB';}
};
$('#capture').onclick=()=>{renderer.render(scene,camera);renderer.domElement.toBlob(b=>download(b,'glasses-'+view+'.png'));};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('#width').oninput=e=>{currentParameters.frontWidth=Number(e.target.value);rebuild();};
$('#temple').oninput=e=>{currentParameters.templeLength=Number(e.target.value);rebuild();};
$('#roughness').oninput=e=>{currentParameters.roughness=Number(e.target.value);applyVisibility();refreshReadouts();};
$('#opening').oninput=()=>{applyVisibility();refreshReadouts();};
$('#explode').oninput=e=>{explode=Number(e.target.value);applyVisibility();refreshReadouts();};
$('#lenses').onchange=applyVisibility;
$('#wire').onchange=e=>{wire=e.target.checked;applyVisibility();};
$('#rotate').onchange=e=>{autoRotate=e.target.checked;};
$('#reset').onclick=()=>{
  currentParameters={...DEFAULTS};explode=0;wire=false;autoRotate=false;
  $('#width').value=DEFAULTS.frontWidth;$('#temple').value=DEFAULTS.templeLength;
  $('#roughness').value=DEFAULTS.roughness;$('#opening').value=90;$('#explode').value=0;
  $('#lenses').checked=true;$('#wire').checked=false;$('#rotate').checked=false;
  rebuild();setView('perspective');
};
$('#blueprint-btn').onclick=()=>{$('#blueprint-modal').showModal();};
$('#close-blueprint').onclick=()=>{$('#blueprint-modal').close();};
window.addEventListener('resize',resize);
new ResizeObserver(resize).observe(host);
rebuild();setView('perspective');
let last=performance.now();
renderer.setAnimationLoop(now=>{
  const dt=Math.min((now-last)/1000,0.05);last=now;
  controls.autoRotate=autoRotate&&view==='perspective';controls.autoRotateSpeed=0.8;
  controls.update(dt);renderer.render(scene,camera);
});
window.__ready=true;
