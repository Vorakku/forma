import { gsap } from "gsap";
import type { MotionBudget } from "./scroll-budget";
import { RAMP_S, JUMP_SPEEDUP, stepDuration } from "./scroll-steps";

// Integrated trapezoidal velocity. Velocity is expressed in budget seconds per
// wall second, so it can be carried across retargets and different step weights.
export function trapezoid(
  distance: number,
  duration: number,
  initialVelocity = 0,
  ramp = RAMP_S,
) {
  const edge = Math.min(ramp, duration / 2);
  const cruise = edge
    ? (distance - (initialVelocity * edge) / 2) / (duration - edge)
    : 0;
  return (elapsed: number) => {
    const t = Math.max(0, Math.min(duration, elapsed));
    if (!duration) return { distance, velocity: 0 };
    if (t < edge)
      return {
        distance:
          initialVelocity * t +
          ((cruise - initialVelocity) * t * t) / (2 * edge),
        velocity: initialVelocity + ((cruise - initialVelocity) * t) / edge,
      };
    if (t > duration - edge) {
      const remaining = duration - t;
      return {
        distance: distance - (cruise * remaining * remaining) / (2 * edge),
        velocity: (cruise * remaining) / edge,
      };
    }
    return {
      distance: (initialVelocity * edge) / 2 + cruise * (t - edge / 2),
      velocity: cruise,
    };
  };
}

export function planStepAnimation(
  budget: MotionBudget,
  from: number,
  to: number,
  jump = false,
  initialVelocity = 0,
) {
  const direction = Math.sign(to - from);
  const total = stepDuration(from, to, budget.seconds);
  const speedup = jump ? JUMP_SPEEDUP : 1;
  const duration = total / speedup;
  const profile = trapezoid(
    total,
    duration,
    initialVelocity * direction,
    RAMP_S / speedup,
  );
  const mapDistance = (travel: number) => {
    let remaining = travel;
    let time = from;
    while (time !== to) {
      const index = direction > 0 ? Math.floor(time) : Math.ceil(time) - 1;
      const end =
        direction > 0 ? Math.min(to, index + 1) : Math.max(to, index);
      const seconds = Math.abs(end - time) * budget.seconds[index];
      if (remaining <= seconds)
        return time + direction * remaining / budget.seconds[index];
      remaining -= seconds;
      time = end;
    }
    return to;
  };
  return {
    duration,
    sample(elapsed: number) {
      if (!total || elapsed >= duration) return { time: to, velocity: 0 };
      const result = profile(elapsed);
      return {
        time: mapDistance(result.distance),
        velocity: result.velocity * direction,
      };
    },
  };
}

export function animateScrollStep(
  timeline: gsap.core.Timeline,
  budget: MotionBudget,
  angle: number,
  options: {
    jump?: boolean;
    velocity?: number;
    onComplete?: () => void;
    now?: () => number;
  } = {},
) {
  const plan = planStepAnimation(
    budget,
    timeline.time(),
    angle,
    options.jump,
    options.velocity,
  );
  const now = options.now ?? (() => performance.now() / 1000);
  let started = now(),
    pausedAt: number | undefined;
  let current = plan.sample(0),
    finished = false;
  let tween: gsap.core.Tween;
  const render = () => {
    if (finished || pausedAt !== undefined) return;
    const elapsed = Math.max(0, now() - started);
    current = plan.sample(elapsed);
    timeline.time(current.time, false);
    if (elapsed >= plan.duration) {
      finished = true;
      tween?.kill();
      options.onComplete?.();
    }
  };
  // GSAP schedules updates; elapsed time comes from the monotonic clock, so
  // ticker lag smoothing and a stale root-timeline time can't stretch the budget.
  tween = gsap.to(
    { tick: 0 },
    { tick: 1, duration: 1, repeat: -1, ease: "none", onUpdate: render },
  );
  return {
    tween,
    plan,
    velocity: () => current.velocity,
    pause() {
      if (pausedAt === undefined) pausedAt = now();
      tween.pause();
    },
    resume() {
      if (pausedAt !== undefined) {
        started += now() - pausedAt;
        pausedAt = undefined;
      }
      tween.resume();
    },
  };
}
