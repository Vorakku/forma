# FORMA V2: wearer-perspective finale exit

Wearer-perspective exit implemented 2026-10-08, then corrected after owner review to keep the whole-frame zoom centred and restore immediate text zoom. The round-2 nose-gap move and its captures are retained below as history. Read [V2-SCROLL-DEMO.md](V2-SCROLL-DEMO.md) first, especially its **Copy** section.

## Background

The last angle (4, Front) ends on the two-line headline "MADE TO / BE SEEN", rendered before the canvas so the frame lies across it. Its eyebrow, italic *The Ellis* aside and bottom spec line are already laid out. The finale arrow was removed in the preceding navbar revision. The reference remains [the 7-second hero-slider recording](e9c2d2ccb882e4436fc80b681f3b4412.mp4).

The historical round-2 review replaced the headline-only zoom with a camera move into the design: the glasses and copy grow together toward the nose gap. The shot ends on paper and reveals the destination. The move is a reversible, scrubbable sixth timeline position until it lands on 5.

## Approved wearer-perspective exit — implemented

> Implemented from the approved “Proposed next iteration — wearer-perspective exit” direction. This supersedes the historical round-2 **zoom target** and **move** below, while retaining the sixth timeline position, input/commit rules, destination wiring, and reduced-motion behavior.

### Current review correction

The latest owner review supersedes two details of the initial approval: the push stays on the frame symmetry plane instead of translating to the right lens, and editorial copy grows from the start instead of fading. The clear opening below the bridge is the crossing target. The camera orbit, wearer view, reversible timeline and paper/destination behavior remain. The original lens-only crossing and early copy fade are superseded.

### Intent

Change the final gesture from a camera merely rushing through the product to a concise point-of-view story:

**See the glasses → put them on → see through them.**

From the landed Front view, the camera should travel around the wearer’s right side of the frame and settle just behind it, looking outward through the lenses as though the visitor is wearing The Ellis. It then advances straight through the clear central opening below the bridge and resolves to the existing paper endpoint/destination reveal.

The result should feel like a single deliberate product-camera move, not a 180° model spin followed by an unrelated zoom.

### Required choreography

The existing exit scalar remains `u ∈ [0, 1]` on timeline segment `[4, 5]`, and the segment remains fully reversible until it lands on 5.

| Progress | Camera / scene action | Copy / surface treatment |
|---|---|---|
| `0 → ~0.35` | Starting from the exact landed Front pose, arc the **camera** clockwise around the model’s right hinge/temple while slowly approaching from the start of the turn (owner review correction). End behind the frame, close to the wearer’s eye position, looking forward through the lenses. Preserve a natural, level horizon. | The headline, eyebrow and aside remain opaque and enlarge from the screen centre from the first increment (`scale = 40^u`). They remain a flat front-plane layer and do not orbit. Stationary chrome/header fade behavior is unchanged. |
| `~0.35 → ~0.8` | From the wearer pose, dolly forward along the centred sight line through the clear opening below the bridge, with no lateral translation. The lens rim, bridge and inner temple should provide enough foreground context for the view to read as "wearing" the glasses. The camera must never visibly clip a rim, bridge, nose pad or temple. | Use the existing physical glass and studio light; a restrained reflection/refraction or highlight shift at the lens crossing is welcome. Do not add particles, speed lines, glitches, a face/head model, or a new visual asset. |
| `~0.8 → 1` | Continue the forward motion just long enough for the frame to clear, then preserve the current paper fade to a clean endpoint. | Paper becomes fully opaque before geometry can leave a stray edge or clipping artefact. The existing hold and destination reveal follow unchanged. |

Exact split values may be tuned visually, but the first arc must be legible and brief; it is a transition into the wearer view, not a separate showcase angle. Use an eased spatial path internally if needed, while keeping the user’s scrub position predictable and reversible.

### Camera and visual constraints

- Move the **camera**, not the model. Existing lighting, assembly state, angle table and the landed Front pose must remain unchanged.
- Derive the wearer pose from the real model coordinates and camera orientation. In the current coordinate system Front looks from positive Z; wearer POV is behind the front plane, looking toward positive Z. Travel around the positive-X/model-right side rather than cutting through the frame.
- Resolve a stable target in the frame symmetry plane, using the actual lens geometry for height and depth. Recompute on resize and check the central opening against physical bridge, pads and rims. The review correction supersedes the original right-lens target to eliminate sideways motion.
- Avoid a literal close-up of lens geometry filling the whole screen. The viewer should briefly read the complete inside perspective before the forward push.
- The camera’s `near`/`far` handling must remain robust as it approaches and crosses the front plane. Restore the usual values when `u = 0`; no clipped cross-sections or depth-precision shimmer.
- Preserve on-demand rendering, existing theme support, route transition, focus management, reduced motion, and the current input guards. Do not alter the five authored angles, their timings, lighting rows, or their copy layouts.

### Validation for this iteration

- Test the arc, wearer view and centred push at 1920 × 945 and 375 × 812, forward and in reverse during a slow scrub.
- Capture at least `u = 0.2` (arc), `u = 0.4` (wearer view), `u = 0.65` (centred push), `u = 0.85` (paper onset), and `u = 1`.
- Check that a new forward notch/flick still completes the exit; early release reverses or settles back according to the existing exit rules; repeated/key/momentum guards and reduced-motion route behavior remain intact.
- Update the pure exit tests: the old invariant that the original nose-gap point stays fixed no longer applies. Replace it with model-space/path assertions appropriate to the new camera path, plus viewport screenshots or projection checks that prove safe clearance from the physical frame.

### Implemented geometry and surfaces

`scroll-exit.ts` resolves the XY centre of the actual `lens_R` geometry, raycasts both physical lens faces, and averages their Z positions. This includes the model's wrap, pantoscopic tilt and sag. The measured optical centre is approximately **(35.000, −6.000, −0.744) mm** in `ellis.reference` coordinates; it has over **15 mm** of clearance from solid frame geometry. The viewer keeps a snapshot of assembled transforms with shared geometry/materials, so a resize while Side is exploded cannot shift the target. Path resolution runs again on every resize.

- **0–0.35:** clockwise camera orbit through positive X to negative Z, with gradual zoom and approach starting immediately. Orbit about the frame's symmetry plane, not the right lens. Shrink the view span exponentially while widening FOV smoothly; radius decreases throughout, without an initial pause or shrink in perceived size. The front-plane anchor recentres over u=0–0.04, then remains at the viewport centre throughout rotation. Most of the yaw completes before radial entry to clear the curled temple tips. No model transform changes.
- **Wearer view:** the exit alone widens the camera during the approach to 80° on the shorter viewport axis. Desktop vertical FOV is 80°; portrait vertical FOV is derived to keep horizontal FOV 80°. Eye depth is fitted from model bounds (about 109 mm at both sizes). The inside view and subsequent zoom remain centred and level throughout the push. Both inside rims read while forward motion continues; u=0 restores the authored 30° Front exactly.
- **0.35–0.8:** cubic forward push along model +Z, matching the approach speed at the orbit handoff. Keep x=0 and a level +Z view throughout. The centre opening stays fixed on screen until the front plane passes; there is no later side-step toward either lens. The crossing is about (0, −6, −0.744) mm in model space and clears solid geometry by **9.016 mm**. **0.8–1** adds a short forward clearance move.
- **Copy:** the existing editorial layer stays opaque and enlarges by **40^u** about the viewport centre from the first increment. Scale font sizes and layout offsets together, rather than transforming a huge bitmap layer: the latter produced stale glyph tiles on desktop reverse scrub. Text leaves the viewport by enlargement, with no fade or rotation; Front restores scale 1 and the original layout. Spec/header/theme chrome retain **0–0.25**; paper retains **0.85–1**.
- **Glass:** the selected day/night material recipe is fixed throughout the move. The earlier exit-only opacity/depth curve is removed after owner review of a light-to-grey shade change. Color, opacity, transmission, roughness, transparent and depth-write flags remain unchanged at every scrub sample. Camera-dependent physical reflections remain; no material, environment, light, asset or dependency is added.
- **Depth:** near eases from 0.1 to **0.01 cm** (0.1 mm). Far encloses the model bounding sphere from the current camera, plus 2 cm. It never divides by distance to the lens, including at the crossing; the ratio stays below 1:10,000 at the verified sizes. At u=0, restore **30° / 0.1 / 1000** exactly.

## The behaviour

| Where the demo runs | Destination |
|---|---|
| `/v2-demo` route (server up, `V2Demo`) | Home `/`, inside the normal `Shell` with header and footer |
| Offline full-screen demo (`OfflineV2Demo`, server unreachable) | Restored `StoreUnavailable` |

Nothing returns from the destination to the demo. Browser Back online remounts `/v2-demo` at angle 0. Normal navigation to home does not reveal.

## Historical round-2 zoom target

The owner marked the target on the Front angle: the **nose gap**, on the frame's centre line, just below the bridge, between the lenses. At 1920 × 945 it projects about **9px above the stage centre**, in the paper gap between "MADE TO" and "BE SEEN".

Define it as a model-space point **P** on the front-face plane (`ellis.ts` puts the front face on z = 0). Unproject the screen point (stage centre x, stage centre y − 1 cqmin) onto that plane at the landed Front pose. Recompute P on resize, along with the poses. Check in a screenshot that P lands in the nose gap, clear of the bridge and both rims, at 1920 × 945 and 375 × 812.

Zooming into P therefore means flying **through the nose gap**. The frame passes off the edges of the screen, the headline lines part above and below, and the shot ends on plain paper. That's why the end state is **paper, not ink**.

## Historical round-2 move: dolly with a fixed view direction

- **Camera:** translate the camera from its landed Front position toward P. **Keep its orientation fixed; don't re-aim at P.** Moving along the line toward a point keeps that point's projection still (the focus of expansion), so P stays exactly on the owner's mark for the whole move.
- **Distance:** progress `u ∈ [0, 1]` sets the camera's view-space depth to the front plane as `d(u) = d0 · EXIT_SCALE^(−u)`, with `EXIT_SCALE = 40`. Scale grows as `EXIT_SCALE^u`, a constant perceived zoom rate. A linear dolly would crawl and then lurch.
- **Type and copy move with the camera.** Treat the finale's DOM copy (headline, eyebrow, *The Ellis* aside) as lying on the front-face plane. Apply one CSS transform to that layer: `scale(d0 / d(u))` with `transform-origin` at P's projected screen point. It then grows exactly like the front of the frame. The temples sit behind that plane, so they get natural depth parallax. Don't animate individual letters.
- **Chrome stays put and fades:** the bottom-left spec line, the round CTA and (online) the `.site-header` fade 1 → 0 over `u ∈ [0, 0.25]`. Only the scene zooms.
- **End state:** a **paper layer** (`background: var(--paper)`, full stage, above the canvas and copy) fades 0 → 1 over `u ∈ [0.85, 1]`. It hides any leftover rim or gradient edge and guarantees a clean paper frame. Replace round 1's ink layer with it.
- **Near plane:** the studio camera is `PerspectiveCamera(30, …, 0.1, 1000)`. The authored Ellis model uses metres (`mm(n) = n × 0.001`), but the existing studio scales it ×100 and operates in **centimetres**. Apply the following rule in the actual camera units, preserving that contract. Desktop Front depth is about 0.421 m and ends about 10.5 mm away; unchanged portrait fit starts about 0.960 m away and ends about 24 mm away.
  - During the exit, set `near = min(0.1, d(u) / 4)` and `far = near × 1e4`, so depth precision stays usable instead of a 1:400,000 range.
  - Call `updateProjectionMatrix()`, and restore 0.1 / 1000 exactly at `u = 0`.
  - Check the frame never shows a clipped cross-section as it leaves the screen.
- **Rendering stays on demand:** each pose update renders one frame, with no loop. The background studio gradient is CSS and stays still.

## Timeline, steps and commit

The exit becomes a **sixth position** on the existing paused timeline. Integer 5 means "paper endpoint", and the segment `[4, 5]` is the exit.

- **Pose:** add an `exit` scalar (0–1), like `explode` and `blueprint`. The timeline tweens it 0 → 1 across `[4, 5]` with `ease: "none"`; the driver supplies the ramps. Time 4 is exactly today's Front pose, so reversing restores it exactly.
- **Budget:** the segment's seconds are a fixed `EXIT_S = 2.8` (increased from 1.6 after the owner found rotation too fast), appended to the budget's seconds. It isn't a pose-table row, so it gets no projected-motion budget. Scrub weighting (`SCRUB_PX_PER_S`) then works as on other steps.
- **Step machine** (`scroll-steps.ts`): keep round 1's `exit` guard work, but the exit is now a *step to 5*, not a command that plays a separate animation.
  - A fresh forward notch, flick, ArrowDown, PageDown or Space on Front animates 4 → 5. Slow wheel and touch drag **scrub** within `[4, 5]`, and idle or release settles back to 4 on an early slow release, reversal or cancellation, and on to 5 after halfway with forward intent. A forward touch flick (40 px within 100 ms) plays the remaining step even before halfway. The existing settle behavior on angles 0–4 is unchanged.
  - **Keep the guards:** the inertia guard (crossing from 4 into the exit needs a new gesture, at least `GESTURE_IDLE_MS` after landing on 4) and ignoring key `repeat`.
  - `End` and every jump stop at 4 and never target 5. `Home` from inside `(4, 5)` returns to 0 as usual.
  - Reduced motion cuts to 5.
- **Reverse snap:** a reverse key/notch inside the exit targets Front (4), even when a scrub has already set its machine target to 4. An intentional reverse can interrupt a consumed forward notch. Its tail remains consumed; wheel events arriving within 180 ms after the exit return lands are also absorbed, so Front cannot be skipped. A later fresh reverse gesture reaches Hinge normally. Normal angle arrivals and the existing forward momentum/repeat/End/Home/commit rules are preserved.
- **Commit:** landing on **5** is the point of no return. Hold paper for `EXIT_HOLD_S` (0.15 s), then call `onExit()`. From landing on 5, the machine is exited and every event returns `[]`. Anything short of 5 is fully reversible.
- **Copy visibility:** `data-exit` exempts the finale layer from the normal in-motion display rule while it zooms without an opacity fade. Reversing restores the original layout and scale 1 on Front.
- **Header fade:** `headerOpacity` must not fight the chrome fade above.

## Destination reveal

Keep round 1's `ExitReveal` and `StoreUnavailable` wiring. Change the overlay from **ink to paper**, so the destination starts under opaque paper that fades 1 → 0 while the content goes from `blur(EXIT_BLUR_PX)` to sharp over `EXIT_REVEAL_S`. Reduced motion: a paper fade only.

### Page wiring (`src/pages/v2-demo.tsx`)

- Both demo exports take `onExit: () => void` and pass it to the stage.
- Append `pose.exit` across [4, 5] to the same paused timeline and append only the fixed exit seconds to the page's budget. There is no separate `playExit` animation or `exit` command.
- Resolve the physical lens reference, central opening and camera path from assembled model geometry on load and resize. The viewer applies the orbit/push during pose updates and restores its authored camera and 0.1 / 1000 near/far at zero.
- Keep the finale copy layer mounted with `data-exit` during exit motion. Drive centred copy scale, stationary chrome fade and paper opacity from the same scalar. The header uses the chrome fade while u > 0.
- Landing on 5 sets `data-exiting`, holds paper for 0.15 s, then calls `onExit`. Kill the delayed callback on unmount. All later machine events return [].
- Unmount restores html/body overflow through `media.revert()` and explicitly clears the surviving online header's inline opacity/visibility. The destination must scroll normally.

**Reduced motion:** cut directly to 5, hold paper for 0.15 s, then use a 0.2 s opacity-only destination paper fade. No intermediate orbit/push or blur. Constants live in `scroll-steps.ts`: `EXIT_S = 2.8`, `EXIT_HOLD_S = 0.15`, `EXIT_REVEAL_S = 0.6`, `EXIT_REDUCED_S = 0.2`, `EXIT_BLUR_PX = 12`. Reveal CSS receives the constants through custom properties.

### Destination wiring (`src/App.tsx`)

- **Restore the store-unavailable screen** removed in `72595d5`: `Mark`, `h1` "We couldn’t open the store", `p` with the store `error`, and a **Try again** button that calls `init()`. Put it in a small `StoreUnavailable` component.
- **Offline:** add `const [demoDone, setDemoDone] = useState(false)`. When `error` is set:
  - render `<OfflineV2Demo onExit={() => setDemoDone(true)} />` while `!demoDone`;
  - render the reveal-wrapped `StoreUnavailable` once `demoDone` is true.

  If Try again succeeds, `ready` wins as today. If it fails, stay on `StoreUnavailable`; don't re-enter the demo.
- **Online:** the `/v2-demo` route's `onExit` calls `navigate("/", { state: { v2Exit: true } })`. Play the reveal only when that state is present, then clear it with `navigate(".", { replace: true, state: null })` so a refresh or Back doesn't replay it. Normal navigation to `/` must not animate.
- Implement the reveal once (for example an `ExitReveal` wrapper plus CSS keyframes) and use it for both destinations. **Pitfall:** a `filter` on an ancestor makes it the containing block for `position: fixed` descendants (the sticky header, drawers, overlays). Apply the filter class only for the duration of the animation and remove it on `animationend`. Afterwards the destination must have no `filter`, `transform` or `will-change` left on it.
- After the reveal, move focus to the destination's main heading (`tabIndex={-1}`), so keyboard and screen-reader users don't keep focus on the unmounted stage.

## Tests

- **Step machine** (`tests/scroll-steps.test.mjs`): rework round 1's exit tests for the step model:
  - a forward step on 4 gives `animateTo 5`, and a scrub gives `scrubTo` within `(4, 5)`;
  - the inertia guard and the `repeat` guard still hold;
  - End and jumps never reach 5, and Home inside the segment returns to 0;
  - reduced mode gives `cutTo 5`;
  - after landing on 5, every event returns `[]`;
  - settling from a partial scrub goes back to 4 or on to 5 under the exit settle rule above.
- **Timeline:** `exit` is 0 at time 4 and 1 at time 5, forwards and backwards and after a resize rebuild, and it is monotonic in between. All existing integer-state, fit, projection-guard and budget tests for angles 0–4 pass unchanged; keep the exit segment out of them.
- **Camera path/safety:** dense forward/reverse sampling of the actual model triangles checks clockwise positive-X traversal, level +Z wearer sight line, monotonic forward push, clear central sight-line ray intersections, target and camera clearance from solid geometry, stable depth range, unchanged model transforms and exact Front restoration. The resting target survives resize while the live model is exploded. Viewer tests cover one render per update and day/night camera/material restoration.
- **E2E:** keep round 1's online, offline and reduced-motion exit cases. Add a scrub case: drag partway into the exit, release early, and assert the stage settles back on 4 with the finale copy visible.


Destination E2E cases still check the online home/header and scrolling, cleared navigation state and no replay on refresh/Back; offline StoreUnavailable focus and keyboard retry; and reduced motion under 0.6 s. The existing server-down demo case remains unchanged. Run `npm run test:e2e` only if `../server` exists.

## Constraints

- No new dependencies; use the installed GSAP.
- Don't change the angle table, normal camera paths, lighting, timing budget or per-angle copy layouts. The exit scales the existing finale parent layer about the screen centre without fading it.
- Don't touch the server, `tests/fixtures/round4`, or shop pages beyond what the reveal wrapper needs in `App.tsx` and `Shell`.
- Rendering stays on demand; the exit must not start a continuous render loop.
- Update `V2-SCROLL-DEMO.md`: the input list under **What it does**, the finale row and a short "Exit" paragraph in **Copy**, and **Files**. Update the README's `/v2-demo` paragraph with one sentence about the exit.

## Wearer-perspective verification

Focused verification and current captures supersede the fixed nose-gap projection invariant and round-2 captures below. The implementation leaves the authored angle table, normal paths, lighting rows and route/reveal/accessibility wiring unchanged. Exit timing and exit-only reverse retargeting/landing guards follow the latest review corrections.

- Five focused exit tests cover dense physical-geometry clearance, reverse restoration, resting target resize, immediate opaque copy zoom/paper treatment and timeline rebuilds. Minimum camera-to-solid clearance: **9.016 mm** on desktop and phone. The central target also has 9.016 mm clearance; the measured lens reference remains over 15 mm from solids. No solid geometry enters the near-camera safety corridor.
- Playwright straightness checks use the actual live camera/scene plus pixel bounds of the captured rims, at every **0.05 from u=0.35 to 0.65**, forward and reverse. At **1920×945, 1808×931 (reference content viewport), and 375×812**: hinge centre/level errors are **0 px**, rim pixel-centre error is **0.5 px**, and captured top/bottom level errors are **0–1 px** (the 1 px bottom-edge raster difference occurs on mobile at u=0.6). Early-orbit samples every 0.05 confirm decreasing camera radius and view span, a centred frame anchor and zero camera roll.
- Viewer integration checks day/night glass restoration, exact camera restoration, resize target while exploded, and one on-demand render per scrub update.
- Chromium captures at **1920×945**, **1808×931** and **375×812** seek the existing timeline after landing on Front and set the usual moving state. Both forward and reverse samples cover **u=0.2, 0.4, 0.65, 0.85, 1**. All five requested full composite captures are byte-identical in forward and reverse at all three viewports. Copy stays at opacity 1, scales from the start without rotating, and restores at Front. Additional 0.05 and 0.1 screenshots show text enlargement during the beginning of the orbit. At 0.4 both inside rims are readable; 0.65 is the centred push; 0.85 is paper onset with geometry cleared; 1 is opaque paper.
- Real CDP touch gestures scrub forward and reverse, release back to Front with copy restored, and a fresh wheel notch commits to StoreUnavailable. Destination heading focus, reveal filter removal and restored page scrolling are checked.

Checks run for the latest review correction:

- `node tests/scroll-exit.test.mjs` — all **5 exit tests pass**.
- `node --test tests/scroll-exit.test.mjs tests/scroll-steps.test.mjs tests/scroll-motion.test.mjs tests/viewer.test.mjs` — all four files pass, including camera/material restoration and on-demand rendering.
- `node --test tests/scroll-steps.test.mjs tests/scroll-motion.test.mjs` — both pass after adding the exit-return landing guard; three new step cases cover the reported skip, reversal of a consumed notch and arrival-boundary momentum.
- `npm run typecheck` — pass.
- `npx playwright test --config .sites-runtime/playwright-exit.config.ts v2-exit-framing.spec.ts` — **5 cases pass** (three framing/surface cases and two real reverse-input cases), measuring the actual live camera and screenshot pixel bounds throughout the formerly shifting push, plus immediate opaque, unrotated, centred text scaling.
- `node .sites-runtime/verify-wearer-r3.mjs` — forward/reverse captures, early touch reversal/return, fresh wheel commit and destination focus/filter/scroll restoration at desktop, reference and mobile sizes.
- `git diff --check` — pass.

The five existing destination/reduced-motion E2E cases passed in the preceding review and were not rerun for this correction. Full unit/browser suites and the production build were not rerun. [Implementation report](../reports/v2-wearer-exit.md).

| Viewport | Front | u=0.2 | u=0.4 | u=0.65 | u=0.85 | u=1 |
|---|---|---|---|---|---|---|
| 1920×945 | [Capture](screenshots/v2-wearer-exit-r3/desktop-front.png) | [Capture](screenshots/v2-wearer-exit-r3/desktop-u-0.2.png) | [Capture](screenshots/v2-wearer-exit-r3/desktop-u-0.4.png) | [Capture](screenshots/v2-wearer-exit-r3/desktop-u-0.65.png) | [Capture](screenshots/v2-wearer-exit-r3/desktop-u-0.85.png) | [Capture](screenshots/v2-wearer-exit-r3/desktop-u-1.png) |
| 1808×931 | [Capture](screenshots/v2-wearer-exit-r3/reference-front.png) | [Capture](screenshots/v2-wearer-exit-r3/reference-u-0.2.png) | [Capture](screenshots/v2-wearer-exit-r3/reference-u-0.4.png) | [Capture](screenshots/v2-wearer-exit-r3/reference-u-0.65.png) | [Capture](screenshots/v2-wearer-exit-r3/reference-u-0.85.png) | [Capture](screenshots/v2-wearer-exit-r3/reference-u-1.png) |
| 375×812 | [Capture](screenshots/v2-wearer-exit-r3/mobile-front.png) | [Capture](screenshots/v2-wearer-exit-r3/mobile-u-0.2.png) | [Capture](screenshots/v2-wearer-exit-r3/mobile-u-0.4.png) | [Capture](screenshots/v2-wearer-exit-r3/mobile-u-0.65.png) | [Capture](screenshots/v2-wearer-exit-r3/mobile-u-0.85.png) | [Capture](screenshots/v2-wearer-exit-r3/mobile-u-1.png) |

Reverse captures use the same folder and `desktop-reverse-<u>.png` / `mobile-reverse-<u>.png` names. The second review captures in `screenshots/v2-wearer-exit-r2/` are superseded because the lens alignment still shifted the frame sideways and the text faded. The first wearer attempt in `screenshots/v2-wearer-exit/` is also superseded: it used the right lens as its orbit pivot and delayed the approach, producing the off-centre perspective identified in review. The nose-gap captures below are historical.

## Historical round-2 acceptance

- `npm run typecheck`, `npm test` and `npm run build` pass. Run `npm run test:e2e` only if `../server` exists; otherwise report it wasn't run.
- On the offline demo at 1920 × 945 and 375 × 812:
  - one notch on Front reads as the **camera flying into the design**, through the nose gap at the marked point, with the glasses and type growing together;
  - a slow drag scrubs it both ways, and releasing early returns to Front;
  - the shot ends on paper, and the store-unavailable screen focuses in from blur;
  - momentum, End and reduced motion behave as above.
- Attach screenshots at `u` = 0.25, 0.5, 0.75 and 1 and of the destination mid-reveal, replacing round 1's set in `doc/feature/screenshots/v2-finale-exit/`.

## Historical round-2 implementation verification

Implemented on `task/forma-v2-lighting`. The initial copy/font/spec/reference working tree was committed separately as `2626223`. Round 2 removes the headline-only timeline, E wrapper, ink layer and `EXIT_ZOOM_S`; P uses exactly centre minus 1 cqmin, with no tuning factor.

- `npm run typecheck`, `npm test` (95 passing tests), and `npm run build` pass. The existing angle table, camera paths, lighting, budget and fit/projection/timing test files are unchanged. Twelve exit step-machine cases and two isolated dolly/timeline tests cover the sixth position without adding it to the five-angle tests. No dependencies, server files or round4 fixtures changed.
- `npm run test:e2e` was not run: `../server` is absent. The online/offline/reduced scaffolding remains, with an added real CDP touch early-release case.
- Offline `npm run dev` checks in installed Chromium at both requested sizes show glasses and copy growing together, P clear of the bridge/rims, no clipped cross-sections, plain paper at u = 1, and a paper/blur destination reveal. An actual mobile touch drag reached u = 0.2463, reversed to 0.1539, then settled back to 4 with no transform and copy visible. A fresh mobile wheel notch completed the exit.
- The destination heading receives focus, Tab reaches Try again, and a failed retry stays on StoreUnavailable. HTML overflow returns to its default, and computed reveal filter becomes `none`. Reduced motion completed the paper hold and reveal in about 0.354 s with no blur. The CSS fade overrides the site's global animation-disable rule only for the required reduced paper fade.
- A server-free online smoke check with local API mocks reaches `/`, restores the header, focuses the home heading, clears route state and removes filter/transform/will-change. The home scrolls normally, refresh does not replay the reveal, and Back remounts angle 0. This does not replace the skipped server-backed E2E run.
- R2's early-release wording conflicts with the old finish rule, which always selected the forward neighbour after even a short slow drag. The exit alone uses a halfway threshold, while keeping reverse/cancel behavior and fast flicks. Angles 0–4 retain their rule.
- Unit clarification: the scene operates in centimetres, so the specified near/far formula uses those units and restores 0.1 / 1000 exactly at u = 0. No scene rescaling or portrait fit changes were made to force the approximate desktop 10 mm endpoint on mobile.
- The in-app browser was unavailable; local Playwright Chromium supplied the offline visual checks. Screenshot controls and P markers exist only in the verification browser session.

P below is in the reference model's authored millimetres, on local z = 0. A pure raycast through P hits no bridge, rim, lens or temple at either size. Its projection stays within 0.5 px across the move; points within 1 mm on the front plane scale within 1% of the DOM layer. Front's existing slight tilt is preserved.

| Viewport | P (model mm) | Fixed screen point (px) | Front depth | Final depth |
|---|---|---|---|---|
| 1920 × 945 | (0, −1.716121, 0) | (960, 463.05) | 421.446 mm | 10.536 mm |
| 375 × 812 | (0, −1.597585, 0) | (187.5, 402.25) | 960.445 mm | 24.011 mm |

Zoom captures seek the existing paused timeline to 4 + u. Destination captures pause its 0.6 s CSS animation at 0.3 s. Both endpoints are fully opaque paper.

| Viewport | P mark | u = 0.25 | u = 0.5 | u = 0.75 | u = 1 | Destination mid-reveal |
|---|---|---|---|---|---|---|
| 1920 × 945 | [Capture](screenshots/v2-finale-exit/desktop-point-P.png) | [Capture](screenshots/v2-finale-exit/desktop-u-0.25.png) | [Capture](screenshots/v2-finale-exit/desktop-u-0.5.png) | [Capture](screenshots/v2-finale-exit/desktop-u-0.75.png) | [Capture](screenshots/v2-finale-exit/desktop-u-1.png) | [Capture](screenshots/v2-finale-exit/desktop-destination-mid-reveal.png) |
| 375 × 812 | [Capture](screenshots/v2-finale-exit/mobile-point-P.png) | [Capture](screenshots/v2-finale-exit/mobile-u-0.25.png) | [Capture](screenshots/v2-finale-exit/mobile-u-0.5.png) | [Capture](screenshots/v2-finale-exit/mobile-u-0.75.png) | [Capture](screenshots/v2-finale-exit/mobile-u-1.png) | [Capture](screenshots/v2-finale-exit/mobile-destination-mid-reveal.png) |
