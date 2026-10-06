import * as THREE from 'three';

// Release shared resources once, including maps used by display objects.
export function disposeObject(object:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 object.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material)}});
 materials.forEach(material=>{Object.values(material).forEach(value=>{if(value instanceof THREE.Texture)textures.add(value)})});
 geometries.forEach(geometry=>geometry.dispose());textures.forEach(texture=>texture.dispose());materials.forEach(material=>material.dispose());object.removeFromParent();
}
