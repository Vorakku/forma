# FORMA V2: finale zoom-through exit

Spec written and implemented 2026-10-08; round 2 is folded into this document. Read [V2-SCROLL-DEMO.md](V2-SCROLL-DEMO.md) first, especially its **Copy** section.

## Background

The last angle (4, Front) ends on the two-line headline "MADE TO / BE SEEN", rendered before the canvas so the frame lies across it. Its eyebrow, italic *The Ellis* aside, bottom spec line and round warm CTA are already laid out. The reference remains [the 7-second hero-slider recording](e9c2d2ccb882e4436fc80b681f3b4412.mp4).

The owner's round-2 review replaces the headline-only zoom with a camera move into the design: the glasses and copy grow together toward the nose gap. The shot ends on paper and reveals the destination. The move is a reversible, scrubbable sixth timeline position until it lands on 5.

## The behaviour

| Where the demo runs | Destination |
|---|---|
| `/v2-demo` route (server up, `V2Demo`) | Home `/`, inside the normal `Shell` with header and footer |
| Offline full-screen demo (`OfflineV2Demo`, server unreachable) | Restored `StoreUnavailable` |

Nothing returns from the destination to the demo. Browser Back online remounts `/v2-demo` at angle 0. Normal navigation to home does not reveal.

## The zoom target

The owner marked the target on the Front angle: the **nose gap**, on the frame's centre line, just below the bridge, between the lenses. At 1920 × 945 it projects about **9px above the stage centre**, in the paper gap between "MADE TO" and "BE SEEN".

Define it as a model-space point **P** on the front-face plane (`ellis.ts` puts the front face on z = 0). Unproject the screen point (stage centre x, stage centre y − 1 cqmin) onto that plane at the landed Front pose. Recompute P on resize, along with the poses. Check in a screenshot that P lands in the nose gap, clear of the bridge and both rims, at 1920 × 945 and 375 × 812.

Zooming into P therefore means flying **through the nose gap**. The frame passes off the edges of the screen, the headline lines part above and below, and the shot ends on plain paper. That's why the end state is **paper, not ink**.

## The move: a dolly with a fixed view direction

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

The exit becomes a **sixth position** on the existing paused timeline. Integer 5 means "fully zoomed", and the segment `[4, 5]` is the exit.

- **Pose:** add an `exit` scalar (0–1), like `explode` and `blueprint`. The timeline tweens it 0 → 1 across `[4, 5]` with `ease: "none"`; the driver supplies the ramps. Time 4 is exactly today's Front pose, so reversing restores it exactly.
- **Budget:** the segment's seconds are a fixed `EXIT_S = 1.6`, appended to the budget's seconds. It isn't a pose-table row, so it gets no projected-motion budget. Scrub weighting (`SCRUB_PX_PER_S`) then works as on other steps.
- **Step machine** (`scroll-steps.ts`): keep round 1's `exit` guard work, but the exit is now a *step to 5*, not a command that plays a separate animation.
  - A fresh forward notch, flick, ArrowDown, PageDown or Space on Front animates 4 → 5. Slow wheel and touch drag **scrub** within `[4, 5]`, and idle or release settles back to 4 on an early slow release, reversal or cancellation, and on to 5 after halfway with forward intent. A forward touch flick (40 px within 100 ms) plays the remaining step even before halfway. The existing settle behavior on angles 0–4 is unchanged.
  - **Keep the guards:** the inertia guard (crossing from 4 into the exit needs a new gesture, at least `GESTURE_IDLE_MS` after landing on 4) and ignoring key `repeat`.
  - `End` and every jump stop at 4 and never target 5. `Home` from inside `(4, 5)` returns to 0 as usual.
  - Reduced motion cuts to 5.
- **Commit:** landing on **5** is the point of no return. Hold paper for `EXIT_HOLD_S` (0.15 s), then call `onExit()`. From landing on 5, the machine is exited and every event returns `[]`. Anything short of 5 is fully reversible.
- **Copy visibility:** the finale copy must stay visible throughout `[4, 5]`, including while `data-moving` is set. Today's rule hides all copy during motion; exempt the exit segment (for example with a `data-exit` attribute on the stage while `time > 4`).
- **Header fade:** `headerOpacity` must not fight the chrome fade above.

## Destination reveal

Keep round 1's `ExitReveal` and `StoreUnavailable` wiring. Change the overlay from **ink to paper**, so the destination starts under opaque paper that fades 1 → 0 while the content goes from `blur(EXIT_BLUR_PX)` to sharp over `EXIT_REVEAL_S`. Reduced motion: a paper fade only.

### Page wiring (`src/pages/v2-demo.tsx`)

- Both demo exports take `onExit: () => void` and pass it to the stage.
- Append `pose.exit` across [4, 5] to the same paused timeline and append only the fixed exit seconds to the page's budget. There is no separate `playExit` animation or `exit` command.
- Resolve P against the reference model's transformed front plane on load and resize. Keep its projection in stage pixels as the whole finale copy layer's transform origin. The viewer applies the dolly during pose updates and restores its usual orbit and 0.1 / 1000 near/far at zero.
- Keep the finale copy visible with `data-exit` during exit motion. Drive its scale, stationary chrome fade and paper opacity from the same scalar. The header uses the chrome fade instead of `headerOpacity` while u > 0.
- Landing on 5 sets `data-exiting`, holds paper for 0.15 s, then calls `onExit`. Kill the delayed callback on unmount. All later machine events return [].
- Unmount restores html/body overflow through `media.revert()` and explicitly clears the surviving online header's inline opacity/visibility. The destination must scroll normally.

**Reduced motion:** cut directly to 5, hold paper for 0.15 s, then use a 0.2 s opacity-only destination paper fade. No intermediate dolly, DOM scaling or blur. Constants live in `scroll-steps.ts`: `EXIT_S = 1.6`, `EXIT_HOLD_S = 0.15`, `EXIT_REVEAL_S = 0.6`, `EXIT_REDUCED_S = 0.2`, `EXIT_SCALE = 40`, `EXIT_BLUR_PX = 12`. Reveal CSS receives the constants through custom properties.

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
- **Dolly maths:** a pure test that P's projection stays within 0.5px of its landed position across `u`. It also checks that the projected scale of points on the front plane around P matches the DOM scale `d0 / d(u)` within 1%.
- **E2E:** keep round 1's online, offline and reduced-motion exit cases. Add a scrub case: drag partway into the exit, release early, and assert the stage settles back on 4 with the finale copy visible.


Destination E2E cases still check the online home/header and scrolling, cleared navigation state and no replay on refresh/Back; offline StoreUnavailable focus and keyboard retry; and reduced motion under 0.6 s. The existing server-down demo case remains unchanged. Run `npm run test:e2e` only if `../server` exists.

## Constraints

- No new dependencies; use the installed GSAP.
- Don't change the angle table, camera paths, lighting, timing budget or their tests, or any of the per-angle copy layout, including the finale layout. The plain "Made to" text is restored; the exit transforms its existing parent layer.
- Don't touch the server, `tests/fixtures/round4`, or shop pages beyond what the reveal wrapper needs in `App.tsx` and `Shell`.
- Rendering stays on demand; the exit must not start a continuous render loop.
- Update `V2-SCROLL-DEMO.md`: the input list under **What it does**, the finale row and a short "Exit" paragraph in **Copy**, and **Files**. Update the README's `/v2-demo` paragraph with one sentence about the exit.

## Done when

- `npm run typecheck`, `npm test` and `npm run build` pass. Run `npm run test:e2e` only if `../server` exists; otherwise report it wasn't run.
- On the offline demo at 1920 × 945 and 375 × 812:
  - one notch on Front reads as the **camera flying into the design**, through the nose gap at the marked point, with the glasses and type growing together;
  - a slow drag scrubs it both ways, and releasing early returns to Front;
  - the shot ends on paper, and the store-unavailable screen focuses in from blur;
  - momentum, End and reduced motion behave as above.
- Attach screenshots at `u` = 0.25, 0.5, 0.75 and 1 and of the destination mid-reveal, replacing round 1's set in `doc/feature/screenshots/v2-finale-exit/`.

## Implementation verification

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
