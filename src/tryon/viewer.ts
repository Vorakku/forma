import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {disposeObject} from './resources';

// Studio values match the reference workbench (doc/feature/reference/glasses-threejs-package/src/viewer.js), in cm.
export const VIEWER_FOV=30,VIEWER_FIT_MARGIN=1.2,VIEWER_MAX_PIXEL_RATIO=2;
export const VIEWER_DAMPING=.08,VIEWER_ROTATION_STEP=Math.PI/12,VIEWER_ZOOM_STEP=.8;
const DIRECTIONS={perspective:new THREE.Vector3(.115,.066,.299),front:new THREE.Vector3(0,.03,1),side:new THREE.Vector3(1,.12,0),top:new THREE.Vector3(0,1,.02)};
export type ObjectView=keyof typeof DIRECTIONS;
export type ObjectViewer={setObject:(object:THREE.Group)=>void;setView:(view:ObjectView)=>void;focus:(name:string)=>void;rotate:(horizontal:number,vertical:number)=>void;zoom:(closer:boolean)=>void;reset:()=>void;dispose:()=>void};

// Fit a bounding sphere to the narrower of the vertical and horizontal view.
export function fitDistance(radius:number,aspect:number,fov=VIEWER_FOV){
 const vertical=fov*Math.PI/360,horizontal=Math.atan(Math.tan(vertical)*aspect);
 return radius/Math.sin(Math.min(vertical,horizontal))*VIEWER_FIT_MARGIN;
}
export function createObjectViewer({canvas,onError}:{canvas:HTMLCanvasElement;onError?:(message:string)=>void}):ObjectViewer{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(VIEWER_FOV,1,.1,1000);
 let renderer:THREE.WebGLRenderer|undefined,controls:OrbitControls|undefined,environment:THREE.WebGLRenderTarget|undefined,observer:ResizeObserver|undefined;
 let current:THREE.Group|null=null,radius=10,distance=40,frame:number|undefined,stopped=false;
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const dispose=()=>{
  if(stopped)return;stopped=true;if(frame!==undefined)cancelAnimationFrame(frame);
  observer?.disconnect();document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',motionChanged);canvas.removeEventListener('webglcontextlost',contextLost);
  controls?.removeEventListener('change',invalidate);controls?.dispose();scene.traverse(node=>{if(node instanceof THREE.DirectionalLight)node.shadow.dispose()});disposeObject(scene);scene.clear();environment?.dispose();renderer?.clear();renderer?.dispose();current=null;
 };
 const fail=()=>{dispose();onError?.('The 3D view is unavailable. You can still explore the photos or try loading it again.')};
 const render=()=>{frame=undefined;if(stopped||document.hidden)return;try{controls!.update();renderer!.render(scene,camera)}catch{fail()}};
 function invalidate(){if(!stopped&&!document.hidden&&frame===undefined)frame=requestAnimationFrame(render)}
 function visibility(){if(document.hidden){if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined}else invalidate()}
 function motionChanged(){if(controls)controls.enableDamping=!motion.matches;invalidate()}
 function contextLost(event:Event){event.preventDefault();fail()}
 const flush=()=>{const damping=controls!.enableDamping;controls!.enableDamping=false;controls!.update();return damping};
 const place=(target:THREE.Vector3,direction:THREE.Vector3,length:number)=>{
  if(stopped)return;const damping=flush();controls!.target.copy(target);camera.position.copy(target).addScaledVector(direction.clone().normalize(),length);camera.lookAt(target);controls!.update();controls!.enableDamping=damping;invalidate();
 };
 const resize=()=>{
  if(stopped||!renderer)return;const width=Math.max(canvas.clientWidth,1),height=Math.max(canvas.clientHeight,1),previous=distance;
  camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,VIEWER_MAX_PIXEL_RATIO));renderer.setSize(width,height,false);
  distance=fitDistance(radius,camera.aspect);if(controls){controls.maxDistance=distance*2.5;const offset=camera.position.clone().sub(controls.target);place(controls.target.clone(),offset,THREE.MathUtils.clamp(offset.length()*distance/previous,controls.minDistance,controls.maxDistance))}
  invalidate();
 };
 try{
  renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;renderer.setClearColor(0x000000,0);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer);
  try{environment=generator.fromScene(room,.03);scene.environment=environment.texture}finally{room.dispose();generator.dispose()}
  scene.add(new THREE.HemisphereLight(0xffffff,0x9b9fa4,.8));
  const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-15,28,18);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=key.shadow.camera.bottom=-23;key.shadow.camera.right=key.shadow.camera.top=23;key.shadow.bias=-.001;key.shadow.normalBias=.05;scene.add(key);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.035}));floor.name='floor';floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  controls=new OrbitControls(camera,canvas);controls.cursorStyle='grab';controls.enablePan=false;controls.enableDamping=!motion.matches;controls.dampingFactor=VIEWER_DAMPING;controls.rotateSpeed=.7;controls.zoomSpeed=.8;controls.minPolarAngle=.02;controls.maxPolarAngle=Math.PI-.02;
  controls.addEventListener('change',invalidate);canvas.addEventListener('webglcontextlost',contextLost);document.addEventListener('visibilitychange',visibility);motion.addEventListener('change',motionChanged);
  observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  return{
   setObject(object){
    if(stopped){disposeObject(object);return}if(object===current)return;
    const first=!current,box=new THREE.Box3().setFromObject(object),centre=box.getCenter(new THREE.Vector3()),sphere=box.getBoundingSphere(new THREE.Sphere());
    if(box.isEmpty()||!Number.isFinite(sphere.radius)||sphere.radius<=0){disposeObject(object);throw new Error('This object has no displayable geometry.')}
    if(current)disposeObject(current);current=object;object.position.sub(centre);scene.add(object);
    object.traverse(node=>{if(node instanceof THREE.Mesh){node.castShadow=!((node.material as THREE.Material).transparent);node.receiveShadow=false}});
    radius=sphere.radius;distance=fitDistance(radius,camera.aspect);controls!.minDistance=radius*.18;controls!.maxDistance=distance*2.5;
    floor.position.y=box.min.y-centre.y-.25;
    if(first)place(new THREE.Vector3(),DIRECTIONS.perspective,distance);else invalidate();
   },
   setView(view){place(new THREE.Vector3(),DIRECTIONS[view],distance)},
   focus(name){if(stopped)return;const target=current?.getObjectByName(name);if(target)place(target.getWorldPosition(new THREE.Vector3()),new THREE.Vector3(1,.55,1.2),radius*.48)},
   rotate(horizontal,vertical){if(stopped)return;const offset=camera.position.clone().sub(controls!.target),spherical=new THREE.Spherical().setFromVector3(offset);spherical.theta+=horizontal;spherical.phi=THREE.MathUtils.clamp(spherical.phi+vertical,.02,Math.PI-.02);place(controls!.target.clone(),new THREE.Vector3().setFromSpherical(spherical),offset.length())},
   zoom(closer){if(stopped)return;const offset=camera.position.clone().sub(controls!.target),length=THREE.MathUtils.clamp(offset.length()*(closer?VIEWER_ZOOM_STEP:1/VIEWER_ZOOM_STEP),controls!.minDistance,controls!.maxDistance);place(controls!.target.clone(),offset,length)},
   reset(){place(new THREE.Vector3(),DIRECTIONS.perspective,distance)},
   dispose
  };
 }catch(error){dispose();throw error}
}
