import * as THREE from 'three';

export const CAMERA_MSAA_SAMPLES=4;
export const CAMERA_BLUR_PX=.6;
export const CAMERA_GRAIN=.025;
export const GRAIN_DARK_MAX=3;
export const CAMERA_CONTRAST=.94;
export const CAMERA_SATURATION=.94;

// The target contains premultiplied linear HDR. Blur colour and alpha together before unpremultiplying.
// Three skips tone mapping in render targets, so ACES/exposure are applied here, once, to the 3D layer.
export function createCameraPass(){
 const material=new THREE.ShaderMaterial({transparent:true,premultipliedAlpha:true,depthTest:false,depthWrite:false,toneMapped:true,
  uniforms:{layer:{value:null},texel:{value:new THREE.Vector2(1,1)},blur:{value:CAMERA_BLUR_PX},grain:{value:CAMERA_GRAIN},seed:{value:0},contrast:{value:CAMERA_CONTRAST},saturation:{value:CAMERA_SATURATION}},
  vertexShader:`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D layer;
uniform vec2 texel;
uniform float blur,grain,seed,contrast,saturation;
varying vec2 vUv;
void main(){
 vec2 stepSize=texel*blur;
 vec4 pixel=texture2D(layer,vUv)*.6;
 pixel+=(texture2D(layer,vUv+vec2(stepSize.x,0.0))+texture2D(layer,vUv-vec2(stepSize.x,0.0))+texture2D(layer,vUv+vec2(0.0,stepSize.y))+texture2D(layer,vUv-vec2(0.0,stepSize.y)))*.1;
 if(pixel.a<=0.00001){gl_FragColor=vec4(0.0);return;}
 gl_FragColor=vec4(pixel.rgb/pixel.a,pixel.a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 float luma=dot(gl_FragColor.rgb,vec3(.2126,.7152,.0722));
 vec3 color=mix(vec3(luma),gl_FragColor.rgb,saturation);
 color=(color-.5)*contrast+.5;
 float noise=fract(sin(dot(gl_FragCoord.xy+vec2(seed,seed*.73),vec2(12.9898,78.233)))*43758.5453)-.5;
 gl_FragColor.rgb=clamp(color+noise*grain,0.0,1.0);
 #include <premultiplied_alpha_fragment>
}`});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.position.z=-.5;return mesh;
}
