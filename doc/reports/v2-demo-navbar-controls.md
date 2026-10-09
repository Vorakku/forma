# V2 demo navbar and controls — 2026-10-08

The owner requested a navbar that fades out on entering the demo, reappears when the mouse approaches the top, and fades out when it moves away; a day/night toggle at the bottom-left; and removal of the last-angle bottom-right arrow.

The Shell now controls header reveal independently of the demo's angle timeline. After a 250ms arrival hold, the header fades over 350ms. The reveal zone extends through the header plus 24px, with a minimum height of 120px. Stationary browser pointer events do not cancel the arrival fade. Keyboard focus reveals the header, devices without hover retain navigation, and reduced motion switches opacity immediately. Pointer listeners and timers are removed on leaving the demo. The existing finale exit fade multiplies the reveal opacity and is cleaned up on unmount.

The 44px theme toggle uses 24px left/bottom insets and honors larger safe-area insets. Finale specifications reserve the area beside it. Mobile hinge notes reserve at least 88px below their text to avoid overlap. The earlier tablet navigation margin workaround is removed. The last-angle arrow link and offline decoration, their styling, and the unused gesture exclusion are removed. The scroll-driven finale exit continues to work.

Verification:

- `npm run typecheck`: passed.
- `npm test`: all seven test files passed.
- `npm run build`: passed; the existing bundle-size warning remains.
- `git diff --check`: passed.
- `npm run test:e2e`: 27/30 passed in 10.4 minutes. The reload reveal check failed before the final coordinate-tracking fix; the software-rendered motion timing check exceeded its tolerance, and the online finale check was interrupted by the live source reload.
- `npm run test:e2e -- --last-failed`: all three checks passed in 2.9 minutes on the settled code, including motion timing at both desktop/mobile sizes and the online finale exit. All 30 browser cases have passing results across the full run and this rerun.
- `npm run test:e2e -- --grep 'navbar fades|night button clears|touching Night|real CDP|cold arrival'`: 4/5 passed before the mobile hinge clearance fix; the corrected placement check subsequently passed in the full run.

New browser coverage checks arrival opacity, reveal/hide at every angle, keyboard focus, navigation cleanup, and arrow absence. The existing placement check now asserts bottom 24px / left 24px, clickability, no text collisions, and no horizontal overflow at 1920×945, 1440×900, 1024×768, and 375×812.

The first browser attempt exposed a stationary pointer event canceling arrival hiding; that was fixed by comparing cursor coordinates rather than browser movement deltas, which can be zero on the first event after reload. The targeted placement check then found mobile hinge copy overlapping the relocated button; the bottom padding was increased. The final browser run uses the isolated commerce_e2e database on server 8788 / FORMA 4176, with Chromium SwiftShader. No development database, server API, dependencies, or other storefront code changed. Hardware rendering and non-Chromium browsers were not checked.
