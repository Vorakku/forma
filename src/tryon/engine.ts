import * as THREE from 'three';
import {FaceLandmarker,type NormalizedLandmark} from '@mediapipe/tasks-vision';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import {OneEuroFilter} from './filter';
import {createFaceGeometry,updateFaceGeometry} from './face-mesh';
import * as LIGHT from './lighting';
import {createCameraPass,CAMERA_MSAA_SAMPLES,CAMERA_GRAIN,GRAIN_DARK_MAX} from './camera-match';
import {disposeObject} from './resources';
export {disposeObject} from './resources';

export const FACE_MODEL_URL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// Typical webcam/phone front camera, diagonal. Vertical FOV follows the video shape (landscape ≈41°, 4:3 ≈49°, portrait phone ≈68°).
// MediaPipe assumes 63° vertical, which places faces too close and over-converges the arms; pin() keeps the overlay locked regardless.
export const CAMERA_DIAGONAL_FOV=75;
export const verticalFov=(width:number,height:number)=>2*Math.atan(Math.tan(CAMERA_DIAGONAL_FOV*Math.PI/360)*height/Math.hypot(width,height))*180/Math.PI;
export const NOSE_BRIDGE_POSITION={x:0,y:3.27,z:5.24};
// Canonical-model outer eye corners (landmarks 33 and 263), used with landmark 168 to pin the pose.
export const EYE_CORNERS=[{index:33,x:-4.45,y:2.66,z:3.17},{index:263,x:4.45,y:2.66,z:3.17}] as const;
const BRIDGE_LANDMARK=168;
const PIN_PASSES=3; // each pass refines depth (perspective makes one pass undershoot); 3 lands within millimetres
export const ANCHOR_OFFSET={x:0,y:-.3,z:1.0};
// Back of the head/ears only: the live mesh owns the nose, cheeks and face edge.
export const OCCLUDER_SIZE={x:15,y:19,z:16};
export const OCCLUDER_POSITION={x:0,y:1,z:-5};
export const OCCLUDER_DEBUG_OPACITY=.25;
export const FACE_SHADOW_OPACITY=.25;
export const SHADOW_LIGHT_POSITION={x:-3,y:12,z:45}; // camera-relative offset from the tracked face, cm
export const SHADOW_MAP_SIZE=1024;
export const SHADOW_MAP_SIZE_MOBILE=512;
export const SHADOW_MOBILE_MAX_WIDTH=760;
export const SHADOW_CAMERA_EXTENT=12;
export const SHADOW_CAMERA_NEAR=1;
export const SHADOW_CAMERA_FAR=80;
export const SHADOW_NORMAL_BIAS=.03;
export const SHADOW_BIAS=-.0001;
export const SHADOW_RADIUS=4;
// Frames face the camera head-on, so the room reflection lands evenly on the front and greys black acetate; keep it low for gloss, not haze.
export const ENVIRONMENT_INTENSITY=.35;
export type FaceStatus='loading'|'tracking'|'no-face'|'error';
export type FaceErrorCode='unsupported'|'camera-denied'|'camera-missing'|'camera-busy'|'model'|'tracking';
export class FaceEngineError extends Error{constructor(public code:FaceErrorCode,message:string){super(message);this.name='FaceEngineError'}}
export type FaceEngine={setObject:(object:THREE.Group|null)=>void;onStatus:(callback:(status:FaceStatus,error?:FaceEngineError)=>void)=>()=>void;dispose:()=>void};
type Options={video:HTMLVideoElement;canvas:HTMLCanvasElement;signal?:AbortSignal;debug?:boolean;onStatus?:(status:FaceStatus,error?:FaceEngineError)=>void};

const aborted=()=>new DOMException('Startup cancelled.','AbortError');
// Permission prompts and model creation cannot be cancelled. Release late results.
function cancellable<T>(pending:Promise<T>,signal:AbortSignal|undefined,release:(value:T)=>void=()=>{}){
 return new Promise<T>((resolve,reject)=>{
  const cancel=()=>reject(aborted());
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)cancel();
  pending.then(value=>{signal?.removeEventListener('abort',cancel);if(signal?.aborted){release(value);reject(aborted())}else resolve(value)},error=>{signal?.removeEventListener('abort',cancel);reject(error)});
 });
}
function cameraError(error:unknown){
 const name=error instanceof Error?error.name:'';
 if(name==='NotAllowedError'||name==='SecurityError')return new FaceEngineError('camera-denied','Camera permission was denied. Allow camera access in your browser, then try again.');
 if(name==='NotFoundError'||name==='OverconstrainedError')return new FaceEngineError('camera-missing','No camera found. Connect a camera, then try again.');
 return new FaceEngineError('camera-busy','The camera could not start. Close other apps using it, then try again.');
}

export async function createFaceEngine({video,canvas,signal,debug=false,onStatus}:Options):Promise<FaceEngine>{
 if(signal?.aborted)throw aborted();
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new FaceEngineError('unsupported','This browser cannot use the camera here. Open in a browser with camera support on HTTPS or localhost.');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(verticalFov(16,9),16/9,1,10000),face=new THREE.Group(),anchor=new THREE.Group();
 // VideoTexture marks new frames as dirty; only tick() uploads and draws them, after detection.
 const videoTexture=new THREE.VideoTexture(video);videoTexture.colorSpace=THREE.SRGBColorSpace;
 const background=new THREE.Scene(),backgroundCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 const videoQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:videoTexture,toneMapped:false,depthWrite:false,depthTest:false}));videoQuad.position.z=-.5;background.add(videoQuad);
 const composite=new THREE.Scene(),cameraPass=createCameraPass();composite.add(cameraPass);
 const sampleCanvas=document.createElement('canvas');sampleCanvas.width=LIGHT.LIGHT_SAMPLE_WIDTH;sampleCanvas.height=LIGHT.LIGHT_SAMPLE_HEIGHT;
 const sampleContext=sampleCanvas.getContext('2d',{willReadFrequently:true}),estimator=new LIGHT.LightEstimator(),lensMaterials=new Map<THREE.MeshPhysicalMaterial,number>();
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');let reducedMotion=motion.matches;
 const motionChanged=()=>{reducedMotion=motion.matches};motion.addEventListener('change',motionChanged);
 face.matrixAutoUpdate=false;face.visible=false;scene.add(face);face.add(anchor);
 anchor.name='face.noseBridge';anchor.position.set(NOSE_BRIDGE_POSITION.x+ANCHOR_OFFSET.x,NOSE_BRIDGE_POSITION.y+ANCHOR_OFFSET.y,NOSE_BRIDGE_POSITION.z+ANCHOR_OFFSET.z);anchor.renderOrder=1;
 const occluderGeometry=new THREE.SphereGeometry(1,32,24),occluderMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true});
 const occluder=new THREE.Mesh(occluderGeometry,occluderMaterial);
 occluder.scale.set(OCCLUDER_SIZE.x/2,OCCLUDER_SIZE.y/2,OCCLUDER_SIZE.z/2);occluder.position.set(OCCLUDER_POSITION.x,OCCLUDER_POSITION.y,OCCLUDER_POSITION.z);occluder.renderOrder=-1;face.add(occluder);
 if(debug){const view=new THREE.Mesh(occluderGeometry,new THREE.MeshBasicMaterial({color:0x6f9fa4,transparent:true,opacity:OCCLUDER_DEBUG_OPACITY,depthWrite:false}));view.position.copy(occluder.position);view.scale.copy(occluder.scale);view.renderOrder=2;face.add(view)}
 const faceGeometry=createFaceGeometry(),faceDepth=new THREE.Mesh(faceGeometry,new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide})),faceShadow=new THREE.Mesh(faceGeometry,new THREE.ShadowMaterial({opacity:FACE_SHADOW_OPACITY,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
 faceDepth.renderOrder=-2;faceShadow.renderOrder=-1;faceShadow.receiveShadow=true;
 faceDepth.visible=faceShadow.visible=false;faceDepth.frustumCulled=faceShadow.frustumCulled=false;scene.add(faceDepth,faceShadow);
 // Keep the reference light balance as the neutral baseline; video estimates adjust the existing lights.
 const ambientLight=new THREE.HemisphereLight(0xffffff,0x9b9fa4,LIGHT.LIGHT_AMBIENT_INTENSITY),light=new THREE.DirectionalLight(0xffffff,LIGHT.LIGHT_KEY_INTENSITY);light.castShadow=true;scene.add(ambientLight,light,light.target);
 const shadowMapSize=window.innerWidth<=SHADOW_MOBILE_MAX_WIDTH?SHADOW_MAP_SIZE_MOBILE:SHADOW_MAP_SIZE;
 const shadowLightOffset=new THREE.Vector3(SHADOW_LIGHT_POSITION.x,SHADOW_LIGHT_POSITION.y,SHADOW_LIGHT_POSITION.z);
 light.shadow.mapSize.set(shadowMapSize,shadowMapSize);Object.assign(light.shadow.camera,{left:-SHADOW_CAMERA_EXTENT,right:SHADOW_CAMERA_EXTENT,top:SHADOW_CAMERA_EXTENT,bottom:-SHADOW_CAMERA_EXTENT,near:SHADOW_CAMERA_NEAR,far:SHADOW_CAMERA_FAR});light.shadow.camera.updateProjectionMatrix();light.shadow.normalBias=SHADOW_NORMAL_BIAS;light.shadow.bias=SHADOW_BIAS;light.shadow.radius=SHADOW_RADIUS;
 let renderer:THREE.WebGLRenderer|undefined,tracker:FaceLandmarker|undefined,stream:MediaStream|undefined,object:THREE.Group|null=null,layerTarget:THREE.WebGLRenderTarget|undefined;
 let stopped=false,frameId:number|undefined,animationId:number|undefined,lastVideoTime=-1,hasPose=false,lightFrame=0;
 let settings=LIGHT.lightSettings(estimator.current);
 let status:FaceStatus='loading',failure:FaceEngineError|undefined;
 const listeners=new Set<(status:FaceStatus,error?:FaceEngineError)=>void>();if(onStatus)listeners.add(onStatus);
 const emit=(next:FaceStatus,error?:FaceEngineError)=>{if(status===next&&failure===error)return;status=next;failure=error;listeners.forEach(cb=>cb(status,failure))};
 const stopTracks=(value:MediaStream)=>value.getTracks().forEach(track=>track.stop());
 const dispose=()=>{
  if(stopped)return;stopped=true;
  signal?.removeEventListener('abort',dispose);canvas.removeEventListener('webglcontextlost',contextLost);video.removeEventListener('resize',resize);
  motion.removeEventListener('change',motionChanged);
  if(frameId!==undefined)video.cancelVideoFrameCallback(frameId);if(animationId!==undefined)cancelAnimationFrame(animationId);
  stream?.getTracks().forEach(track=>track.removeEventListener('ended',cameraEnded));if(stream)stopTracks(stream);
  if(stream&&video.srcObject===stream){video.pause();video.srcObject=null}
  // dispose releases GPU resources while keeping this canvas reusable on restart.
  tracker?.close();renderer?.setRenderTarget(null);layerTarget?.dispose();light.shadow.dispose();scene.environment?.dispose();disposeObject(composite);disposeObject(background);disposeObject(scene);lensMaterials.clear();sampleCanvas.width=sampleCanvas.height=0;renderer?.clear();renderer?.dispose();listeners.clear();
 };
 const fail=(error:FaceEngineError)=>{emit('error',error);dispose()};
 const contextLost=(event:Event)=>{event.preventDefault();fail(new FaceEngineError('unsupported','The 3D view is unavailable. Restart the camera or try another browser.'))};
 const cameraEnded=()=>fail(new FaceEngineError('camera-busy','The camera disconnected. Reconnect it, then try again.'));
 const resize=()=>{
  if(!renderer||!video.videoWidth||!video.videoHeight)return;
  camera.aspect=video.videoWidth/video.videoHeight;camera.fov=verticalFov(video.videoWidth,video.videoHeight);camera.updateProjectionMatrix();renderer.setSize(video.videoWidth,video.videoHeight,false);canvas.style.aspectRatio=String(camera.aspect);
  if(layerTarget?.width!==video.videoWidth||layerTarget?.height!==video.videoHeight){layerTarget?.dispose();layerTarget=new THREE.WebGLRenderTarget(video.videoWidth,video.videoHeight,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,samples:CAMERA_MSAA_SAMPLES});cameraPass.material.uniforms.layer.value=layerTarget.texture;cameraPass.material.uniforms.texel.value.set(1/video.videoWidth,1/video.videoHeight)}
 };
 signal?.addEventListener('abort',dispose,{once:true});canvas.addEventListener('webglcontextlost',contextLost);video.addEventListener('resize',resize);
 const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),previousRotation=new THREE.Quaternion(),matrix=new THREE.Matrix4();
 const filters=Array.from({length:10},()=>new OneEuroFilter());
 const bridge=new THREE.Vector3(),ray=new THREE.Vector3(),corners=EYE_CORNERS.map(p=>new THREE.Vector3(p.x,p.y,p.z)),projected=[new THREE.Vector3(),new THREE.Vector3()];
 // The matrix rotation is reliable but its translation/depth drift from the video (FOV and face-size assumptions).
 // Keep the rotation and slide the face along the camera ray until the bridge sits on landmark 168 and the eye corners span their detected width.
 const pin=(landmarks:NormalizedLandmark[])=>{
  const a=landmarks[EYE_CORNERS[0].index],b=landmarks[EYE_CORNERS[1].index],c=landmarks[BRIDGE_LANDMARK],w=video.videoWidth,h=video.videoHeight;
  if(!a||!b||!c||!w||!h)return;
  bridge.set(NOSE_BRIDGE_POSITION.x,NOSE_BRIDGE_POSITION.y,NOSE_BRIDGE_POSITION.z).applyMatrix4(matrix);
  corners.forEach((corner,i)=>projected[i].copy(corner).applyMatrix4(matrix).project(camera));
  const modelWidth=Math.hypot((projected[0].x-projected[1].x)*w/2,(projected[0].y-projected[1].y)*h/2),faceWidth=Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
  if(!(modelWidth>0&&faceWidth>0&&bridge.z<0))return;
  ray.set(c.x*2-1,1-c.y*2,.5).unproject(camera);ray.multiplyScalar(bridge.z*modelWidth/faceWidth/ray.z).sub(bridge);
  matrix.elements[12]+=ray.x;matrix.elements[13]+=ray.y;matrix.elements[14]+=ray.z;
 };
 const updatePose=(data:ArrayLike<number>,time:number,landmarks?:NormalizedLandmark[])=>{
  matrix.fromArray(data);if(landmarks)for(let i=0;i<PIN_PASSES;i++)pin(landmarks);matrix.decompose(position,rotation,scale);
  if(hasPose&&rotation.dot(previousRotation)<0)rotation.set(-rotation.x,-rotation.y,-rotation.z,-rotation.w);
  previousRotation.copy(rotation);
  const values=[position.x,position.y,position.z,rotation.x,rotation.y,rotation.z,rotation.w,scale.x,scale.y,scale.z].map((value,i)=>filters[i].filter(value,time));
  position.fromArray(values);rotation.fromArray(values,3).normalize();scale.fromArray(values,7);face.matrix.compose(position,rotation,scale);face.matrixWorldNeedsUpdate=true;face.visible=true;hasPose=true;
 };
 const schedule=()=>{if(stopped)return;if(typeof video.requestVideoFrameCallback==='function')frameId=video.requestVideoFrameCallback(tick);else animationId=requestAnimationFrame(tick)};
 const applyLighting=()=>{
  ambientLight.color.setRGB(settings.color[0],settings.color[1],settings.color[2]);ambientLight.groundColor.copy(ambientLight.color).multiplyScalar(LIGHT.LIGHT_GROUND_SCALE);ambientLight.intensity=LIGHT.LIGHT_AMBIENT_INTENSITY*settings.ambient;
  light.color.copy(ambientLight.color);light.intensity=LIGHT.LIGHT_KEY_INTENSITY*settings.key;
  shadowLightOffset.set(SHADOW_LIGHT_POSITION.x+settings.shiftX,Math.max(LIGHT.KEY_SHIFT_MIN_Y,SHADOW_LIGHT_POSITION.y+settings.shiftY),SHADOW_LIGHT_POSITION.z);light.position.copy(light.target.position).add(shadowLightOffset);
  faceShadow.material.opacity=FACE_SHADOW_OPACITY*settings.shadow;scene.environmentIntensity=ENVIRONMENT_INTENSITY*settings.environment;
  lensMaterials.forEach((base,material)=>{material.clearcoat=LIGHT.LIGHT_LENS_CLEARCOAT*settings.environment;material.opacity=LIGHT.lensOpacity(base,settings.ambient)});
 };
 const tick=()=>{
  if(stopped)return;
  try{
   if(video.readyState>=2&&video.currentTime!==lastVideoTime){
    lastVideoTime=video.currentTime;const now=performance.now(),result=tracker!.detectForVideo(video,now),pose=result.facialTransformationMatrixes[0];
    if(pose&&result.faceLandmarks.length){
     updatePose(pose.data,now/1000,result.faceLandmarks[0]);faceDepth.visible=faceShadow.visible=updateFaceGeometry(faceGeometry,result.faceLandmarks[0],face.matrix,camera);
     light.target.position.set(NOSE_BRIDGE_POSITION.x,NOSE_BRIDGE_POSITION.y,NOSE_BRIDGE_POSITION.z).applyMatrix4(face.matrix);emit('tracking');
    }
    else{face.visible=faceDepth.visible=faceShadow.visible=false;if(hasPose)filters.forEach(filter=>filter.reset());hasPose=false;emit('no-face')}
    if(sampleContext&&lightFrame++%LIGHT.LIGHT_SAMPLE_EVERY===0){sampleContext.drawImage(video,0,0,sampleCanvas.width,sampleCanvas.height);estimator.sample(sampleContext.getImageData(0,0,sampleCanvas.width,sampleCanvas.height).data,sampleCanvas.width,sampleCanvas.height,result.faceLandmarks[0]??[])}
    const estimate=estimator.update(now/1000);settings=LIGHT.lightSettings(estimate);applyLighting();
    cameraPass.material.uniforms.grain.value=CAMERA_GRAIN*Math.min(GRAIN_DARK_MAX,Math.max(1,LIGHT.LIGHT_REFERENCE_LUMINANCE/Math.max(estimate.ambient,LIGHT.LIGHT_LUMINANCE_FLOOR)));cameraPass.material.uniforms.seed.value=reducedMotion?0:now/1000;
    // Video bypasses the 3D target/pass. All detection, sampling, pose and draws stay in this tick.
    videoTexture.needsUpdate=true;renderer!.setRenderTarget(null);renderer!.clear();renderer!.render(background,backgroundCamera);
    renderer!.setRenderTarget(layerTarget!);renderer!.clear();renderer!.render(scene,camera);renderer!.setRenderTarget(null);renderer!.render(composite,backgroundCamera);
   }
   schedule();
  }catch{fail(new FaceEngineError('tracking','Face tracking stopped. Restart the camera to try again.'))}
 };
 try{
  onStatus?.('loading');
  // Called before the first await, directly from the Start action.
  const cameraRequest=navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
  try{stream=await cancellable(cameraRequest,signal,stopTracks)}catch(error){if(signal?.aborted)throw aborted();throw cameraError(error)}
  if(stopped){stopTracks(stream);throw aborted()}
  stream.getTracks().forEach(track=>track.addEventListener('ended',cameraEnded));video.srcObject=stream;video.muted=true;video.playsInline=true;
  await cancellable(video.play(),signal);if(stopped)throw aborted();
  try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false})}catch{throw new FaceEngineError('unsupported','This browser cannot display the 3D view. Try a browser with WebGL 2 support.')}
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.03).texture;scene.environmentIntensity=ENVIRONMENT_INTENSITY;pmrem.dispose();renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0);resize();
  renderer.autoClear=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const load=(delegate:'GPU'|'CPU')=>FaceLandmarker.createFromOptions({wasmLoaderPath,wasmBinaryPath},{baseOptions:{modelAssetPath:FACE_MODEL_URL,delegate},runningMode:'VIDEO',numFaces:1,outputFacialTransformationMatrixes:true});
  try{tracker=await cancellable(load('GPU'),signal,value=>value.close())}catch(error){if(signal?.aborted||stopped)throw aborted();try{tracker=await cancellable(load('CPU'),signal,value=>value.close())}catch{if(signal?.aborted)throw aborted();throw new FaceEngineError('model','The face model could not load. Check your connection, then try again.')}}
  if(stopped){tracker.close();throw aborted()}
  emit('no-face');schedule();
  return{
   setObject(next){if(stopped){if(next)disposeObject(next);return}if(next===object)return;if(object)disposeObject(object);lensMaterials.clear();object=next;if(next){next.traverse(node=>{if(node instanceof THREE.Mesh){const materials=Array.isArray(node.material)?node.material:[node.material];node.castShadow=materials.every(material=>!material.transparent);materials.forEach(material=>{if(material instanceof THREE.MeshPhysicalMaterial&&material.transparent)lensMaterials.set(material,material.opacity)})}});anchor.add(next);applyLighting()}},
   onStatus(callback){listeners.add(callback);callback(status,failure);return()=>{listeners.delete(callback)}},
   dispose
  };
 }catch(error){dispose();throw error}
}
