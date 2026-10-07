import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { Observer } from "gsap/Observer";
import { useGSAP } from "@gsap/react";
import { useApp, useProduct, useProductList } from "@/lib/store";
import { buildDisplayGlasses } from "@/tryon/glasses";
import { createScrollViewer } from "@/tryon/scroll-viewer";
import { buildMotionBudget } from "@/tryon/scroll-budget";
import { animateScrollStep } from "@/tryon/scroll-animation";
import { populateScrollTimeline } from "@/tryon/scroll-timeline";
import { resolveScrollPoses, SCROLL_ANGLES } from "@/tryon/scroll-poses";
import {
  readBlueprintTheme,
  saveBlueprintTheme,
  readBlueprintTokens,
  BLUEPRINT_TOKENS,
  type BlueprintTheme,
} from "@/tryon/blueprint-theme";
import {
  createScrollSteps,
  acceptsStepInput,
  GESTURE_IDLE_MS,
  type StepCommand,
  type StepEvent,
} from "@/tryon/scroll-steps";
import type { Product } from "@/lib/types";
import "./v2-demo.css";

gsap.registerPlugin(Observer, useGSAP);

function headerOpacity(time: number, last: number) {
  return gsap.utils.clamp(
    0,
    1,
    Math.max(1 - time / 0.4, 1 - (last - time) / 0.4),
  );
}

function blocked(target: EventTarget | null) {
  return (
    useApp.getState().panel !== null ||
    (target instanceof Element &&
      !!target.closest('[role="dialog"], dialog, .drawer'))
  );
}

// Enough of The Ellis to draw its reference model when the server is down.
const OFFLINE_ELLIS: Product = {
  id: "the-ellis",
  slug: "the-ellis",
  name: "The Ellis",
  category: "optical",
  brand: "FORMA",
  description: "",
  price: 0,
  originalPrice: 0,
  stock: 0,
  sold: 0,
  rating: 0,
  image: "",
  images: [],
  sizes: [],
  colors: ["Ink black"],
  swatches: [{ hex: "#202021", filter: "none" }],
  shape: "Rectangle",
  material: "Acetate",
  dimensions: "",
  weight: "",
  tag: "",
  reviewCount: 0,
  lenses: [],
  finishes: [],
};

export function V2Demo() {
  const product = useProduct("the-ellis");
  const load = useProductList(["the-ellis"]);
  return (
    <V2Stage
      product={product}
      loading={load.loading}
      loadError={load.error}
      withLinks
    />
  );
}

// Shown on its own, without the shell, when the store cannot reach the server.
export function OfflineV2Demo() {
  useEffect(() => {
    document.title = "FORMA V2 Demo — FORMA";
  }, []);
  return <V2Stage product={OFFLINE_ELLIS} loading={false} loadError="" />;
}

function V2Stage({
  product,
  loading,
  loadError,
  withLinks = false,
}: {
  product: Product | undefined;
  loading: boolean;
  loadError: string;
  withLinks?: boolean;
}) {
  const load = { loading, error: loadError };
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [angle, setAngle] = useState(0);
  const [theme, setTheme] = useState(() =>
    readBlueprintTheme(() => window.localStorage),
  );
  const themeChoice = useRef(theme);
  const applyTheme = useRef<(theme: BlueprintTheme) => void>(() => {});
  const chooseTheme = (choice: BlueprintTheme) => {
    themeChoice.current = choice;
    setTheme(choice);
    saveBlueprintTheme(() => window.localStorage, choice);
    applyTheme.current(choice);
  };

  useGSAP(
    () => {
      if (!product || !canvas.current || error || load.error) return;
      setReady(false);
      let viewer: ReturnType<typeof createScrollViewer> | undefined;
      let refreshPose = () => {};
      let live = true;
      const media = gsap.matchMedia();
      const root = document.documentElement;
      let themeTween: gsap.core.Tween | undefined;
      let reducedMotion = false;
      const clearThemeOverrides = () => {
        for (const token of BLUEPRINT_TOKENS)
          root.style.removeProperty(`--blueprint-${token}`);
      };
      const clearMode = () => {
        themeTween?.kill();
        clearThemeOverrides();
        root.style.removeProperty("--blueprint-mix");
        root.removeAttribute("data-mode");
        root.removeAttribute("data-blueprint-theme");
        applyTheme.current = () => {};
      };
      try {
        viewer = createScrollViewer({
          canvas: canvas.current,
          onError: () => {
            clearMode();
            if (live) setError(true);
          },
          onResize: () => refreshPose(),
        });
        viewer.setObject(buildDisplayGlasses(product, 0));
        root.dataset.blueprintTheme = themeChoice.current;
        const recolor = () =>
          viewer!.setBlueprintTokens(
            readBlueprintTokens(getComputedStyle(root)),
          );
        recolor();
        applyTheme.current = (choice) => {
          themeTween?.kill();
          const previous = readBlueprintTokens(getComputedStyle(root));
          clearThemeOverrides();
          root.dataset.blueprintTheme = choice;
          const next = readBlueprintTokens(getComputedStyle(root));
          if (reducedMotion) {
            recolor();
            return;
          }
          const properties = (tokens: typeof next) =>
            Object.fromEntries(
              BLUEPRINT_TOKENS.map((token) => [
                `--blueprint-${token}`,
                tokens[token],
              ]),
            );
          themeTween = gsap.fromTo(root, properties(previous), {
            ...properties(next),
            duration: 0.2,
            ease: "none",
            onUpdate: recolor,
            onComplete: () => {
              clearThemeOverrides();
              recolor();
              themeTween = undefined;
            },
          });
        };
        const poses = () =>
          resolveScrollPoses(
            viewer!.radius,
            viewer!.aspect,
            viewer!.getAnchor,
            viewer!.explodedRadius,
          );
        const header = document.querySelector<HTMLElement>(".site-header");
        const element = stage.current!;
        const last = SCROLL_ANGLES.length - 1;
        const computeBudget = () =>
          buildMotionBudget(
            poses(),
            viewer!.surfacePoints,
            viewer!.width,
            viewer!.height,
          );
        let budget = computeBudget();
        const seconds = [...budget.seconds];
        const steps = createScrollSteps(
          SCROLL_ANGLES.length,
          () => window.innerHeight,
          false,
          0,
          seconds,
        );
        const pose = { ...poses()[0] };
        let animation: ReturnType<typeof animateScrollStep> | undefined;
        let activeTarget = 0;
        let activeJump = false;
        const stopAnimation = () => {
          animation?.tween.kill();
          animation = undefined;
        };
        let timeline: gsap.core.Timeline;
        const update = () => {
          element.dataset.explode = String(pose.explode);
          root.style.setProperty("--blueprint-mix", String(pose.blueprint));
          root.dataset.mode = pose.blueprint >= 0.5 ? "blueprint" : "studio";
          viewer!.setPose(pose);
          if (header)
            gsap.set(header, {
              autoAlpha: headerOpacity(timeline.time(), last),
            });
        };
        timeline = gsap.timeline({ paused: true, onUpdate: update });
        populateScrollTimeline(timeline, pose, poses(), budget);
        update();
        const land = (index: number) => {
          element.dataset.angle = String(index);
          element.removeAttribute("data-moving");
          setAngle(index);
          steps.handle({
            type: "landed",
            angle: index,
            at: performance.now(),
            time: timeline.time(),
          });
        };
        land(0);
        const startAnimation = (
          target: number,
          jump: boolean,
          velocity = 0,
        ) => {
          activeTarget = target;
          activeJump = jump;
          animation = animateScrollStep(timeline, budget, target, {
            jump,
            velocity,
            onComplete: () => {
              animation = undefined;
              land(target);
            },
          });
          element.dataset.motionDuration = String(animation.plan.duration);
          if (document.hidden) animation.pause();
        };
        refreshPose = () => {
          const time = timeline.time();
          const running = !!animation,
            velocity = animation?.velocity() ?? 0;
          stopAnimation();
          budget = computeBudget();
          seconds.splice(0, seconds.length, ...budget.seconds);
          populateScrollTimeline(timeline, pose, poses(), budget);
          timeline.time(time, false);
          update();
          if (running) startAnimation(activeTarget, activeJump, velocity);
        };

        media.add(
          {
            reduced: "(prefers-reduced-motion: reduce)",
            normal: "(prefers-reduced-motion: no-preference)",
          },
          (context) => {
            reducedMotion = !!context.conditions?.reduced;
            themeTween?.kill();
            clearThemeOverrides();
            recolor();
            gsap.set(document.documentElement, { overflow: "hidden" });
            gsap.set(document.body, { overflow: "hidden" });
            gsap.set(element, { touchAction: "none" });
            const execute = (commands: StepCommand[]) => {
              for (const command of commands) {
                const velocity = animation?.velocity() ?? 0;
                stopAnimation();
                if (command.type === "scrubTo") {
                  element.dataset.moving = "true";
                  timeline.time(command.time, false);
                } else {
                  if (command.type === "cutTo") {
                    timeline.time(command.angle, false);
                    update();
                    land(command.angle);
                  } else {
                    element.dataset.moving = "true";
                    startAnimation(command.angle, command.jump, velocity);
                  }
                }
              }
            };
            const send = (event: StepEvent) => execute(steps.handle(event));
            execute(
              steps.setReduced(!!context.conditions?.reduced, timeline.time()),
            );
            // Normalised deltas come from Observer; raw flags are checked before cancellation.
            const wheel = Observer.create({
              target: window,
              type: "wheel",
              debounce: false,
              preventDefault: true,
              ignoreCheck: (event) => {
                const input = event as WheelEvent;
                return !acceptsStepInput({
                  type: "wheel",
                  at: input.timeStamp,
                  time: timeline.time(),
                  deltaY: input.deltaY,
                  deltaX: input.deltaX,
                  ctrlKey: input.ctrlKey,
                  blocked: blocked(event.target),
                });
              },
              onWheel: (self) => {
                send({
                  type: "wheel",
                  deltaY: self.deltaY,
                  at: self.event.timeStamp,
                  time: timeline.time(),
                });
              },
              onStopDelay: GESTURE_IDLE_MS / 1000,
              onStop: () => {
                send({
                  type: "idle",
                  at: performance.now(),
                  time: timeline.time(),
                });
              },
            });
            const touch = Observer.create({
              target: element,
              type: "touch",
              debounce: false,
              preventDefault: true,
              ignoreCheck: (event) =>
                blocked(event.target) ||
                (event.target instanceof Element &&
                  !!event.target.closest(".v2-demo-theme")) ||
                ("touches" in event &&
                  (event as TouchEvent).touches.length > 1),
              onPress: () => {
                animation?.pause();
                send({
                  type: "touchStart",
                  at: performance.now(),
                  time: timeline.time(),
                });
              },
              onChangeY: (self) => {
                if (!self.isPressed) return;
                send({
                  type: "touchMove",
                  deltaY: -self.deltaY,
                  at: self.event.timeStamp,
                  time: timeline.time(),
                });
              },
              onRelease: (self) => {
                send({
                  type: "touchEnd",
                  cancelled: self.event.type.endsWith("cancel"),
                  at: performance.now(),
                  time: timeline.time(),
                });
                animation?.resume();
              },
            });
            const keydown = (event: KeyboardEvent) => {
              const focus = document.activeElement;
              const input: StepEvent = {
                type: "key",
                key: event.key,
                shiftKey: event.shiftKey,
                at: event.timeStamp,
                time: timeline.time(),
                blocked: blocked(event.target),
                editable: !!focus?.closest(
                  'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
                ),
                interactive: !!focus?.closest(
                  'button, a, [role="button"], [role="link"]',
                ),
              };
              if (!acceptsStepInput(input)) return;
              event.preventDefault();
              send(input);
            };
            const visibility = () => {
              if (document.hidden) animation?.pause();
              else animation?.resume();
            };
            document.addEventListener("keydown", keydown);
            document.addEventListener("visibilitychange", visibility);
            return () => {
              wheel.kill();
              touch.kill();
              stopAnimation();
              document.removeEventListener("keydown", keydown);
              document.removeEventListener("visibilitychange", visibility);
            };
          },
        );
        setReady(true);
        return () => {
          live = false;
          media.revert();
          clearMode();
          refreshPose = () => {};
          timeline.kill();
          element.removeAttribute("data-moving");
          element.removeAttribute("data-angle");
          element.removeAttribute("data-explode");
          element.removeAttribute("data-motion-duration");
          viewer?.dispose();
        };
      } catch {
        media.revert();
        clearMode();
        viewer?.dispose();
        setError(true);
      }
    },
    {
      scope: stage,
      dependencies: [product, error, load.error],
      revertOnUpdate: true,
    },
  );

  const unavailable = error || !!load.error;
  const empty = !product && !load.loading && !load.error;
  return (
    <div
      className="v2-demo-stage"
      ref={stage}
      aria-label="The Ellis scroll preview"
      aria-busy={!ready && !unavailable && !empty}
    >
      <div className="v2-demo-studio" aria-hidden="true" />
      <div className="v2-demo-sheet" aria-hidden="true" />
      {product && !unavailable && (
        <canvas
          ref={canvas}
          role="img"
          aria-label={`3D view of The Ellis in Ink black, shown from ${SCROLL_ANGLES.length} angles as you scroll`}
        />
      )}
      <span className="v2-demo-announcement" aria-live="polite">
        {ready &&
          !unavailable &&
          `Angle ${angle + 1} of ${SCROLL_ANGLES.length}: ${SCROLL_ANGLES[angle].name}${SCROLL_ANGLES[angle].exploded ? ", taken apart" : ""}${SCROLL_ANGLES[angle].blueprint ? ", blueprint" : ""}`}
      </span>
      <div className="v2-demo-theme" role="group" aria-label="Blueprint theme">
        {(["ink", "blue"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            data-theme={choice}
            aria-label={`${choice === "ink" ? "Ink" : "Blue"} blueprint`}
            aria-pressed={theme === choice}
            onClick={() => chooseTheme(choice)}
          />
        ))}
      </div>
      {(unavailable || empty || !ready) && (
        <div className="v2-demo-state" role="status">
          {unavailable ? (
            <>
              <p>The 3D view is unavailable.</p>
              {withLinks && (
                <Link to="/product/the-ellis">Explore The Ellis</Link>
              )}
            </>
          ) : empty ? (
            <>
              <p>This frame is unavailable.</p>
              {withLinks && <Link to="/catalog">Browse the collection</Link>}
            </>
          ) : (
            <p>Loading the frame…</p>
          )}
        </div>
      )}
    </div>
  );
}
