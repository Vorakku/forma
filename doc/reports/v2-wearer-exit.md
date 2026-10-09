# V2 Ellis wearer-perspective exit — latest review correction

The camera now keeps the whole frame centred throughout the forward zoom. Removed the lateral move to the right lens over u=0.45–0.62; that made the frame slide left. After the positive-X orbit reaches the wearer view, the camera advances straight along the symmetry plane through the clear opening below the bridge. This follows the latest owner feedback and supersedes the initial right-lens crossing. Rotation and the gradual approach from the first increment are retained.

The headline, eyebrow and aside no longer fade. The existing flat editorial layer scales by `40^u` about the screen centre from the first increment, while rotation begins. It leaves the viewport by enlarging rather than disappearing through opacity. Font sizes and centred layout offsets grow together, so there is no huge transformed text bitmap. Screenshot comparison caught stale glyph tiles with the initial CSS transform; that rendering path was replaced. Copy never rotates with the camera, and reverse scrub restores the original Front layout. Stationary chrome fade, paper endpoint/hold, destination reveal, normal input guards, accessibility and reduced motion remain unchanged.

Dense physical-triangle checks measure **9.016 mm** minimum camera-to-solid clearance at both desktop and mobile. The centre sight line misses bridge, rims, pads, temples and lenses. The crossing point is about **(0, −6, −0.744) mm** in model space, derived from the actual lens height/depth and re-resolved using assembled transforms on resize. Camera near/far handling, fixed material recipes and one-frame-per-update rendering remain in place.

The exit-only time budget is now **2.8 s**, up from 1.6 s, making played rotation slower and requiring proportionately more scrub travel. The five normal angle budgets are unchanged. Removed the exit-only lens opacity/depth curve responsible for a light-to-grey change; day/night material recipes stay fixed throughout.

Reverse keys/notches inside the exit now stop at Front first. Previously a scrub set the machine target to 4 and a reverse notch computed `target - 1 = 3`, skipping Front. A reverse can also interrupt a consumed forward notch. Its momentum stays consumed, and a wheel event arriving within 180 ms after the exit return lands cannot skip Front. Later fresh reverse input still reaches Hinge normally. Normal angle arrivals and forward momentum, repeat, End/Home and commit guards remain unchanged.

## Playwright measurements

The test observes the actual scene and camera matrix updates used by the renderer, projects the physical hinge anchors, and decodes dark rim pixel bounds from screenshots. It measures the formerly shifting zoom, not only the initial wearer pose.

At every 0.05 from **u=0.35 to 0.65**, forward and reverse, on **1920×945, 1808×931 and 375×812**:

| Measurement | Observed error | Assertion limit |
|---|---|---|
| Projected frame/hinge centre from viewport centre | <0.000001 px | <0.5 px |
| Left/right hinge level | 0 px | <0.5 px |
| Captured rim pixel centre | 0–0.5 px | ≤1 px |
| Captured left/right rim top/bottom levels | 0–1 px | ≤1 px |

The 1 px bottom-edge raster difference occurs on mobile at u=0.6. Live samples from u=0.05 through 0.35 verify continuous approach and decreasing view span, a centred frame anchor, zero camera roll, copy opacity 1, increasing font size, proportional headline offsets about the screen centre, no copy rotation and unchanged glass color/opacity/transmission/roughness/depth flags. Full composite screenshots at u=0.4 and 0.65 match on reverse, including return from the paper endpoint. Rim pixel measurements temporarily hide editorial copy for capture only, so black headline ink cannot be counted as frame geometry; review images retain the complete composite.

Corrected screenshots are [linked in the finale spec](../feature/V2-FINALE-EXIT.md#wearer-perspective-verification), in `screenshots/v2-wearer-exit-r3/`. They cover the requested u=0.2, 0.4, 0.65, 0.85, 1 forward/reverse plus early u=0.05 and 0.1 to show text enlargement. Previous captures remain as history. All five requested forward/reverse full composite PNG pairs are byte-identical at every viewport.

## Checks run for this correction

- `node tests/scroll-exit.test.mjs`: all five tests pass.
- `node --test tests/scroll-exit.test.mjs tests/scroll-steps.test.mjs tests/scroll-motion.test.mjs tests/viewer.test.mjs`: all four files pass, including geometry safety, exact reverse restoration, resize, day/night camera/fixed material recipes and on-demand rendering.
- `node --test tests/scroll-steps.test.mjs tests/scroll-motion.test.mjs`: both files pass after the exit-return landing guard refinement. Three new step cases cover reverse retargeting, consumed-notch reversal and landing-boundary momentum.
- `npm run typecheck`: pass.
- `npx playwright test --config .sites-runtime/playwright-exit.config.ts v2-exit-framing.spec.ts`: all five cases pass: three actual-camera/surface/pixel comparisons and two real desktop/mobile reverse wheel checks. The initial mobile input run exposed the landing-boundary skip, which was fixed; its follow-up tiny-wheel setup raced the return and was replaced with a longer real slow-touch scrub. The final five-case run passes.
- `node .sites-runtime/verify-wearer-r3.mjs`: pass at desktop/reference/mobile: all five requested forward/reverse PNG pairs are byte-identical, copy stays opaque with immediately growing type, real early touch reverses from u=0.137143 to 0.071429 and returns to Front, a fresh wheel commits, and destination focus/filter/scroll restoration pass with no page errors.
- `git diff --check`: pass.

The five existing destination/reduced-motion E2E cases passed in the preceding review and were not rerun for this correction. Full unit/browser suites and the production build were not rerun. No dependencies, product assets, authored angles, lighting rows, normal input guards, route/reveal wiring or landed copy layouts changed. Existing user changes remain in the working tree.
