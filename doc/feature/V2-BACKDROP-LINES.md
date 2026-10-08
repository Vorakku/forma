# FORMA V2: backdrop linework

Spec written 2026-10-08. Read [V2-SCROLL-DEMO.md](V2-SCROLL-DEMO.md) and [V2-LIGHTING.md](V2-LIGHTING.md) first. Start this only after the finale exit round 2 ([V2-FINALE-EXIT-R2.md](V2-FINALE-EXIT-R2.md)) has landed, because both touch the stage markup in `src/pages/v2-demo.tsx`.

## Background

Today the studio angles sit on plain paper: `.v2-demo-studio` is a radial light pool from `--paper` to `--soft`, and nothing else ([current.png](reference/backdrop-lines/current.png)). It looks clean but empty, like a product shot on a sweep.

The owner wants the look of [target.png](reference/backdrop-lines/target.png): the same paper and light pool, with a layer of **very faint, thin geometric linework** behind the glasses. Think of a draughtsman's construction lines left on the sheet. [target-linework.png](reference/backdrop-lines/target-linework.png) is the same image with the lines boosted and pixel rulers added; all measurements below come from it.

What the reference contains:

| Element | Look |
|---|---|
| Panel rules | 4 full-height verticals and 4 short horizontals. Together they suggest a loose grid of panels. One vertical stops above the frame and starts again below it. |
| Two large circles | Both partly behind the frame. One is centred left of the frame, the other right of it and lower. |
| Long diagonals | 6 straight lines crossing the sheet. Two of them meet in a **V** whose point is the corner of the right-hand panel, just above the right lens. |
| Marks | Two small `+` crosshairs, a dotted vertical, and small dark dot groups: 3 in a row, 2 in a column, 4 in a column, and 1 on its own. |

Measured tone on the ~`#f8f6f4` paper: the rules are only **7–14 levels darker** than the paper, and the circles and diagonals are fainter still. The dots are close to `#525250` and the crosses close to `#8e8e8c`. All strokes are 1px. **The lines should almost disappear at a glance**, and the dark dots are the only things that read clearly.

Two things in the reference are **out of scope**: the soft diagonal window light top right (lighting is locked, see V2-LIGHTING round 3), and the `EYEWEAR ——` eyebrow above the title (that's a copy change, so ask the owner separately).

## The layer

One static inline SVG, with no JS, no animation and no per-frame updates.

### Placement (`src/pages/v2-demo.tsx`)

Put it directly **after** `.v2-demo-studio` and **before** `.v2-demo-sheet`:

```tsx
<div className="v2-demo-studio" aria-hidden="true" />
<BackdropLines />
<div className="v2-demo-sheet" aria-hidden="true" />
```

That order solves the other angles for free:

- **Blueprint (angle 2):** the sheet is opaque at `--blueprint-mix: 1` and sits above the lines, so the lines fade out exactly as the studio does. Don't add an opacity rule.
- **Canvas, grounding shadow, all copy and the finale headline** come later in the DOM, so they paint over the lines. The shadow darkens the lines under it, which is correct.
- **Exit:** `.v2-demo-paper` (z-index 30) covers the lines at the end of the dolly. The lines stay still during the dolly, just like the light pool. Treat the backdrop as "at infinity".

`BackdropLines` is a small component in the same file that returns the SVG below. Don't create a new file for it.

### Coordinates

The SVG uses the same convention as the blueprint drawing (`.v2-demo-drawing`): `viewBox="-500 -500 1000 1000"` with the default `xMidYMid meet`. **1000 units is the stage's shorter side (100cqmin), and (0, 0) is the stage centre.** The camera's "fit" distance also scales with the shorter side, so the linework keeps its relation to the frame at every viewport. On wide screens, extra lines show at the sides through `overflow: visible`. On phones the outer marks fall off-screen, which is intended.

The values below were mapped from the reference by aligning its frame with the live Three-quarter frame. At 1920 × 945 the live frame's centre is about (−23, +40) units. Everything listed here already accounts for that offset.

```tsx
const BackdropLines = () => (
  <svg className="v2-demo-lines" viewBox="-500 -500 1000 1000" aria-hidden="true" focusable="false">
    <g className="lines-rule">
      <path d="M-778 -2500V2500 M626 -2500V2500 M711 -2500V2500 M40 -2500V-64 M40 215V2500" />
      <path d="M-778 -185H-462 M-778 -17H-391 M40 -64H2500 M40 215H2500" />
    </g>
    <g className="lines-faint">
      <circle cx="-164" cy="-37" r="478" />
      <circle cx="215" cy="110" r="555" />
      <path d="M-3484 2070L1962 -2803 M-3484 -1083L2451 1538 M-2364 2274L3375 -1950" />
      <path d="M-2460 -1805L40 -64L2540 -2529 M-2875 1516L-375 50" />
    </g>
    <g className="lines-mark">
      <path d="M-871 -345h18 M-862 -354v18 M519 274h18 M528 265v18" />
      <path className="lines-dotted" d="M-862 -221V10" />
    </g>
    <path
      className="lines-dot"
      d="M-750 -45h0 M-727 -45h0 M-704 -45h0 M668 -439h0 M668 -414h0 M768 64h0 M768 87h0 M768 110h0 M768 133h0 M-149 325h0"
    />
  </svg>
);
```

Map from the reference (in reference px, 1710 × 920):

| Element | Reference | Units |
|---|---|---|
| Vertical rules | x = 189, 942, 1481, 1559 | x = −778, 40, 626, 711 |
| Gap in the x = 40 rule | y 462 → 719 | y −64 → 215 |
| Short horizontals | y 351 (x 190→480), y 505 (x 190→545) | y −185, −17 |
| Long horizontals | y 462 and 719, from x 942 to the edge | y −64, 215 |
| Circle A | centre (754, 487), r 440 | (−164, −37), r 478 |
| Circle B | centre (1103, 622), r 511 | (215, 110), r 555 |
| V of diagonals | point at the panel corner (942, 462) | (40, −64) |
| Crosses | (112, 204), (1391, 773) | (−862, −345), (528, 274) |

[spec-mockup.png](reference/backdrop-lines/spec-mockup.png) shows exactly this SVG and the CSS below, multiplied over `current.png` at 1920 × 945. It's a flat overlay, so the lines draw over the glasses; in the app the canvas covers them.

The circle fits are approximate: B is only partly visible in the reference. Keep the numbers unless a screenshot shows a clear mismatch. Don't trace the reference pixel by pixel; it's a direction, not a drawing to copy.

### Styling (`src/pages/v2-demo.css`)

```css
.v2-demo-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  fill: none;
}
/* 1 CSS px at every scale; the dot sizes are px too. */
.v2-demo-lines * {
  vector-effect: non-scaling-stroke;
}
.lines-rule {
  stroke: color-mix(in srgb, var(--ink) 7%, transparent);
}
.lines-faint {
  stroke: color-mix(in srgb, var(--ink) 5%, transparent);
}
.lines-mark {
  stroke: color-mix(in srgb, var(--ink) 45%, transparent);
}
.lines-dotted {
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-dasharray: 0 8;
}
.lines-dot {
  stroke: color-mix(in srgb, var(--ink) 70%, transparent);
  stroke-width: 5;
  stroke-linecap: round;
}
```

The dots are zero-length subpaths with round caps, so each one is a 5px dot whatever the viewport. Their **spacing** is in units, so it shrinks slightly on smaller screens. That's fine.

**The four percentages are the tuning knobs.** Compare a screenshot against `target.png` at 1920 × 945 and adjust only those. The target is for the rules to read about as strongly as in the reference, and for the circles and diagonals to read slightly weaker.

## Per-angle behaviour

| Angle | Result |
|---|---|
| 0 Three-quarter | Matches the reference composition. |
| 1 Side three-quarter (exploded) | Same lines. Check the part labels stay readable over them. |
| 2 Top (blueprint) | Hidden under the sheet, which has its own grid. |
| 3 Hinge detail | Same lines behind the close-up. Check the step notes and the portrait fade (`.v2-demo-steps` background) still read cleanly. |
| 4 Front finale | Behind the headline. Check no line runs through a glyph in a way that reads as a strike-through. If one does, report it; don't move the line per angle in this round. |

The lines stay still between angles. A per-angle drift (parallax with the camera orbit) is a possible round 2, so don't build it now.

## Tests

In `e2e/v2-scroll.spec.ts`:

- `.v2-demo-lines` exists, is `aria-hidden`, and comes after `.v2-demo-studio` and before `.v2-demo-sheet` and the `canvas` in DOM order.
- The existing "still frames are identical" screenshot checks keep passing (the layer is static).

Save review screenshots to `doc/feature/screenshots/v2-backdrop-lines/` for every angle at **1920 × 945, 1440 × 900, 1024 × 768 and 375 × 812**, plus one at angle 0 at 1920 × 945 placed next to `target.png`.

## Constraints

- No new dependencies, no canvas or Three.js work, and no change to `scroll-poses.ts`, `scroll-viewer.ts` or any lighting values.
- No JS beyond the static component. Nothing animates, so no reduced-motion handling is needed.
- Use only existing colour tokens (`--ink`, through `color-mix`). Don't hard-code hex values.
- No horizontal scroll at any viewport. The stage already has `overflow: hidden`; keep it that way.
- Don't change the copy, the light pool or the blueprint sheet.

## Done when

- At angle 0, 1920 × 945, the stage reads like `target.png` with the same light paper: faint panel rules, two circles, the V of diagonals pointing at the right panel corner, crosshairs and dark dot groups.
- The lines are gone on the blueprint angle and covered at the end of the exit.
- No copy on any angle loses legibility at the four test viewports.
- The tests pass, and the screenshots are saved for owner review.

## Implementation result

Implemented 2026-10-08. One static SVG sits between the studio pool and blueprint sheet; the canvas, copy and exit paper paint above it. Final ink percentages: rules **6%**, faint circles/diagonals **5%**, crosshairs/dotted rule **46%**, dots **74%**.

On Hinge (angle 3), the four-dot column at x=768 collided with “03 HAND POLISH” at 1920 × 945, and the crosshair centred at (528, 274) collided with “02 HINGE” at 1024 × 768. Both are separate paths with the class `lines-hinge-collision`, hidden only by `.v2-demo-stage[data-angle="3"]`. Coordinates, other lines and copy are unchanged. The four angle-3 screenshots were retaken and reviewed.

Verification: Node 24.18.0; **95/95 unit tests pass**, typecheck and build pass. The repository's configured V2 e2e command failed before tests while launching its web server (`cmd.exe ENOENT`); `../server` is also absent. The full unchanged V2 suite plus the mark visibility test ran in Chrome/SwiftShader against a temporary local API fixture: **16 passed, 1 motion stopwatch failure** (2.0145 s against a 1.9435 s limit). The unchanged stopwatch passed when retried alone at both desktop and phone sizes: **1/1 passed**. All 17 cases have passing results; the initial timing failure is recorded here rather than hidden. The fixture does not validate the missing commerce backend.

Review captures: [screenshots/v2-backdrop-lines/](screenshots/v2-backdrop-lines/), all five angles at 1920 × 945, 1440 × 900, 1024 × 768 and 375 × 812, plus the angle-0 comparison with the target.
