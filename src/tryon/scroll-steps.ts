// Pixel distances are normalised by Observer before reaching this module.
export const GESTURE_IDLE_MS = 180;
export const FLICK_WINDOW_MS = 100;
export const FLICK_PX = 40;
export const SCRUB_PX_PER_ANGLE = 0.5; // × viewport height
export const TAP_PX = 8;
export const STEP_DURATION = 1.1;
export const STEP_MIN = 0.3;
export const STEP_MAX = 2.2;

export type StepCommand =
  | { type: "scrubTo"; time: number }
  | { type: "animateTo"; angle: number; ease: "power2.inOut" | "power2.out" }
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
};

export function stepDuration(from: number, to: number) {
  return Math.max(
    STEP_MIN,
    Math.min(STEP_MAX, Math.abs(to - from) * STEP_DURATION),
  );
}

export function createScrollSteps(
  angleCount: number,
  viewportHeight: () => number,
  reduced = false,
  initialAngle = 0,
) {
  const lastAngle = Math.max(0, angleCount - 1);
  const clamp = (value: number) => Math.max(0, Math.min(lastAngle, value));
  let landed = clamp(initialAngle);
  let target = landed;
  let flightAnchor: number | undefined;
  let gesture: Gesture | undefined;

  function move(angle: number, time: number, carry = false): StepCommand[] {
    const next = clamp(angle);
    if (
      next === time &&
      target === time &&
      flightAnchor === undefined &&
      !carry
    )
      return [];
    const retarget = flightAnchor !== undefined;
    target = next;
    if (reduced) {
      landed = target;
      flightAnchor = undefined;
      return [{ type: "cutTo", angle: target }];
    }
    flightAnchor ??= target;
    return [
      {
        type: "animateTo",
        angle: target,
        ease: carry || retarget ? "power2.out" : "power2.inOut",
      },
    ];
  }

  function step(direction: number, time: number, carry = false): StepCommand[] {
    let next = target + direction;
    // Retarget a running step, with at most one extra angle awaiting its landing.
    if (flightAnchor !== undefined)
      next = Math.max(flightAnchor - 1, Math.min(flightAnchor + 1, next));
    return move(next, time, carry);
  }

  function finish(time: number, cancelled = false): StepCommand[] {
    if (!gesture || gesture.consumed) return [];
    const { base, neighbour, lastDirection, kind, maxTravel } = gesture;
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
    const base = flightAnchor === undefined ? landed : clamp(Math.round(time));
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
    };
  }

  function scrub(deltaY: number, time: number): StepCommand[] {
    if (!gesture || !deltaY) return [];
    const direction = Math.sign(deltaY);
    if (gesture.lastDirection === 0 && gesture.origin !== gesture.base) {
      gesture.base =
        direction > 0 ? Math.floor(gesture.origin) : Math.ceil(gesture.origin);
    }
    gesture.lastDirection = direction;
    gesture.travel += deltaY;
    gesture.maxTravel = Math.max(gesture.maxTravel, Math.abs(gesture.travel));
    if (gesture.consumed) return [];
    if (gesture.neighbour === gesture.base)
      gesture.neighbour = clamp(gesture.base + direction);
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
          gesture.travel / (SCRUB_PX_PER_ANGLE * viewportHeight()),
      ),
    );
    return next === time ? [] : [{ type: "scrubTo", time: next }];
  }

  return {
    setReduced(value: boolean, time: number): StepCommand[] {
      reduced = value;
      if (gesture && !gesture.consumed) {
        const commands = finish(time);
        gesture.consumed = true;
        if (commands.length) return [{ type: "cutTo", angle: target }];
      }
      landed = target;
      flightAnchor = undefined;
      return [{ type: "cutTo", angle: target }];
    },
    handle(event: StepEvent): StepCommand[] {
      if (event.type === "landed") {
        landed = target = clamp(event.angle);
        flightAnchor = undefined;
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
          const commands = finish(event.time, event.cancelled);
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
          const wasScrubbing =
            !!gesture && !gesture.consumed && gesture.travel !== 0;
          gesture = undefined;
          return direction
            ? step(direction, event.time, wasScrubbing)
            : move(
                event.key === "Home" ? 0 : lastAngle,
                event.time,
                wasScrubbing,
              );
        }
      }
    },
  };
}
