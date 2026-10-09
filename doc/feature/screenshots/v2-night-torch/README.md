# V2 night torch review

Captured on 2026-10-09 in Chromium with SwiftShader, using the existing offline demo because `../server` is absent. Each individual capture is **1920 × 945**, night theme, with reduced motion enabled to show the exact settled light target. Normal-motion spring and theme transitions are covered separately by the focused E2E tests.

Files use `1920x945-angle-{angle}-{upper-left|centre|lower-right}.png`:

| Angle | Upper-left pointer | Centre pointer | Lower-right pointer |
|---|---|---|---|
| 0 — Three-quarter | (640, 400) | (935, 505) | (1230, 610) |
| 1 — Side, exploded | (670, 370) | (925, 475) | (1180, 580) |
| 3 — Hinge detail | (550, 240) | (885, 470) | (1220, 700) |
| 4 — Front | (700, 400) | (960, 475) | (1220, 550) |

- [Reference comparison](reference-comparison.png): actual frames from `Recording 2026-10-08 145119.mp4` at 0.71s and 3.06s, above Front upper-left/lower-right light positions.
- [Main comparison](main-comparison.json): baseline revision and day/blueprint pixel results. Day 0–3 and night blueprint are exact. Front differs only by one 8-bit channel level in software WebGL.
- Torch tuning: `src/tryon/night-torch.ts`, `TORCH`.
- Result and test scope: [V2-NIGHT-MODE.md](../../V2-NIGHT-MODE.md#implementation-result-phase-2).

## Reproduce

With a supported Node (22.12+), from the repository root:

```powershell
$env:CAPTURE_TORCH='1'
$env:COMPARE_TORCH_MAIN='1'
node node_modules/@playwright/test/cli.js test --config playwright.torch.config.ts --grep "torch"
```

The focused config starts offline Vite on port 4177; `COMPARE_TORCH_MAIN=1` also starts a source baseline on port 4178, loading the affected files directly from `main` without modifying the checkout. Omit the two environment flags for just the three functional torch tests (capture/comparison cases are then explicitly skipped).

On this machine, use `& "D:/SDK/Node/nodejs/node.exe"` in place of `node` because the shell also has Node 14 on PATH.
