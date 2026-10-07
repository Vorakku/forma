import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useProduct, useProductList } from "@/lib/store";
import { buildDisplayGlasses } from "@/tryon/glasses";
import { createScrollViewer } from "@/tryon/scroll-viewer";
import { populateScrollTimeline } from "@/tryon/scroll-timeline";
import {
  resolveScrollPoses,
  HOLD_DURATION,
  SCROLL_LENGTH_VH,
  TIMELINE_DURATION,
  stillPoseIndex,
} from "@/tryon/scroll-poses";
import "./v2-demo.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// The header fades out as the first scroll starts the animation and returns
// at the end of the final hold, after the last angle settles.
const HEADER_FADE = (HOLD_DURATION * 0.4) / TIMELINE_DURATION;

function headerOpacity(scroll: number, pin: ScrollTrigger) {
  const fade = (pin.end - pin.start) * HEADER_FADE;
  // The page can end a pixel or two before the pin; finish the return there.
  const returnTo = Math.min(pin.end, ScrollTrigger.maxScroll(window));
  const leaving = 1 - (scroll - pin.start) / fade;
  const returning = 1 - (returnTo - scroll) / fade;
  return gsap.utils.clamp(0, 1, Math.max(leaving, returning));
}

export function V2Demo() {
  const product = useProduct("the-ellis");
  const load = useProductList(["the-ellis"]);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useGSAP(
    () => {
      if (!product || !canvas.current || error || load.error) return;
      setReady(false);
      let viewer: ReturnType<typeof createScrollViewer> | undefined;
      let refreshPose = () => {};
      let live = true;
      const media = gsap.matchMedia();
      try {
        viewer = createScrollViewer({
          canvas: canvas.current,
          onError: () => {
            if (live) setError(true);
          },
          onResize: () => refreshPose(),
        });
        viewer.setObject(buildDisplayGlasses(product, 0));
        const poses = () =>
          resolveScrollPoses(viewer!.radius, viewer!.aspect, viewer!.getAnchor);
        const header = document.querySelector<HTMLElement>(".site-header");
        const range = () =>
          `+=${(window.innerHeight * SCROLL_LENGTH_VH) / 100}`;

        media.add(
          {
            reduced: "(prefers-reduced-motion: reduce)",
            normal: "(prefers-reduced-motion: no-preference)",
          },
          (context) => {
            let pin: ScrollTrigger;
            if (context.conditions?.reduced) {
              const update = (progress: number) =>
                viewer!.setPose(
                  poses()[stillPoseIndex(progress * TIMELINE_DURATION)],
                );
              pin = ScrollTrigger.create({
                trigger: stage.current,
                start: "top top",
                end: range,
                pin: true,
                onUpdate: (self) => update(self.progress),
                onRefresh: (self) => update(self.progress),
              });
              refreshPose = () => update(pin.progress);
              update(pin.progress);
            } else {
              const pose = { ...poses()[0] };
              const timeline = gsap.timeline({
                paused: true,
                onUpdate: () => viewer!.setPose(pose),
              });
              populateScrollTimeline(timeline, pose, poses());
              viewer!.setPose(pose);
              refreshPose = () => {
                const progress = timeline.progress();
                populateScrollTimeline(timeline, pose, poses());
                timeline.progress(progress, true);
                viewer!.setPose(pose);
              };
              pin = ScrollTrigger.create({
                trigger: stage.current,
                start: "top top",
                end: range,
                pin: true,
                scrub: 1,
                animation: timeline,
              });
            }
            // Created after the pin so its refresh reads the pin's updated range.
            const fadeHeader = (self: ScrollTrigger) =>
              header &&
              gsap.set(header, {
                autoAlpha: headerOpacity(self.scroll(), pin),
              });
            ScrollTrigger.create({
              start: 0,
              end: "max",
              onUpdate: fadeHeader,
              onRefresh: fadeHeader,
            });
            return () => {
              refreshPose = () => {};
              if (header)
                gsap.set(header, { clearProps: "opacity,visibility" });
            };
          },
        );
        const visibility = () => {
          // Freeze the scrub tween while hidden; resume toward the current scroll on return.
          const trigger = ScrollTrigger.getAll().find(
            (item) => item.trigger === stage.current,
          );
          if (document.hidden) {
            trigger?.getTween()?.pause();
          } else {
            trigger?.update();
            trigger?.getTween()?.play();
          }
        };
        document.addEventListener("visibilitychange", visibility);
        setReady(true);
        return () => {
          live = false;
          document.removeEventListener("visibilitychange", visibility);
          media.revert();
          viewer?.dispose();
        };
      } catch {
        media.revert();
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
      {product && !unavailable && (
        <canvas
          ref={canvas}
          role="img"
          aria-label="3D view of The Ellis in Ink black, shown from five angles as you scroll"
        />
      )}
      {(unavailable || empty || !ready) && (
        <div className="v2-demo-state" role="status">
          {unavailable ? (
            <>
              <p>The 3D view is unavailable.</p>
              <Link to="/product/the-ellis">Explore The Ellis</Link>
            </>
          ) : empty ? (
            <>
              <p>This frame is unavailable.</p>
              <Link to="/catalog">Browse the collection</Link>
            </>
          ) : (
            <p>Loading the frame…</p>
          )}
        </div>
      )}
    </div>
  );
}
