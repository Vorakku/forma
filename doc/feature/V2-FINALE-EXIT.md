# FORMA V2: finale zoom-through exit

Spec written and implemented 2026-10-08. Read [V2-SCROLL-DEMO.md](V2-SCROLL-DEMO.md) first, especially its **Copy** section: the finale layout described there is already built and is the starting point for this work.

## Background

The last angle (4, Front) ends on a large two-line headline, "MADE TO / BE SEEN". It is rendered **before the canvas**, so the 3D frame lies across it. Around it sit an eyebrow, an italic *The Ellis* aside, a bottom-left spec line and a round warm-coloured CTA. Today, scrolling forward on the last angle does nothing: `createScrollSteps` clamps to the last angle.

The layout and this exit are modelled on a 7-second hero-slider recording, `doc/feature/e9c2d2ccb882e4436fc80b681f3b4412.mp4`. In it, each slide hands off to the next in four beats:

1. **Hold** about 0.6 s.
2. **Zoom.** The headline scales up enormously, accelerating, until a single letter fills the screen. The background photo stays still.
3. **Dark.** The screen fades to near-black for about 0.3 s.
4. **Focus in.** The next slide appears blurred and sharpens over about 0.5 s.

In the video the headline sits *above* the photo. Ours sits *behind* the glasses. That is intentional and works in our favour. The letters and the frame are the same ink black, so as the headline grows behind the frame, the glasses sink into the ink and the screen floods black. That replaces the video's fade to dark.

## The behaviour

One more forward gesture on the last angle plays the exit, and the app lands on its next page:

| Where the demo runs | Destination |
|---|---|
| `/v2-demo` route (server up, `V2Demo`) | The home page `/`, inside the normal `Shell` with header and footer |
| Offline full-screen demo (`OfflineV2Demo`, server unreachable) | The store-unavailable screen that `72595d5` replaced with the demo, restored |

The exit is **one-way and played, not scrubbed**. You can't be half-way into a different page, so the gesture only triggers it. Nothing returns from the destination to the demo. Browser Back on the online route simply remounts `/v2-demo` at angle 0.

### Sequence

Times are from the moment the exit starts. Use one GSAP timeline in the demo for phases 1–2, and a short CSS animation on the destination for phase 3.

| Phase | Time | What happens |
|---|---|---|
| 1. Zoom | 0 → 0.9 s | The headline `h2` (both lines together) scales 1 → `EXIT_SCALE` (40) with `ease: "power3.in"`, around the **zoom origin** below. The eyebrow, aside, spec line and CTA fade 1 → 0 over 0.3 → 0.7 s. The canvas fades 1 → 0 over 0.45 → 0.9 s, so the white lenses don't float on the ink. An **ink layer** (full-stage, `background: var(--ink)`, above everything in the stage) fades 0 → 1 over 0.6 → 0.9 s. It guarantees a fully black end state whatever the glyph coverage. |
| 2. Hold | 0.9 → 1.05 s | Fully ink. At 1.05 s, call `onExit()`. |
| 3. Reveal | 0 → 0.6 s after the destination mounts | The destination starts under an opaque ink overlay. The overlay fades 1 → 0 while the destination content goes from `filter: blur(EXIT_BLUR_PX)` (12px) to `blur(0)`. Use `ease-out` (for example `cubic-bezier(0.2, 0.7, 0.2, 1)`). |

The total is about 1.65 s. Put the constants with the other tuning constants in `src/tryon/scroll-steps.ts`: `EXIT_ZOOM_S = 0.9`, `EXIT_HOLD_S = 0.15`, `EXIT_REVEAL_S = 0.6`, `EXIT_SCALE = 40`, `EXIT_BLUR_PX = 12`. Feed the reveal duration and blur to CSS through custom properties; don't duplicate the numbers.

**Zoom origin:** wrap the **E** of "MADE" in `<span className="finale-origin">`. At exit start, read its `getBoundingClientRect()` and set the `h2`'s `transform-origin` to `x = left + 0.07 × font-size` (inside the E's vertical stem) and `y = top + height / 2`, in the `h2`'s own coordinates. The `h2` is `inset: 0` in the stage, so these equal stage coordinates. Check in screenshots that by about 70% of the zoom the screen is mostly ink, and tune the 0.07 factor if the origin lands in a counter instead of the stem. The ink layer covers any gap, but the zoom should *look* like it flies into the letter.

**Reduced motion:** no transform, blur or canvas zoom. The ink layer fades 0 → 1 in 0.2 s, then `onExit()`, then the destination's ink overlay fades 1 → 0 in 0.2 s with no blur.

### Trigger rules (`src/tryon/scroll-steps.ts`)

Add a command `{ type: "exit" }` to `StepCommand`. Emit it only when the machine is **landed on the last angle**, not in flight, with no target queued, and the input is a fresh **forward** intent:

- **Keys:** `ArrowDown`, `PageDown`, `Space` (without Shift). Ignore auto-repeat: add `repeat?: boolean` to the key event and pass `KeyboardEvent.repeat` from the page. Holding ArrowDown sweeps to the last angle and stops there. **`End` never exits**; it only jumps to the last angle. `Home` and backward keys behave as today.
- **Wheel:** a forward notch or fast flick that would step if there were a next angle. **Inertia guard:** forward wheel events from the gesture that *landed* on the last angle must not exit. Exit needs a new gesture, after at least `GESTURE_IDLE_MS` of idle since landing. Trackpad momentum must never throw the user out of the demo.
- **Touch:** dragging forward on the last angle must not scrub; there is no partial exit. On release, exit if the forward travel or flick passes the same threshold that would step to a neighbour.
- **Reduced motion:** the same rules; it still emits `exit`, and the page plays the reduced version.
- After emitting `exit`, the machine is **exited**: every later event returns `[]`.

### Page wiring (`src/pages/v2-demo.tsx`)

- `V2Demo` and `OfflineV2Demo` take an `onExit: () => void` prop and pass it to the stage component.
- When `execute` receives `exit`:
  - Stop any animation.
  - Set `data-exiting` on the stage, and keep `data-angle="4"` without `data-moving`, so the finale copy stays visible.
  - Play the exit timeline and call `onExit` at the end of phase 2.
  - Kill the timeline on unmount.
- While exiting, ignore all input. The Observer can stay attached until unmount; its events just produce `[]`.
- Unmounting the demo must leave the destination usable. `html`/`body` `overflow: hidden` must be reverted (today's `media.revert()` cleanup should do it; verify). On the online route, the `.site-header` that `headerOpacity` drives with `autoAlpha` must end fully visible on the home page.

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

Extend the existing suites; don't loosen anything.

- **Step machine** (`tests/scroll-steps.test.mjs`, where the gesture tests live). Add cases for:
  - `exit` from the last angle on ArrowDown, PageDown, Space, a forward wheel notch, a forward flick, and a touch release past the threshold;
  - no `exit` on End, Home, backward input, any angle other than the last, a step in flight toward the last angle, or a queued target;
  - the inertia guard: wheel events less than `GESTURE_IDLE_MS` apart that span the landing don't exit, and idle followed by a new notch does;
  - key `repeat: true` doesn't exit;
  - reduced mode emits `exit`;
  - after `exit`, every event returns `[]`.
- **Existing motion, fit, projection-guard, budget, timeline and lighting tests** must pass unchanged.
- **E2E** (`e2e/v2-scroll.spec.ts`):
  - Online: End → landed on 4 → ArrowDown → URL is `/`, the home page and header are visible, the page scrolls, and no `filter` remains on the reveal wrapper after about 1 s.
  - Offline: keep **"server down shows only the V2 scroll, without the shell"** as is; it asserts the error text is absent before any exit. Add a sibling case: with `**/api/**` returning 502, End → landed on 4 → ArrowDown → the "We couldn’t open the store" heading is visible and focused, and Try again is reachable.
  - Reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })`): the exit completes in under 0.6 s.

  Run with `npm run test:e2e` if `../server` exists; otherwise say it wasn't run.

## Constraints

- No new dependencies; use the installed GSAP.
- Don't change the angle table, camera paths, lighting, timing budget or their tests, or any of the per-angle copy layout, except for wrapping the E in `finale-origin`.
- Don't touch the server, `tests/fixtures/round4`, or shop pages beyond what the reveal wrapper needs in `App.tsx` and `Shell`.
- Rendering stays on demand; the exit must not start a continuous render loop.
- Update `V2-SCROLL-DEMO.md`: the input list under **What it does**, the finale row and a short "Exit" paragraph in **Copy**, and **Files**. Update the README's `/v2-demo` paragraph with one sentence about the exit.

## Done when

- `npm run typecheck`, `npm test` and `npm run build` pass. `npm run test:e2e` passes, or it's reported as not run.
- On the offline demo (`npm run dev` without the server), at 1920 × 945 and 375 × 812:
  - one more scroll, ArrowDown or swipe on the Front angle plays the zoom. The headline accelerates toward the viewer from inside the E, the glasses sink into the ink, and the screen goes fully black;
  - the store-unavailable screen focuses in from blur, and Try again is reachable by keyboard;
  - trackpad momentum that lands on the Front angle doesn't trigger the exit; a deliberate new scroll does;
  - End lands on Front without exiting;
  - reduced motion does a quick ink fade with no zoom or blur.
- On `/v2-demo` with the server, the same exit lands on `/` with the header visible, the page scrolling normally, and no replay on refresh or Back.
- Screenshots of the zoom at about 30%, 60% and 90%, and of the destination mid-reveal, are attached to the report.

## Implementation verification

Implemented on `task/forma-v2-lighting`. The initial copy/font/spec/reference working tree was committed separately as `2626223` before implementation.

- All trigger rules are enforced by `createScrollSteps`, including a settled-state check (merely scrubbing back to exact Front time is insufficient), idle after landing, consumed momentum, forward touch release, key repeat and the terminal exited state.
- One GSAP exit timeline controls the headline, surrounding copy, canvas and ink, with unmount cleanup. The ink layer also covers the floating online header during the hold. The 0.07 origin factor is unchanged: desktop and mobile captures place the origin in the E's vertical stem.
- `ExitReveal` is shared by both destinations. Its animation class and ink overlay are removed on completion; computed filter and transform are `none`, and will-change is `auto`. It focuses the main heading with `tabIndex=-1`.
- The global reduced-motion CSS disables all animations with `!important`. The reduced reveal explicitly overrides that rule for the specified 0.2 s opacity-only ink fade; content stays unblurred. Measured total exit/reveal: about 0.42 s after the on-demand Front frame renders. The E2E timing case waits for that frame so software WebGL time from the preceding angle cut is excluded.
- Offline dev checks at both requested sizes confirm End stays on Front, momentum spanning its landing does not exit, a deliberate fresh notch does, and native mobile touch exits only on release. The destination heading receives focus; Tab reaches Try again; failed retry stays on StoreUnavailable. HTML/body overflow is restored.
- With `../server` absent, `npm run test:e2e` was not run. Three E2E cases were added as specified. An additional browser smoke check with mocked API responses verifies the online route reaches `/`, clears its navigation state, restores the header, scrolls normally, leaves no filter/transform/will-change, does not replay on refresh and remounts angle 0 on Back.
- `npm run typecheck`, `npm test` (95 passing tests) and `npm run build` pass. Existing motion, fit, projection, budget, timeline and lighting tests are unchanged. No dependencies, server files or round4 fixtures changed.
- No behavior or timing deviations from the spec. The in-app browser was unavailable; visual verification used installed local Chromium through Playwright.

The zoom frames sample elapsed zoom time at 0.27, 0.54 and 0.81 s (30/60/90% of the 0.9 s zoom), with the running GSAP timeline paused at those times. Mid-reveal is 0.18 s into the destination's 0.6 s CSS animation. These controls exist only in the browser verification session.

| Viewport | Zoom 30% | Zoom 60% | Zoom 90% | Destination mid-reveal |
|---|---|---|---|---|
| 1920 × 945 | [Capture](screenshots/v2-finale-exit/desktop-zoom-30.png) | [Capture](screenshots/v2-finale-exit/desktop-zoom-60.png) | [Capture](screenshots/v2-finale-exit/desktop-zoom-90.png) | [Capture](screenshots/v2-finale-exit/desktop-destination-mid-reveal.png) |
| 375 × 812 | [Capture](screenshots/v2-finale-exit/mobile-zoom-30.png) | [Capture](screenshots/v2-finale-exit/mobile-zoom-60.png) | [Capture](screenshots/v2-finale-exit/mobile-zoom-90.png) | [Capture](screenshots/v2-finale-exit/mobile-destination-mid-reveal.png) |
