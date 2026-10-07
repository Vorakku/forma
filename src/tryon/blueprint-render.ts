import * as THREE from "three";
import type { createBlueprint } from "./blueprint";

// Independent depth buffers keep glass/translucency and hidden-line depth tests
// stable throughout the fade. Mix 0 still uses the studio's original direct path.
export function createBlueprintRender() {
  const studioTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const blueprintTarget = studioTarget.clone();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
    premultipliedAlpha: true,
    uniforms: {
      studio: { value: studioTarget.texture },
      blueprint: { value: blueprintTarget.texture },
      mixAmount: { value: 0 },
      toneMappingExposure: { value: 1.45 },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D studio;
      uniform sampler2D blueprint;
      uniform float mixAmount;
      varying vec2 vUv;
      #include <tonemapping_pars_fragment>
      void main() {
        vec4 a = texture2D(studio, vUv);
        vec4 b = texture2D(blueprint, vUv);
        // Render targets carry premultiplied linear colour. Tone-map the studio
        // just as on its direct path, leaving the flat blueprint tokens alone.
        a.rgb = ACESFilmicToneMapping(a.rgb / max(a.a, 0.00001)) * a.a;
        vec4 blended = mix(a, b, mixAmount);
        gl_FragColor = vec4(blended.rgb / max(blended.a, 0.00001), blended.a);
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);
  let disposed = false;
  return {
    draw(
      renderer: THREE.WebGLRenderer,
      studioScene: THREE.Scene,
      studioCamera: THREE.Camera,
      blueprint: ReturnType<typeof createBlueprint>,
      mix: number,
    ) {
      const target = renderer.getRenderTarget();
      const environment = studioScene.environment;
      const floor = studioScene.getObjectByName("floor");
      const floorVisible = floor?.visible;
      const shadows = renderer.shadowMap.enabled;
      const drawBlueprint = () =>
        blueprint.draw(() => {
          studioScene.environment = null;
          if (floor) floor.visible = false;
          renderer.shadowMap.enabled = false;
          renderer.render(studioScene, studioCamera);
        });
      try {
        if (mix === 1) {
          drawBlueprint();
          return;
        }
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        if (studioTarget.width !== size.x || studioTarget.height !== size.y) {
          studioTarget.setSize(size.x, size.y);
          blueprintTarget.setSize(size.x, size.y);
        }
        renderer.setRenderTarget(studioTarget);
        renderer.render(studioScene, studioCamera);
        renderer.setRenderTarget(blueprintTarget);
        drawBlueprint();
        renderer.setRenderTarget(target);
        material.uniforms.mixAmount.value = mix;
        material.uniforms.toneMappingExposure.value =
          renderer.toneMappingExposure;
        renderer.render(scene, camera);
      } finally {
        studioScene.environment = environment;
        if (floor) floor.visible = floorVisible!;
        renderer.shadowMap.enabled = shadows;
        renderer.setRenderTarget(target);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      studioTarget.dispose();
      blueprintTarget.dispose();
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
