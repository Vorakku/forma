import * as THREE from "three";
import type { V2Theme } from "./v2-theme";

// All Phase 2 tuning lives here. World distances are studio centimetres.
export const TORCH = {
  dotSize: 10,
  dotColor: "#fff4e8",
  haloSize: 40,
  haloOpacity: 0.35,
  haloStop: 70,
  lightColor: "#fff4e8",
  intensity: 500,
  distance: 36,
  decay: 2,
  planeOffset: 10,
  stiffness: 180,
  damping: 26,
  positionEpsilon: 0.0001,
  velocityEpsilon: 0.001,
  maxFrameSeconds: 0.05,
  springStepSeconds: 1 / 120,
  initialFrameSeconds: 1 / 60,
  fadeSeconds: 0.3,
  keyFloor: 0.025,
  hemisphereFloor: 0.02,
  environmentFloor: 0.04,
  sweepAmplitudeX: 0.18,
  sweepAmplitudeY: 0.06,
  sweepRadiansPerAngle: Math.PI / 2,
  sweepYFrequency: 0.5,
} as const;

const INTERACTIVE = 'a, button, input, textarea, select, [role="button"], [role="link"], [contenteditable], .site-header, nav, [role="dialog"], dialog, .drawer';

export function torchScale(floor: number, mix: number) {
  return mix === 0 ? 1 : mix === 1 ? floor : 1 + (floor - 1) * mix;
}

export function createTorchProjection() {
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const screen = new THREE.Vector2();
  return (camera: THREE.PerspectiveCamera, centre: THREE.Vector3, x: number, y: number, out: THREE.Vector3) => {
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(normal).negate();
    origin.copy(centre).addScaledVector(normal, TORCH.planeOffset);
    plane.setFromNormalAndCoplanarPoint(normal, origin);
    screen.set(x * 2 - 1, 1 - y * 2);
    ray.setFromCamera(screen, camera);
    ray.ray.intersectPlane(plane, out);
    return out;
  };
}

export function createTorchSpring(x = 0.5, y = 0.35) {
  const state = { x, y, vx: 0, vy: 0 };
  return {
    state,
    step(x: number, y: number, seconds: number, reduced: boolean) {
      // Small integration steps keep the spring stable after a slow GPU frame.
      let remaining = Math.min(Math.max(seconds, 0), TORCH.maxFrameSeconds);
      while (!reduced && remaining > 0) {
        const dt = Math.min(remaining, TORCH.springStepSeconds);
        state.vx += ((x - state.x) * TORCH.stiffness - state.vx * TORCH.damping) * dt;
        state.vy += ((y - state.y) * TORCH.stiffness - state.vy * TORCH.damping) * dt;
        state.x += state.vx * dt;
        state.y += state.vy * dt;
        remaining -= dt;
      }
      const settled = reduced || (
        Math.abs(x - state.x) < TORCH.positionEpsilon &&
        Math.abs(y - state.y) < TORCH.positionEpsilon &&
        Math.abs(state.vx) < TORCH.velocityEpsilon &&
        Math.abs(state.vy) < TORCH.velocityEpsilon
      );
      if (settled) {
        state.x = x;
        state.y = y;
        state.vx = state.vy = 0;
      }
      return !settled;
    },
  };
}

export function createNightTorch({ scene, camera, stage, dot, invalidate }: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  stage?: HTMLElement;
  dot?: HTMLElement;
  invalidate: () => void;
}) {
  const light = new THREE.PointLight(TORCH.lightColor, 0, TORCH.distance, TORCH.decay);
  light.name = "v2.night-torch";
  light.castShadow = false;
  light.visible = false;
  scene.add(light);
  const project = createTorchProjection();
  const centre = new THREE.Vector3(); // createStudio centres the assembled model at the origin.
  const position = new THREE.Vector3();
  const spring = createTorchSpring();
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  let theme: V2Theme = "day";
  let active = false;
  let reduced = false;
  let listening = false;
  let stopped = false;
  let pointer = false;
  let finger: number | undefined;
  let pointerX = 0.5, pointerY = 0.35;
  let restX = 0.5, restY = 0.35, progress = 0;
  let targetX = restX, targetY = restY;
  let mix = 0;
  let frame = 0;
  let lastTime = 0;

  if (dot) {
    dot.style.setProperty("--torch-dot-size", TORCH.dotSize + "px");
    dot.style.setProperty("--torch-dot-color", TORCH.dotColor);
    dot.style.setProperty("--torch-halo-size", TORCH.haloSize + "px");
    dot.style.setProperty("--torch-halo-opacity", TORCH.haloOpacity * 100 + "%");
    dot.style.setProperty("--torch-halo-stop", TORCH.haloStop + "%");
  }

  function decoration() {
    const show = active && fine.matches && pointer;
    if (dot) dot.hidden = !show;
    stage?.toggleAttribute("data-torch-pointer", show);
  }

  function chooseTarget() {
    targetX = restX;
    targetY = restY;
    if (active && ((fine.matches && pointer) || (!fine.matches && finger !== undefined && !reduced))) {
      targetX = pointerX;
      targetY = pointerY;
    } else if (active && !fine.matches && !reduced) {
      // Scroll-driven, never clock-driven: a stationary stage stays stationary.
      targetX += Math.sin(progress * TORCH.sweepRadiansPerAngle) * TORCH.sweepAmplitudeX;
      targetY += Math.sin(progress * TORCH.sweepRadiansPerAngle * TORCH.sweepYFrequency) * TORCH.sweepAmplitudeY;
    }
  }

  function writeDOM() {
    if (!stage || !active) return;
    const x = fine.matches && pointer ? pointerX : targetX;
    const y = fine.matches && pointer ? pointerY : targetY;
    if (dot && !dot.hidden) {
      dot.style.transform = `translate3d(${x * stage.clientWidth}px, ${y * stage.clientHeight}px, 0)`;
    }
    stage.style.setProperty("--pool-x", x * 100 + "%");
    stage.style.setProperty("--pool-y", y * 100 + "%");
  }

  function request() {
    if (stopped || document.hidden || frame) return;
    stage?.removeAttribute("data-torch-settled");
    frame = requestAnimationFrame(tick);
  }

  function tick(time: number) {
    frame = 0;
    if (stopped || document.hidden) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, TORCH.maxFrameSeconds) : TORCH.initialFrameSeconds;
    lastTime = time;
    chooseTarget();
    const moving = spring.step(targetX, targetY, dt, reduced);
    const goal = active ? 1 : 0;
    const fadeStep = dt / TORCH.fadeSeconds;
    mix = reduced ? goal : goal > mix ? Math.min(goal, mix + fadeStep) : Math.max(goal, mix - fadeStep);
    writeDOM();
    invalidate();
    if (mix !== goal || (active && moving)) request();
    else {
      lastTime = 0;
      stage?.setAttribute("data-torch-settled", "true");
    }
  }

  function coordinates(x: number, y: number) {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    pointerX = THREE.MathUtils.clamp((x - rect.left) / Math.max(rect.width, 1), 0, 1);
    pointerY = THREE.MathUtils.clamp((y - rect.top) / Math.max(rect.height, 1), 0, 1);
  }

  function accepts(target: EventTarget | null) {
    return target instanceof Element && !!stage?.contains(target) && !target.closest(INTERACTIVE);
  }

  function pointerMove(event: PointerEvent) {
    if (!fine.matches || event.pointerType === "touch") return;
    pointer = accepts(event.target);
    coordinates(event.clientX, event.clientY);
    decoration();
    chooseTarget();
    // The cursor itself must never inherit the light's spring lag.
    if (dot && !dot.hidden && stage) dot.style.transform = `translate3d(${pointerX * stage.clientWidth}px, ${pointerY * stage.clientHeight}px, 0)`;
    if (active) request();
  }

  function leave() {
    pointer = false;
    decoration();
    if (active) request();
  }

  function touchStart(event: TouchEvent) {
    if (fine.matches || event.touches.length !== 1 || !accepts(event.target)) return;
    const touch = event.touches[0];
    finger = touch.identifier;
    coordinates(touch.clientX, touch.clientY);
    if (active) request();
  }

  function touchMove(event: TouchEvent) {
    if (finger === undefined) return;
    for (let i = 0; i < event.touches.length; i++) {
      const touch = event.touches[i];
      if (touch.identifier === finger) coordinates(touch.clientX, touch.clientY);
    }
    if (active) request();
  }

  function touchEnd(event: TouchEvent) {
    for (let i = 0; i < event.touches.length; i++) {
      if (event.touches[i].identifier === finger) return;
    }
    finger = undefined;
    if (active) request();
  }

  function listen(on: boolean) {
    if (on === listening || !stage) return;
    listening = on;
    if (on) {
      document.addEventListener("pointermove", pointerMove, { passive: true });
      document.addEventListener("pointerover", pointerMove, { passive: true });
      stage.addEventListener("pointerleave", leave);
      window.addEventListener("blur", leave);
      stage.addEventListener("touchstart", touchStart, { passive: true });
      document.addEventListener("touchmove", touchMove, { passive: true });
      document.addEventListener("touchend", touchEnd, { passive: true });
      document.addEventListener("touchcancel", touchEnd, { passive: true });
      fine.addEventListener("change", pointerKind);
    } else {
      document.removeEventListener("pointermove", pointerMove);
      document.removeEventListener("pointerover", pointerMove);
      stage.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      stage.removeEventListener("touchstart", touchStart);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("touchend", touchEnd);
      document.removeEventListener("touchcancel", touchEnd);
      fine.removeEventListener("change", pointerKind);
      pointer = false;
      finger = undefined;
    }
  }

  function pointerKind() {
    pointer = false;
    finger = undefined;
    decoration();
    if (active) request();
  }

  return {
    get mix() { return mix; },
    setReducedMotion(value: boolean) {
      if (stopped) return;
      reduced = value;
      if (active || mix) request();
    },
    configure(nextTheme: V2Theme, blocked: boolean, x: number, y: number, lightProgress: number) {
      if (stopped) return;
      theme = nextTheme;
      restX = x / 100;
      restY = y / 100;
      progress = lightProgress;
      const next = theme === "night" && !blocked && !document.hidden;
      listen(theme === "night" && !document.hidden);
      const changed = next !== active;
      active = next;
      decoration();
      stage?.toggleAttribute("data-torch-active", active);
      chooseTarget();
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
        mix = 0;
        light.intensity = 0;
        light.visible = false;
      } else if (changed || active) {
        if (reduced) {
          mix = active ? 1 : 0;
          spring.step(targetX, targetY, 0, true);
        }
        request();
      }
      if (!active && stage) {
        stage.style.setProperty("--pool-x", x + "%");
        stage.style.setProperty("--pool-y", y + "%");
      }
    },
    prepare() {
      // Reproject every render, including scroll/resize renders after the spring stops.
      if (mix > 0) {
        project(camera, centre, spring.state.x, spring.state.y, position);
        light.position.copy(position);
      }
      light.intensity = TORCH.intensity * mix;
      light.visible = mix > 0;
      writeDOM();
    },
    dispose() {
      stopped = true;
      mix = 0;
      listen(false);
      cancelAnimationFrame(frame);
      light.intensity = 0;
      light.visible = false;
      scene.remove(light);
      if (dot) dot.hidden = true;
      for (const attr of ["data-torch-active", "data-torch-pointer", "data-torch-settled"]) stage?.removeAttribute(attr);
      if (stage) {
        stage.style.setProperty("--pool-x", restX * 100 + "%");
        stage.style.setProperty("--pool-y", restY * 100 + "%");
      }
    },
  };
}
