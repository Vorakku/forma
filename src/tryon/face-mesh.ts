import * as THREE from 'three';
import type {NormalizedLandmark} from '@mediapipe/tasks-vision';
import canonical from './face-mesh.json';

// Centimetres along the image ray, away from the camera, to keep contact parts visible.
export const FACE_MESH_INSET=.25;

export function createFaceGeometry(){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(canonical.vertices.length*3),3).setUsage(THREE.DynamicDrawUsage));
 geometry.setIndex(canonical.triangles.flat());
 return geometry;
}

// World-space vertices: image rays give x/y; the pinned, smoothed canonical pose supplies depth.
// Reuse scratch vectors and the position buffer throughout the camera session.
const vertex=new THREE.Vector3(),ray=new THREE.Vector3();
export function updateFaceGeometry(geometry:THREE.BufferGeometry,landmarks:NormalizedLandmark[],pose:THREE.Matrix4,camera:THREE.PerspectiveCamera){
 if(landmarks.length<canonical.vertices.length)return false;
 const positions=geometry.getAttribute('position');
 for(let i=0;i<canonical.vertices.length;i++){
  const landmark=landmarks[i];
  vertex.fromArray(canonical.vertices[i]).applyMatrix4(pose);
  ray.set(landmark.x*2-1,1-landmark.y*2,.5).unproject(camera).sub(camera.position).normalize();
  const distance=(vertex.z-camera.position.z)/ray.z+FACE_MESH_INSET;
  vertex.copy(camera.position).addScaledVector(ray,distance);
  positions.setXYZ(i,vertex.x,vertex.y,vertex.z);
 }
 positions.needsUpdate=true;
 // ShadowMaterial uses normals for the light's normal bias.
 geometry.computeVertexNormals();
 return true;
}
