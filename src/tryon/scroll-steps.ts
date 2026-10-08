// Pixel distances are normalised by Observer before reaching this module.
export const GESTURE_IDLE_MS = 180;
export const FLICK_WINDOW_MS = 100;
export const FLICK_PX = 40;
export const TAP_PX = 8;
export const EXPLODE_MM = 30;
export const EXPLODE_STAGGER = 0.35;
export const ENV_FOLLOW = 0.35;
export const CAMERA_SPEED = 0.326; // shorter stage sides / second; calibrated by the projection guard
export const PATH_SAMPLES = 256;
export const SURFACE_POINTS = 300;
export const VISIBLE_MARGIN = 0.1;
export const RAMP_S = 0.35;
export const SCRUB_PX_PER_S = 0.25; // × viewport height
export const JUMP_SPEEDUP = 2;
export const EXIT_S = 1.6;
export const EXIT_HOLD_S = 0.15;
export const EXIT_REVEAL_S = 0.6;
export const EXIT_SCALE = 40;
export const EXIT_BLUR_PX = 12;
export const EXIT_REDUCED_S = 0.2;

export type StepCommand =
  | { type: "scrubTo"; time: number }
  | { type: "animateTo"; angle: number; jump: boolean }
  | { type: "cutTo"; angle: number };

type InputContext = {
  at: number;
  time: number;
  blocked?: boolean;
};
export type StepEvent = InputContext &
  (
    | { type: "wheel"; deltaY: number; deltaX?: number; ctrlKey?: boolean }
    | { type: "idle" }
    | { type: "touchStart" }
    | { type: "touchMove"; deltaY: number }
    | { type: "touchEnd"; cancelled?: boolean }
    | {
        type: "key";
        key: string;
        shiftKey?: boolean;
        repeat?: boolean;
        editable?: boolean;
        interactive?: boolean;
      }
    | { type: "landed"; angle: number }
  );

export function acceptsStepInput(event: StepEvent) {
  if (event.blocked) return false;
  if (event.type === "wheel")
    return (
      !event.ctrlKey &&
      Math.abs(event.deltaX ?? 0) <= Math.abs(event.deltaY) &&
      event.deltaY !== 0
    );
  if (event.type === "key")
    return (
      !event.editable &&
      !(event.interactive && (event.key === " " || event.key === "Enter")) &&
      [
        "ArrowDown",
        "ArrowUp",
        "PageDown",
        "PageUp",
        " ",
        "Home",
        "End",
      ].includes(event.key)
    );
  return true;
}

type Gesture = {
  kind: "wheel" | "touch";
  started: number;
  last: number;
  base: number;
  origin: number;
  neighbour: number;
  lastDirection: number;
  accumulated: number;
  travel: number;
  maxTravel: number;
  consumed: boolean;
  exitReady: boolean;
};

// Seconds are also the scrub weights; one reference second has weight one.
export function stepDuration(
  from: number,
  to: number,
  seconds: readonly number[],
) {
  const start = Math.min(from, to),
    end = Math.max(from, to);
  let duration = 0;
  for (let index = Math.floor(start); index < end; index++)
    duration +=
      (Math.min(end, index + 1) - Math.max(start, index)) * seconds[index];
  return duration;
}

export function createScrollSteps(
  angleCount: number,
  viewportHeight: () => number,
  reduced = false,
  initialAngle = 0,
  seconds: readonly number[],
  withExit = false,
) {
  const lastAngle = Math.max(0, angleCount - 1);
  const exitAngle = lastAngle + 1;
  const limit = withExit ? exitAngle : lastAngle;
  const clamp = (value: number) => Math.max(0, Math.min(limit, value));
  let landed = clamp(initialAngle);
  let target = landed;
  let flightAnchor: number | undefined;
  let gesture: Gesture | undefined;
  let exited = false;
  let settled = true;
  let inputAt = -Infinity;
  let lastLandedAt = -Infinity;

  const canExit = (time: number) =>
    landed === lastAngle &&
    target === lastAngle &&
    flightAnchor === undefined &&
    settled &&
    time === lastAngle;

  function move(
    angle: number,
    time: number,
    carry = false,
    jump = false,
  ): StepCommand[] {
    const next = clamp(jump ? Math.min(lastAngle, angle) : angle);
    if (
      next === time &&
      target === time &&
      flightAnchor === undefined &&
      !carry
    )
      return [];
    target = next;
    if (reduced) {
      landed = target;
      settled = true;
      lastLandedAt = inputAt;
      flightAnchor = undefined;
      if (withExit && target === exitAngle) exited = true;
      return [{ type: "cutTo", angle: target }];
    }
    settled = false;
    flightAnchor ??= target;
    return [
      {
        type: "animateTo",
        angle: target,
        jump,
      },
    ];
  }

  function step(direction: number, time: number, carry = false): StepCommand[] {
    let next = target + direction;
    // Retarget a running step, with at most one extra angle awaiting its landing.
    if (flightAnchor !== undefined)
      next = Math.max(flightAnchor - 1, Math.min(flightAnchor + 1, next));
    // Never queue an exit from an earlier angle or from arrival momentum.
    if (next > lastAngle && time <= lastAngle && !canExit(time)) next = lastAngle;
    return move(next, time, carry);
  }

  function finish(time: number, cancelled = false, at = gesture?.last ?? 0): StepCommand[] {
    if (!gesture || gesture.consumed) return [];
    const { base, neighbour, lastDirection, kind, maxTravel } = gesture;
    if (withExit && Math.max(base, neighbour) === exitAngle) {
      // Exit is reversible until landing: a slow early release returns to Front.
      // A quick forward touch flick still plays the whole step, like a notch.
      const flick = kind === "touch" && maxTravel >= FLICK_PX &&
        at - gesture.started <= FLICK_WINDOW_MS && gesture.travel > 0;
      const destination = gesture.exitReady && !cancelled && lastDirection > 0 &&
        maxTravel >= TAP_PX && (time >= lastAngle + 0.5 || flick)
          ? exitAngle : lastAngle;
      return move(destination, time, true);
    }
    const direction = Math.sign(neighbour - base);
    const destination =
      cancelled ||
      (kind === "touch" && maxTravel < TAP_PX) ||
      lastDirection !== direction
        ? base
        : neighbour;
    return move(destination, time, true);
  }

  function start(kind: Gesture["kind"], at: number, time: number) {
    // A scrub interrupts at the current position, within one adjacent interval.
    const base = time > lastAngle ? lastAngle :
      flightAnchor === undefined ? landed : clamp(Math.round(time));
    gesture = {
      kind,
      started: at,
      last: at,
      base,
      origin: time,
      neighbour: base,
      lastDirection: 0,
      accumulated: 0,
      travel: 0,
      maxTravel: 0,
      consumed: false,
      exitReady:
        withExit && (time > lastAngle || (canExit(time) &&
        at - lastLandedAt >= GESTURE_IDLE_MS)),
    };
  }

  function scrub(deltaY: number, time: number): StepCommand[] {
    if (!gesture || !deltaY) return [];
    const direction = Math.sign(deltaY);
    if (gesture.lastDirection === 0 && gesture.origin !== gesture.base &&
      !(withExit && gesture.origin > lastAngle)) {
      gesture.base =
        direction > 0 ? Math.floor(gesture.origin) : Math.ceil(gesture.origin);
    }
    gesture.lastDirection = direction;
    gesture.travel += deltaY;
    gesture.maxTravel = Math.max(gesture.maxTravel, Math.abs(gesture.travel));
    if (gesture.consumed) return [];
    if (gesture.origin > lastAngle) gesture.neighbour = exitAngle;
    else if (gesture.neighbour === gesture.base)
      gesture.neighbour = clamp(gesture.base + direction);
    if (gesture.neighbour === exitAngle && !gesture.exitReady) return [];
    if (gesture.neighbour === gesture.base) return [];
    if (reduced) {
      if (gesture.kind === "touch" && gesture.maxTravel < TAP_PX) return [];
      gesture.consumed = true;
      return step(direction, time);
    }
    flightAnchor = undefined;
    target = gesture.base;
    const next = Math.max(
      Math.min(gesture.base, gesture.neighbour),
      Math.min(
        Math.max(gesture.base, gesture.neighbour),
        gesture.origin +
          gesture.travel /
            (SCRUB_PX_PER_S *
              viewportHeight() *
              seconds[Math.min(gesture.base, gesture.neighbour)]),
      ),
    );
    if (next === time) return [];
    settled = false;
    return [{ type: "scrubTo", time: next }];
  }

  return {
    setReduced(value: boolean, time: number): StepCommand[] {
      if (exited) return [];
      reduced = value;
      if (gesture && !gesture.consumed) {
        const commands = finish(time);
        gesture.consumed = true;
        if (commands.length) return [{ type: "cutTo", angle: target }];
      }
      landed = target;
      settled = true;
      if (withExit && target === exitAngle) exited = true;
      flightAnchor = undefined;
      return [{ type: "cutTo", angle: target }];
    },
    handle(event: StepEvent): StepCommand[] {
      if (exited) return [];
      inputAt = event.at;
      if (event.type === "landed") {
        landed = target = clamp(event.angle);
        settled = true;
        lastLandedAt = event.at;
        flightAnchor = undefined;
        if (withExit && landed === exitAngle) exited = true;
        return [];
      }
      if (!acceptsStepInput(event)) return [];
      switch (event.type) {
        case "wheel": {
          if (gesture?.kind === "touch") return [];
          const commands: StepCommand[] = [];
          if (!gesture || event.at - gesture.last >= GESTURE_IDLE_MS) {
            commands.push(...finish(event.time));
            start("wheel", event.at, event.time);
          }
          const current = gesture!;
          current.last = event.at;
          if (current.consumed) return commands;
          // Even a gesture starting just after landing must wait for idle.
          // Consume it so its momentum cannot become eligible later.
          if (withExit && event.deltaY > 0 && event.time >= lastAngle && !current.exitReady) {
            current.consumed = true;
            return commands;
          }
          current.accumulated += Math.abs(event.deltaY);
          if (
            reduced ||
            (event.at - current.started <= FLICK_WINDOW_MS &&
              current.accumulated >= FLICK_PX)
          ) {
            current.consumed = true;
            commands.push(
              ...step(
                Math.sign(event.deltaY),
                event.time,
                current.travel !== 0,
              ),
            );
          } else commands.push(...scrub(event.deltaY, event.time));
          return commands;
        }
        case "idle": {
          if (
            gesture?.kind !== "wheel" ||
            event.at - gesture.last < GESTURE_IDLE_MS
          )
            return [];
          const commands = finish(event.time);
          gesture = undefined;
          return commands;
        }
        case "touchStart":
          gesture = undefined;
          start("touch", event.at, event.time);
          return [];
        case "touchMove":
          return gesture?.kind === "touch"
            ? scrub(event.deltaY, event.time)
            : [];
        case "touchEnd": {
          if (gesture?.kind !== "touch") return [];
          const commands = finish(event.time, event.cancelled, event.at);
          gesture = undefined;
          return commands;
        }
        case "key": {
          const direction =
            ["ArrowDown", "PageDown"].includes(event.key) ||
            (event.key === " " && !event.shiftKey)
              ? 1
              : ["ArrowUp", "PageUp"].includes(event.key) ||
                  (event.key === " " && event.shiftKey)
                ? -1
                : 0;
          if (!direction && event.key !== "Home" && event.key !== "End")
            return [];
          if (withExit && direction > 0 && event.repeat &&
            (target >= lastAngle || event.time > lastAngle)) return [];
          const wasScrubbing =
            !!gesture && !gesture.consumed && gesture.travel !== 0;
          gesture = undefined;
          return direction
            ? step(direction, event.time, wasScrubbing)
            : move(
                event.key === "Home" ? 0 : lastAngle,
                event.time,
                wasScrubbing,
                true,
              );
        }
      }
    },
  };
}
