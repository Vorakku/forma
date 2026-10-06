/** Minimal use inside an existing Three.js application / JSON-aware bundler. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGlasses } from './glasses-model.js';

export function addGlassesToScene(scene,renderer){
  // The caller owns the environment target and should dispose it with the scene.
  const generator=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  const environment=generator.fromScene(room,0.03);
  room.dispose();generator.dispose();
  scene.environment=environment.texture;
  const model=createGlasses({frontWidth:140,templeLength:140});
  scene.add(model.group);
  model.setOpen(90);
  return {
    model,
    dispose(){
      scene.remove(model.group);model.dispose();
      if(scene.environment===environment.texture)scene.environment=null;
      environment.dispose();
    }
  };
}
