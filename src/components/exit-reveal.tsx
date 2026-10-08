import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { EXIT_BLUR_PX, EXIT_REVEAL_S, EXIT_REDUCED_S } from "@/tryon/scroll-steps";
import "./exit-reveal.css";

// Shared by the offline fallback and the online Shell. Keep the content wrapper
// after completion, but remove its filter class so fixed descendants use the viewport.
export function ExitReveal({
  active,
  children,
  onComplete,
}: {
  active: boolean;
  children: ReactNode;
  onComplete?: () => void;
}) {
  const [revealing, setRevealing] = useState(active);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (active) setRevealing(true);
  }, [active]);
  const complete = () => {
    setRevealing(false);
    const heading = content.current?.querySelector<HTMLElement>("main h1, h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    onComplete?.();
  };
  return (
    <div
      className="exit-reveal"
      style={
        {
          "--exit-reveal-s": `${EXIT_REVEAL_S}s`,
          "--exit-reduced-s": `${EXIT_REDUCED_S}s`,
          "--exit-blur": `${EXIT_BLUR_PX}px`,
        } as CSSProperties
      }
    >
      <div
        ref={content}
        className={
          revealing
            ? "exit-reveal-content is-revealing"
            : "exit-reveal-content"
        }
      >
        {children}
      </div>
      {revealing && (
        <div
          className="exit-reveal-ink"
          aria-hidden="true"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) complete();
          }}
        />
      )}
    </div>
  );
}
