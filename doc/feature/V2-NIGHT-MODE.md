# FORMA V2: night mode

Spec written 2026-10-08. Read [V2-SCROLL-DEMO.md](V2-SCROLL-DEMO.md), [V2-LIGHTING.md](V2-LIGHTING.md) and [V2-BACKDROP-LINES.md](V2-BACKDROP-LINES.md) first. Start after the backdrop lines have landed.

## Why

The owner wants a dark version of the V2 demo, and later a special effect that only exists at night. The reference is `doc/feature/Recording 2026-10-08 145119.mp4`; [recording-frames.png](reference/night-mode/recording-frames.png) shows 16 frames from it. A marble statue sits on a near-black page. A small white dot is the light source: wherever the dot is, that side of the statue lights up and the rest falls into black.

In FORMA the **mouse becomes that dot** in night mode, and it relights the glasses. We have a real 3D model with real lights, so we can relight it for real, where the recording has to fake it on a photo.

The work is in two phases. **This round is Phase 1 only.**

| Phase | What | Status |
|---|---|---|
| 1 | Theme button, dark tokens, the current design shown in dark, and fixes so the glasses read on dark | **This spec** |
| 2 | The cursor is a light dot that relights the frame (the torch) | Outline only, at the end. Don't build. |

## Phase 1: the behaviour

- A round button on the V2 stage switches **day ↔ night** for the whole demo.
- The switch is a **short crossfade, about 300ms**. With reduced motion it switches instantly.
- The choice is stored in `localStorage` (`forma.v2.theme`) and restored on load. The default is **day**. Ignore `prefers-color-scheme` for now; the owner asked for a button.
- **Scope: the V2 demo only.** The theme is a `data-theme="night"` attribute on `<html>`. The demo sets it on mount and **removes it on unmount**, the same way `clearMode()` already cleans up `data-blueprint-theme`. No other page changes.
- Lighting values, poses, copy and the blueprint sheet stay as they are. Night only changes tokens, the lenses and the stage gradient.

## Tokens (`src/pages/v2-demo.css`)

Everything on the stage already draws from the site tokens (`--ink`, `--muted`, `--line`, `--paper`, `--soft`, `--warm`). The backdrop lines use `color-mix` with `--ink`, so they flip on their own. Flip the tokens once:

```css
:root[data-theme="night"] {
  --ink: #ecebe7;
  --muted: #8f8d87;
  --line: #2b2a27;
  --paper: #2a2a28;   /* pool centre: charcoal, so a black frame still reads */
  --soft: #0b0b0a;    /* pool edge: near black */
  --warm: #c98256;
  color-scheme: dark;
}
```

Notes:

- **Why the paper is charcoal, not black.** The Ellis is ink-black acetate. The recording works because the statue is white on black; ours is the reverse. In Phase 1 the frame reads as a **black silhouette on a charcoal light pool**, which fades to near-black at the edges, and the acetate clearcoat adds its reflections on top. Tune `--paper` and `--soft` against screenshots. If the frame still sinks at the Three-quarter angle at 1920 × 945, lighten `--paper` before touching anything in 3D.
- **The exit's paper layer** (`.v2-demo-paper`) uses `--paper`, so at night the zoom-through ends on charcoal. That's correct.
- **The grounding shadow** is a `ShadowMaterial` that darkens. On charcoal it becomes faint. Accept that in Phase 1; the torch phase will revisit it.
- **Hard-coded light colours that need a night override,** scoped to `[data-theme="night"]`:
  - `.site-header` has `background: white` in `styles.css`. On the online route it reveals near the top of the screen at every angle. Override it to `var(--paper)`.
  - The global focus ring is `#8c5535`. Use `var(--warm)` at night so it keeps contrast.
  - `.finale-cta` has white text on `--warm`. Check the contrast with the lighter warm (AA for 1.25rem bold text, 3:1 minimum); darken `--warm` if it fails.
- **Contrast:** check `--muted` body copy against `--soft` and against `--paper` at AA (4.5:1). The copy sits over the pool, so measure where it actually sits in the screenshots.
- **The blueprint angle** keeps its own `--blueprint-*` tokens and is already dark. Don't change it.

## The lenses (`src/tryon/ellis.ts`, `src/tryon/scroll-viewer.ts`)

**This is the main trap.** The display lenses use `transmission: 1`. Three.js 0.186 clears the transmission buffer to **white at 50% alpha** whenever the canvas is transparent (`node_modules/three/build/three.module.js:18093`: `if ( _currentClearAlpha < 1 ) _this.setClearColor( 0xffffff, 0.5 )`). Our canvas is transparent so the CSS backdrop shows through. That is why the lenses look milky white in day mode, and at night they would **glow**.

Fix, at night only:

- **Switch the glass to the existing overlay recipe** in `buildEllis` (the `overlay` branch: no transmission, `transparent`, `opacity: 0.1`, clearcoat, `depthWrite: false`). Then the CSS backdrop and lines show through the lens as real clear glass would show them.
- Add `setTheme(theme: "day" | "night")` to `createScrollViewer`. It finds the lens material (the one with `transmission > 0` in day mode, shared by both lenses), sets the night or day property values, sets `material.needsUpdate = true`, bumps `renderRevision` and renders.
  - Changing `transmission` triggers one shader recompile on the first switch. That's fine.
  - Keep the day values exactly as they are now: day lighting is locked.
- **Don't rebuild the model** on a theme change; `setObject` is expensive and resets the anchors.
- Apply the stored theme right after `setObject`, before the first render, so a night reload never flashes white lenses.

## The button (`src/pages/v2-demo.tsx`, `v2-demo.css`)

- A 44 × 44px round icon button with a 1px `--line` border on `--paper`, and an `--ink` icon. Use `Moon` in day mode and `Sun` at night, from `lucide-react` (already a dependency), 18px, stroke 1.5.
- Give it `aria-pressed={night}` and a constant `aria-label="Night mode"`. Its focus ring follows the existing button focus style.
- **Placement (updated by the owner on 2026-10-08):** bottom-left of the stage, inset 24px from the left and bottom, respecting larger safe-area insets. Use the same position on the offline demo. The finale footer reserves space beside the button.
- **Hide it on the blueprint angle** with the existing `:root[data-mode="blueprint"]` hook, the same way the swatches are shown. The blueprint looks the same in both themes, and this keeps the narrow blueprint title sheet in the top-right corner free.
- Exclude it from scroll and gesture capture the same way `.v2-demo-theme` and `.finale-cta` are (`event.target.closest(...)`, around `v2-demo.tsx:568`).
- After implementing, check every angle at the four test viewports. **If the button overlaps any copy, move the copy, not the button**, and list what you moved in the result.

## The fade

Use the **View Transitions API**; it's native, so no tween is needed:

```ts
const switchTheme = (next: Theme) => {
  const apply = () => {
    flushSync(() => setTheme(next));        // aria-pressed + icon
    root.dataset.theme = next;              // tokens
    viewer?.setTheme(next);                 // lenses, renders synchronously
  };
  if (reducedMotion || !document.startViewTransition) apply();
  else document.startViewTransition(apply);
};
```

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 300ms;
}
```

- The snapshot includes the WebGL canvas, so the glasses crossfade together with the page.
- Ignore the button while a transition is running.
- Ignore it during the exit (`data-exiting`).
- Browsers without the API switch instantly. That's acceptable.

## Tests

`e2e/v2-scroll.spec.ts`:

- Clicking the button sets `data-theme="night"` on `<html>`, flips `aria-pressed`, and survives a reload (from `localStorage`).
- Leaving the demo (exit to `/`) removes `data-theme`, and the home page renders with the day tokens.
- On the blueprint angle the button is hidden. On the other angles it can be focused and clicked without changing the angle.
- At night, the stage background is computed from the night tokens: read `getComputedStyle(document.documentElement).getPropertyValue("--paper")`.
- The existing still-frame screenshot equality checks pass in both themes.

`tests/` (unit): `setTheme("night")` then `setTheme("day")` restores the lens material's original `transmission`, `opacity`, `transparent` and `depthWrite`.

Save review screenshots to `doc/feature/screenshots/v2-night-mode/`:

- Every angle in **night** at 1920 × 945, 1440 × 900, 1024 × 768 and 375 × 812.
- Angle 0 in **day and night** at 1920 × 945, side by side, so the owner can compare.

## Constraints

- No new dependencies.
- No change to the day appearance. The day screenshots must match the current ones, apart from the button.
- No change to `scroll-poses.ts` light values, the tone mapping, the environment or the blueprint.
- No hard-coded colours outside the night token block.
- No horizontal scroll, and touch targets of at least 44px.
- Don't build any of Phase 2.

## Done when

- One click crossfades the whole V2 demo between day and night in about 300ms. The choice persists and doesn't leak to other pages.
- At night, the frame reads clearly against the charcoal pool at every angle, the lenses look like clear glass (no white glow), and all copy passes AA.
- The tests pass, the screenshots are saved, and a short **Implementation result** section is appended here with the final token values and anything that was moved.

## Phase 2 outline: the torch (don't build yet)

This is here so Phase 1 doesn't block Phase 2.

- At night on a fine pointer, the cursor is hidden over the stage and replaced by a **small glowing dot**, like the one in the recording. On touch screens, the light follows the finger while dragging, or a slow automatic sweep tied to scroll progress.
- The dot drives a **point light (or spot light)** in front of the frame. Its screen position is unprojected onto a plane slightly in front of the frame, and it follows with a little lag (a spring), so it feels physical.
- At night the per-angle key light, the hemisphere light and the environment drop to a low floor. The frame then shows **only where the torch hits**: highlights run along the rims, the bridge and the temples, and the rest stays black. The light pool in CSS follows the dot too.
- The scroll angles still work as they do now. The torch is extra, on top of them.
- With reduced motion there's no lag and no automatic sweep; the light simply sits where the pointer is.
- Open questions for the owner: dot size and colour (warm or neutral), whether the torch also lights the backdrop lines, and a resting position when the pointer leaves the stage.

## Implementation result

Implemented Phase 1 on 2026-10-08, after backdrop commit `1b4fedf`. Phase 2's result is recorded below. The 44px Moon/Sun control is now **bottom-left, inset 24px from the left and bottom with safe-area support**, per the navbar/button update below; the earlier right/top placement is obsolete. It hides on blueprint, ignores wheel/touch capture, persists `forma.v2.theme`, and crossfades the page and canvas with native View Transitions over 300ms. Reduced motion and unsupported browsers switch immediately. Transition/exit clicks are ignored, and unmount cancels a pending transition and removes the root theme.

Final night tokens:

| Token | Value |
|---|---|
| `--ink` | `#ecebe7` |
| `--muted` | `#8f8d87` |
| `--line` | `#2b2a27` |
| `--paper` | `#262624` |
| `--soft` | `#141412` |
| `--warm` | `#c98256` |

Only the pool tokens were tuned: paper is slightly darker to make the supplied muted token AA (4.57:1), and the edge is raised enough to separate black temples from the surround while retaining a dark pool. The shared Ellis overlay glass recipe is used at night (zero transmission, opacity 0.1, clearcoat and no depth write). Day restores every saved material property; the model and anchors are reused. Stored night is applied before the first render. Lights, tone mapping, environment and blueprint values are unchanged.

**Copy and button clearance:** no stage copy moved. The desktop header is actually 138px tall including its navigation row, so the button uses z-index 21 to sit above it and below the exit paper. At 1024 × 768, “FORMA V2 DEMO” in the navigation overlapped the button. While the demo theme is mounted, the 761–1100px navigation reserves an 84px right margin and uses 18px gaps; this moves the navigation copy clear in both day and night. Other routes recover the existing layout when the root attribute is removed. All five angles were checked at the four requested sizes, with no remaining button/copy overlap or horizontal overflow.

**Contrast fixes:** token-only checks missed brighter linework and a temple reflection behind body copy. Night body copy and the finale aside now use `color-mix(in srgb, var(--muted) 55%, var(--ink))`; the original tokens are unchanged, as are day and blueprint text. Samples from the rendered background under visible body/accent rectangles (2px grid, text hidden, WebGL, linework and portrait fade preserved) have a minimum **4.60:1** across every review capture. Ink on paper is 12.71:1, muted on paper/edge is 4.57/5.56:1, warm on paper is 4.92:1, and the unchanged Ink blueprint's secondary text on its sheet is 5.67:1. The CTA uses `var(--soft)` on warm at 5.98:1, and the night focus ring uses warm without changing blueprint focus styling.

**Screenshots:** [screenshots/v2-night-mode/](screenshots/v2-night-mode/) contains all five night angles at 1920 × 945, 1440 × 900, 1024 × 768 and 375 × 812, plus angle 0 in day and its [day/night comparison](screenshots/v2-night-mode/1920x945-angle-0-day-vs-night.png). These final captures show the online header where applicable; offline button placement was also checked at localhost:4175. `contrast-checks.json` records background samples, and `day-comparison.json` records comparison with pre-theme online captures at 1920 × 945. Outside the button area, day angles 0/2/3 match exactly; angles 1/4 differ by at most one 8-bit channel level in software WebGL (no differences greater than one).

**Verification:** Node 24.18.0; **98/98 unit tests pass**, typecheck and build pass. Final V2 scroll E2E results will be recorded when the full run finishes.


## Navbar and button placement update — 2026-10-08

The owner requested that the navbar fade out on entry and reveal when the mouse approaches the top, and that the day/night control move to the bottom-left. The toggle now uses a 24px bottom/left inset with safe-area support. The finale footer starts at 88px to clear the control. The mobile hinge copy has at least 88px of bottom padding so its final note clears the button. The owner also requested removing the last-angle arrow button; both its online link and offline decoration are removed. The earlier tablet navigation margin workaround is removed. The navbar reveal works at every angle and retains keyboard and touch access.

## Implementation result (Phase 2)

Implemented on 2026-10-09 on `task/v2-night-torch`, branched from main `357ba31`. This completes the torch outline; its original “don't build yet” wording belongs to the Phase 1 brief.

**Light choice:** a shadowless **PointLight** added to the V2 studio scene by `src/tryon/night-torch.ts`. An omnidirectional source gives moving specular highlights on rims, bridge, rivets and exploded temples without a spotlight cone or target tracking. The low studio floor leaves unlit acetate near black. The light is invisible and has zero intensity when fully inactive, so it is excluded from day/blueprint shader lighting. The shared shop studio, environment, tone mapping, pose table and directional-shadow dirty logic are unchanged.

**Projection and motion:** the screen target is unprojected onto a camera-facing plane through the assembled model's centre, offset toward the camera. Its normal and ray are recomputed from the current camera on every render, including scroll and resize renders after the spring has settled. The initial 4-unit offset was inside/behind the front rim and read too dim; the final 10-unit offset puts the source ahead of it. Screen-space spring coordinates are reprojected each frame so scroll cannot leave the light on an old camera plane. Vector, raycaster and plane scratch objects are reused.

All tuning is grouped in the exported `TORCH` object at the top of **`src/tryon/night-torch.ts`**:

| Constant | Final value |
|---|---|
| `dotSize` / `dotColor` | `10px` / `#fff4e8` |
| `haloSize` / `haloOpacity` / `haloStop` | `40px` / `0.35` / `70%` radial-gradient stop |
| `lightColor` / `intensity` | `#fff4e8` / `500` |
| `distance` / `decay` | `36` studio units / `2` |
| `planeOffset` | `10` studio units (centimetres), toward the camera |
| `stiffness` / `damping` | `180` / `26` |
| `positionEpsilon` / `velocityEpsilon` | `0.0001` / `0.001`, normalized screen coordinates |
| `maxFrameSeconds` / `springStepSeconds` / `initialFrameSeconds` | `0.05` / `1/120` / `1/60` seconds |
| `fadeSeconds` | `0.3` seconds; instant with reduced motion |
| `keyFloor` / `hemisphereFloor` / `environmentFloor` | per-angle value × `0.025` / `0.02` / `0.04` |
| `sweepAmplitudeX` / `sweepAmplitudeY` | `0.18` / `0.06` of stage width/height |
| `sweepRadiansPerAngle` / `sweepYFrequency` | `π/2` / `0.5` |

**Behaviour:** active only at night, while visible, outside blueprint (`blueprint < 0.5`, matching `data-mode`) and outside exit. Studio intensities and torch intensity crossfade together on activation/deactivation; resolved per-angle values are restored exactly at the inactive endpoint. Hiding the document cancels pending frames, hides the decoration and immediately restores lighting. Unmount removes the light/listeners, cancels pending frames and restores the cursor. Leaving night removes input listeners immediately and finishes the outgoing floor fade on demand.

On fine pointers, the 10px DOM dot uses event coordinates directly and `translate3d`: **the cursor has no spring lag**. Only the light lags. The dot is `aria-hidden`, ignores pointer events, and is hidden over interactive controls, links, headers/nav and dialogs. `--pool-x` / `--pool-y` use the same target in the render tick; CSS backdrop lines remain CSS. Leaving the stage hides the dot and springs the light back to `resolveLight(pose.light).pool`. Passive touch listeners read a single finger without cancelling events or changing existing scroll capture. Without a finger, coarse pointers use a sine sweep driven exclusively by `pose.light`, so a stationary stage never animates by itself. Reduced motion cuts directly to the fine-pointer target and uses the resting pool on touch, without a sweep. The rAF loop stops when both spring and floor fade settle; torch ticks bump `renderRevision` without dirtying the key shadow.

**Verification (focused, per AGENTS.md):**

- `tests/viewer.test.mjs`: **40/40 pass**, including the three new torch tests for camera-plane unprojection, spring settling/reduced motion, and floor/rAF lifecycle. The floor test checks exact day/blueprint/exit/hidden restoration, fractional light values, no shadow refresh from torch ticks, and frame/light cleanup. Existing lens restoration, blueprint cache, shadow, fit and exit tests in this affected file also pass. After the final day-render optimization, the relevant eight-test subset was rerun: **8/8 pass**.
- Typecheck passes using Node **24.18.0**. The machine's default shell resolves an older Node, so verification invoked `D:/SDK/Node/nodejs/node.exe` explicitly.
- `e2e/v2-scroll.spec.ts`, `--grep "torch"`: **5/5 pass** with `CAPTURE_TORCH=1` and `COMPARE_TORCH_MAIN=1`, using `playwright.torch.config.ts`. These cover exact dot coordinates, control cursors, day/blueprint suppression, night exit cleanup, stationary frames and reversible scroll, passive touch scrolling/reduced motion, owner captures and comparison against main.
- The sibling `../server` is absent. The focused configuration runs the existing **offline V2 demo** with Chromium/SwiftShader, rather than the server-backed commerce suite. The normal-motion test exercises the native theme transition and light settling. The full unit suite, full server-backed E2E suite and production build were **not run**.
- At 1920 × 945 against main `357ba31`, day angles **0/1/2/3 are byte-identical**, and the **night blueprint is byte-identical**. Front has **105 differing pixels**, each at most **one 8-bit channel level**, in the final SwiftShader comparison; there are no differences greater than one. This is recorded honestly in [main-comparison.json](screenshots/v2-night-torch/main-comparison.json), not reported as exact pixel equality for Front. Day uses the original lighting and materials throughout, with no active torch light.

**Owner screenshots:** [screenshots/v2-night-torch/](screenshots/v2-night-torch/) contains **12 night stills at 1920 × 945**: Three-quarter, Side, Hinge and Front, each with the pointer at upper-left, centre and lower-right frame regions. Stills use reduced motion to capture the exact settled target. [reference-comparison.png](screenshots/v2-night-torch/reference-comparison.png) compares actual recording frames at **0.71s / 3.06s** with opposite Front light positions; the supplied recording contact sheet was also reviewed. The screenshot folder's [README](screenshots/v2-night-torch/README.md) lists positions and reproduction commands.

**Left for owner review:** final visual tuning and the feel of the slight light lag on a hardware-accelerated browser, especially the broader macro Hinge highlight, plus online header/nav hover behaviour with the server available. The screenshots show genuine moving 3D highlights while the opposite rim/temple stays black; glossy black acetate responds differently from the white marble reference. The Moon/Sun control remains bottom-left; the stale Phase 1 placement line above is corrected.
