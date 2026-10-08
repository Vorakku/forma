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
import {
  resolveLight,
  resolveScrollPoses,
  SCROLL_ANGLES,
} from "@/tryon/scroll-poses";
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
  EXIT_ZOOM_S,
  EXIT_HOLD_S,
  EXIT_SCALE,
  EXIT_REDUCED_S,
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

// Exploded-angle callouts; sizes come from the reference model's design.json.
const PARTS = [
  { id: "temples", name: "Temples", size: "140 mm", line: "Tapered toward the tip for a light hold behind the ear." },
  { id: "front", name: "Front", size: "52–18", line: "Lens width and bridge, cut square from one piece." },
  { id: "lenses", name: "Lenses", size: "52 × 37 mm", line: "Clear and ready for your prescription." },
];

// Hinge close-up: quality notes rising along the temple. Placeholder claims.
const DETAILS = [
  { name: "Pinned front", line: "Each hinge is riveted through the acetate, not glued on." },
  { name: "Hinge", line: "Built to open and close for years without loosening." },
  { name: "Hand polish", line: "Buffed by hand to a deep, even gloss along the temple." },
];

// Blueprint angle: drafting sheet. Geometry is in px measured at 1808 × 1018
// (centre 904, 509) and mapped onto a 1000-unit square fitted to the shorter
// side, which is how the camera fits the frame. Sizes are design.json estimates.
// ponytail: hand-measured coordinates; project model anchors if the Top view camera changes.
const DRAWING_MAP = "matrix(0.9823 0 0 0.9823 -888 -500)";
const NOTES = [
  { key: "A", head: "Lens 1.2", line: "Centre thickness, 0.8 mm sag.", y: 560, rail: 585, to: [700, 758] },
  { key: "B", head: "Wrap 4", line: "Front curves back toward the hinges.", y: 640, rail: 575, to: [616, 772] },
  { key: "C", head: "Front depth 6", line: "Acetate thickness through the rim.", y: 720, rail: 565, to: [632, 786] },
] as const;
const SHEET = [
  ["Model", "The Ellis"],
  ["Material", "Acetate"],
  ["Finish", "Ink black"],
  ["Size", "52–18–140"],
];

function Dim({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const tick = (x: number, y: number) => `M${x - 4} ${y + 4}L${x + 4} ${y - 4}`;
  return (
    <>
      <line className="bp-dim" x1={x1} y1={y1} x2={x2} y2={y2} />
      <path className="bp-dim" d={tick(x1, y1) + tick(x2, y2)} />
    </>
  );
}

function Ext({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line className="bp-ext" x1={x1} y1={y1} x2={x2} y2={y2} />;
}

function PlanDrawing() {
  return (
    <div className="v2-demo-copy v2-demo-drawing" data-for-angle="2">
      <div className="bp-head">
        <h2>03 — Plan view</h2>
        <p>Looking down on the frame. All dimensions in mm.</p>
        <ol className="bp-list">
          {NOTES.map((note) => (
            <li key={note.key}>
              <span>{note.key}</span>
              {note.head}
            </li>
          ))}
        </ol>
      </div>
      <svg
        viewBox="-500 -500 1000 1000"
        role="img"
        aria-label="Plan view dimensions in millimetres: 131 between temple tips, 140 temple length, 52 lens, 18 bridge, 52 lens, 140 overall width."
      >
        <g transform={DRAWING_MAP}>
          <Ext x1={640} y1={240} x2={640} y2={188} />
          <Ext x1={1167} y1={240} x2={1167} y2={188} />
          <Dim x1={640} y1={196} x2={1167} y2={196} />
          <text className="bp-num" x={903} y={196} dy="-0.5em">131</text>

          <Ext x1={1172} y1={249} x2={1268} y2={249} />
          <Ext x1={1215} y1={745} x2={1268} y2={745} />
          <Dim x1={1260} y1={249} x2={1260} y2={745} />
          <g className="bp-wide">
            <text className="bp-num" x={1276} y={497} dy="0.35em" textAnchor="start">140</text>
            <text className="bp-cap" x={1276} y={497} dy="2.4em" textAnchor="start">TEMPLE</text>
          </g>
          <text className="bp-num bp-narrow" x={1260} y={497} dy="1.1em" transform="rotate(-90 1260 497)">140</text>

          <g className="bp-wide">
            {[653, 866, 940, 1153].map((x) => (
              <Ext key={x} x1={x} y1={800} x2={x} y2={842} />
            ))}
            <Dim x1={653} y1={834} x2={866} y2={834} />
            <Dim x1={866} y1={834} x2={940} y2={834} />
            <Dim x1={940} y1={834} x2={1153} y2={834} />
            <text className="bp-num" x={760} y={834} dy="-0.5em">52</text>
            <text className="bp-num" x={903} y={834} dy="-0.5em">18</text>
            <text className="bp-num" x={1046} y={834} dy="-0.5em">52</text>
          </g>
          <Ext x1={616} y1={800} x2={616} y2={892} />
          <Ext x1={1191} y1={800} x2={1191} y2={892} />
          <Dim x1={616} y1={884} x2={1191} y2={884} />
          <text className="bp-num" x={903} y={884} dy="-0.5em">140</text>
          <text className="bp-cap bp-wide" x={903} y={884} dy="2.2em">OVERALL WIDTH</text>

          <g className="bp-wide">
            {NOTES.map(({ key, head, line, y, rail, to: [tx, ty] }) => (
              <g key={key}>
                <circle className="bp-dim" cx={292} cy={y - 5} r={10} />
                <text className="bp-cap" x={292} y={y - 5} dy="0.35em">{key}</text>
                <text className="bp-head-text" x={312} y={y} textAnchor="start">{head.toUpperCase()}</text>
                <text className="bp-note" x={312} y={y} dy="1.6em" textAnchor="start">{line}</text>
                <polyline className="bp-dim" points={`560,${y - 5} ${rail},${y - 5} ${rail},${ty} ${tx},${ty}`} />
                <circle className="bp-dot" cx={tx} cy={ty} r={2.5} />
              </g>
            ))}
          </g>
        </g>
      </svg>
      <div className="bp-sheet">
        <div className="bp-sheet-title">
          <strong>FORMA — The Ellis</strong>
          <span>Sheet 3 / 5</span>
        </div>
        <dl>
          {SHEET.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
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

export function V2Demo({ onExit }: { onExit: () => void }) {
  const product = useProduct("the-ellis");
  const load = useProductList(["the-ellis"]);
  return (
    <V2Stage
      product={product}
      loading={load.loading}
      loadError={load.error}
      withLinks
      onExit={onExit}
    />
  );
}

// Shown on its own, without the shell, when the store cannot reach the server.
export function OfflineV2Demo({ onExit }: { onExit: () => void }) {
  useEffect(() => {
    document.title = "FORMA V2 Demo — FORMA";
  }, []);
  return <V2Stage product={OFFLINE_ELLIS} loading={false} loadError="" onExit={onExit} />;
}

function V2Stage({
  product,
  loading,
  loadError,
  withLinks = false,
  onExit,
}: {
  product: Product | undefined;
  loading: boolean;
  loadError: string;
  withLinks?: boolean;
  onExit: () => void;
}) {
  const exitCallback = useRef(onExit);
  exitCallback.current = onExit;
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
      let exitTimeline: gsap.core.Timeline | undefined;
      const clearThemeOverrides = () => {
        for (const token of BLUEPRINT_TOKENS)
          root.style.removeProperty(`--blueprint-${token}`);
      };
      const clearMode = () => {
        themeTween?.kill();
        clearThemeOverrides();
        root.style.removeProperty("--blueprint-mix");
        for (const property of ["x", "y", "size", "strength"])
          stage.current?.style.removeProperty("--pool-" + property);
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
          const { pool } = resolveLight(pose.light);
          element.style.setProperty("--pool-x", pool.x + "%");
          element.style.setProperty("--pool-y", pool.y + "%");
          element.style.setProperty("--pool-size", pool.size + "%");
          element.style.setProperty("--pool-strength", String(pool.strength));
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
        // The camera fits the frame to the shorter side; drawing text divides by this to stay px-sized.
        const scaleDrawing = () =>
          element.style.setProperty(
            "--drawing-scale",
            String(Math.min(viewer!.width, viewer!.height) / 1000),
          );
        scaleDrawing();
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
          if (exitTimeline) return;
          const time = timeline.time();
          const running = !!animation,
            velocity = animation?.velocity() ?? 0;
          stopAnimation();
          budget = computeBudget();
          seconds.splice(0, seconds.length, ...budget.seconds);
          populateScrollTimeline(timeline, pose, poses(), budget);
          timeline.time(time, false);
          update();
          scaleDrawing();
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
            const playExit = () => {
              element.dataset.exiting = "true";
              element.dataset.angle = String(last);
              element.removeAttribute("data-moving");
              themeTween?.kill();
              const ink = element.querySelector(".v2-demo-ink");
              exitTimeline = gsap.timeline();
              if (reducedMotion) {
                exitTimeline.to(ink, { opacity: 1, duration: EXIT_REDUCED_S, ease: "none" });
                exitTimeline.call(() => exitCallback.current());
                return;
              }
              const headline = element.querySelector<HTMLElement>(".v2-demo-finale h2")!;
              const origin = element.querySelector<HTMLElement>(".finale-origin")!;
              const glyph = origin.getBoundingClientRect();
              const box = headline.getBoundingClientRect();
              const fontSize = parseFloat(getComputedStyle(origin).fontSize);
              gsap.set(headline, {
                transformOrigin: `${glyph.left + 0.07 * fontSize - box.left}px ${glyph.top + glyph.height / 2 - box.top}px`,
              });
              exitTimeline
                .to(headline, { scale: EXIT_SCALE, duration: EXIT_ZOOM_S, ease: "power3.in" }, 0)
                .to(element.querySelectorAll(".v2-demo-finale .eyebrow, .finale-aside, .v2-demo-finale-foot"),
                  { opacity: 0, duration: 0.4, ease: "none" }, 0.3)
                .to(canvas.current, { opacity: 0, duration: EXIT_ZOOM_S - 0.45, ease: "none" }, 0.45)
                .to(ink, { opacity: 1, duration: EXIT_ZOOM_S - 0.6, ease: "none" }, 0.6)
                .call(() => exitCallback.current(), [], EXIT_ZOOM_S + EXIT_HOLD_S);
            };
            const execute = (commands: StepCommand[]) => {
              for (const command of commands) {
                const velocity = animation?.velocity() ?? 0;
                stopAnimation();
                if (command.type === "exit") {
                  playExit();
                } else if (command.type === "scrubTo") {
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
                  !!event.target.closest(".v2-demo-theme, .finale-cta")) ||
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
                repeat: event.repeat,
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
          exitTimeline?.kill();
          media.revert();
          // The header survives route navigation; discard the demo's inline fade.
          header?.style.removeProperty("opacity");
          header?.style.removeProperty("visibility");
          clearMode();
          refreshPose = () => {};
          timeline.kill();
          element.removeAttribute("data-exiting");
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
      {/* Front view: the headline sits behind the canvas so the frame overlaps it. */}
      {ready && !unavailable && (
        <div className="v2-demo-copy v2-demo-finale" data-for-angle="4">
          <span className="eyebrow">FORMA Eyewear.</span>
          <h2>
            <span>Mad<span className="finale-origin">e</span> to</span>
            <span>be seen</span>
          </h2>
          <div className="finale-aside">
            <em className="serif">The Ellis</em>
            <p>
              Ink black acetate
              <br />
              52–18–140
            </p>
          </div>
        </div>
      )}
      {product && !unavailable && (
        <canvas
          ref={canvas}
          role="img"
          aria-label={`3D view of The Ellis in Ink black, shown from ${SCROLL_ANGLES.length} angles as you scroll`}
        />
      )}
      {ready && !unavailable && (
        <>
          <div className="v2-demo-copy" data-for-angle="0">
            <h1>The Ellis</h1>
            <p className="muted">
              Hand-polished Italian acetate, cut square and softened at every
              edge.
            </p>
          </div>
          {PARTS.map((part, index) => (
            <div
              key={part.id}
              className="v2-demo-copy v2-demo-part"
              data-for-angle="1"
              data-part={part.id}
            >
              <h2>
                0{index + 1} {part.name}
              </h2>
              <span>{part.size}</span>
              <p className="muted">{part.line}</p>
            </div>
          ))}
          <PlanDrawing />
          <div className="v2-demo-copy v2-demo-steps" data-for-angle="3">
            {DETAILS.map((detail, index) => (
              <div key={detail.name} className="v2-demo-part">
                <h2>
                  0{index + 1} {detail.name}
                </h2>
                <p className="muted">{detail.line}</p>
              </div>
            ))}
          </div>
          <div className="v2-demo-copy v2-demo-finale-foot" data-for-angle="4">
            <p>
              <strong>Optical frame</strong>
              <br />
              Rectangle · Acetate · Ink black
            </p>
            {withLinks ? (
              <Link
                className="finale-cta"
                to="/product/the-ellis"
                aria-label="Shop The Ellis"
              >
                →
              </Link>
            ) : (
              <span className="finale-cta" aria-hidden="true">
                →
              </span>
            )}
          </div>
        </>
      )}
      <div className="v2-demo-ink" aria-hidden="true" />
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
