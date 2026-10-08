# FORMA V2: studio lighting

Spec written 2026-10-08. Read [V2-SCROLL-DEMO.md](V2-SCROLL-DEMO.md) first. Motion (camera, explode, blueprint timing) is settled; this round changes only how the frame is lit.

## Background

The v2 stage looks plain because its lighting is a generic "make it visible" rig (`src/tryon/studio.ts`):

- **`RoomEnvironment`** is three.js's stock grey room. The Ellis is near-black acetate with `clearcoat: 1` (`ellis.ts`), so it reads almost entirely through what it reflects. A grey room gives soft, low-contrast reflections and the frame looks dull.
- **One fixed key light, one hemisphere fill, and a floor shadow at 3.5 % opacity.** The lighting is identical at all five angles.
- **The paper background** (`.v2-demo-studio` in `v2-demo.css`) is a static radial gradient that ignores the 3D light.

This round covers three changes:

1. a custom studio environment built from emissive panels;
2. a lighting setup for each angle, animated in the existing timeline;
3. reflections that travel across the frame as the camera turns.

Grounding shadow, tone mapping and other follow-ups are **out of scope** (see the end).

## 1. Custom studio environment

Replace `RoomEnvironment` **for the v2 stage only** with a small scene of emissive panels, converted once with the same `PMREMGenerator.fromScene(scene, 0.03)` call.

### Scope
- `createStudio` is shared with the shop's product viewer (`viewer.ts`). The try-on engine (`engine.ts`) has its own `RoomEnvironment`.
- Neither may change. Give `createStudio` an optional `environment?: () => THREE.Scene` argument that defaults to `new RoomEnvironment()`. The studio keeps owning PMREM generation and disposal, and disposes the returned scene's geometries and materials after conversion, as it already does with `room.dispose()`.
- `createScrollViewer` passes the v2 builder.

### How to build it
Follow `RoomEnvironment`'s own pattern in `three/examples/jsm/environments/RoomEnvironment.js`:
- `MeshBasicMaterial` panels whose colour is scaled above 1 (`color.setScalar(intensity)`) for light sources;
- a `BackSide` box for the room shell.

Only the angles and relative sizes of the panels matter; PMREM renders from the origin.

### Three variants
Ship three variants behind a dev query parameter, `?env=strip|soft|window`. The default is `strip`, and an unknown value falls back to `strip`. Only the selected variant is built.

| Variant | Room shell | Panels | Intended read |
|---|---|---|---|
| `strip` (default) | dark: walls ≈ 0.03 linear grey; floor ≈ 0.25 warm white (the frame sits on white paper) | large overhead softbox (intensity ≈ 6); two tall thin vertical strips (≈ 1:8 aspect) behind-left and behind-right at ≈ ±125° azimuth (intensity ≈ 8); a dim large front-left fill card (≈ 0.6) | Crisp, graphic product shot: long bright lines along the rims and temples against deep black |
| `soft` | lighter: walls ≈ 0.15 | large overhead softbox (≈ 4); one large front fill (≈ 1.5); no strips | Gentle catalogue look; lower contrast than `strip` but cleaner than today |
| `window` | mid: walls ≈ 0.08; floor ≈ 0.3 | one large rectangle on the camera's left at ≈ 20° elevation, wider than tall (≈ 5); a small back-right kicker strip (≈ 3) | Editorial, natural daylight from one side |

All numbers are starting points; tune by eye. The query parameter is a temporary comparison tool. Once the owner picks a variant, a follow-up deletes the other two and the parameter.

**Lenses:** keep their materials as they are. Transmission lenses on white currently show almost nothing; the panel reflections should give them an edge and a surface. If they still vanish, report it rather than retuning lens materials.

## 2. Per-angle lighting

### The light state
Each row of `SCROLL_ANGLES` (`scroll-poses.ts`) gains a `light` block, so adding an angle still means adding one row:

```ts
light: {
  key: { azimuth, elevation, intensity, color },   // degrees around the world origin; colour hex
  hemisphere,                                       // hemisphere light intensity
  environment,                                      // scene.environmentIntensity
  yaw,                                              // environment yaw offset, degrees (see §3)
  pool: { x, y, size, strength },                   // background light pool, see below
}
```

Today's key is at `(-15, 28, 18)`, which is about azimuth −40°, elevation 50°, distance ≈ 36.5 with intensity 3. Keep that distance when moving the key so the existing ±23 shadow camera still covers the frame.

### Starting values

Tune these by eye:

| # | Angle | Key az / el / int / colour | Hemi | Env | Pool x, y, size, strength | Read |
|---|---|---|---|---|---|---|
| 0 | Three-quarter | −40 / 50 / 3 / `#ffffff` | 0.8 | 1.0 | 50 %, 35 %, 75 %, 1 | Hero; matches today's key |
| 1 | Side, exploded | 117 / 35 / 2.2 / `#eaf1ff` | 0.5 | 1.15 | 60 %, 30 %, 70 %, 0.85 | Key from behind the parts: rim light, cooler; separated parts read as silhouettes |
| 2 | Top / blueprint | −40 / 70 / 1.5 / `#ffffff` | 0.5 | 0.7 | 50 %, 50 %, 60 %, 0.4 | Studio dims as the blueprint takes over ("lights down, drawing on") |
| 3 | Hinge detail | −50 / 15 / 3.5 / `#fff6ea` | 0.35 | 0.8 | 55 %, 45 %, 45 %, 0.6 | Low raking warm light across the silver hinge; darker surround, macro feel |
| 4 | Front | 0 / 55 / 3 / `#ffffff` | 0.8 | 1.0 | 50 %, 30 %, 75 %, 1 | Symmetric light from above-front: matching highlights on both rims |

`yaw` is 0 on every row to start (see §3).

### How it animates
- **Pose field:** add `light: number` to `ScenePose`.
  - At angle *i*, `light = i`. `resolveScrollPoses` sets it.
  - During a step it moves **linearly in timeline time across the camera window** `[i, i+1]`, so the light change rides the camera move like the effects do.
  - Cheapest wiring: in `populateScrollTimeline`'s camera `onUpdate`, also set `pose.light = phase.start + driver.progress`. No budget phase or timing change is needed, and step seconds must stay identical.
- **Resolver:** a pure `resolveLight(light: number)` blends the two neighbouring rows by the fractional part.
  - Plain lerp for scalars and colours (in linear colour space).
  - Azimuth takes the shortest way round.
  - Integers return the row exactly.
  - Both the viewer and `v2-demo.tsx` call it.
- **Viewer** (`scroll-viewer.ts`):
  - `createStudio` returns its `key` and `hemisphere` lights so the scroll viewer can drive them. The shop viewer ignores them.
  - `setPose` applies the resolved key position, intensity and colour, the hemisphere intensity and `scene.environmentIntensity`.
  - When the light state changes, set `shadowDirty = true` (only if the key actually moved) and `renderRevision++`. The blueprint cross-fade caches the studio image by revision, so a missed bump shows stale lighting.
  - `light` is optional on `setPose`, like `explode` and `blueprint`; when omitted, it defaults to 0.
- **Background pool** (`v2-demo.tsx` `update()`, `v2-demo.css`):
  - Set `--pool-x`, `--pool-y`, `--pool-size` and `--pool-strength` on the stage from the resolved light.
  - `.v2-demo-studio` builds its gradient from them. **`strength: 1` with the row-0 values must reproduce today's gradient exactly.**
  - Lower strength darkens the outer stop from `--soft` toward `--ink` by at most ≈ 10 % (`color-mix`), so the stage around a dim angle reads darker without turning grey.
  - The blueprint sheet is unchanged and still covers the studio by `--blueprint-mix`.
- **Exposure:** do **not** animate `toneMappingExposure`. The blueprint composite reads it, and an existing test pins it across fades.

## 3. Travelling reflections

Rotate the environment partly with the camera so reflections glide along the frame as it turns, instead of sitting fixed in world space:

```
scene.environmentRotation.y = ENV_FOLLOW × pose.theta + radians(resolvedLight.yaw)
```

- Start with `ENV_FOLLOW = 0.35`, in `scroll-steps.ts` next to the other tuning constants.
  - At 0 the reflections stay fixed to the world, as today.
  - At 1 they would stay stuck to the camera and look painted on.
- At Front (`theta = 0`, `yaw = 0`) the environment is symmetric, so the rims match.
- Keep `scene.backgroundRotation` untouched; the canvas is transparent.
- Use `yaw` per row only if a landed angle needs its reflections nudged after tuning `ENV_FOLLOW`.

Environment rotation does not affect shadows, so it needs `renderRevision++` but not `shadowDirty`.

## Tests

- `tests/viewer.test.mjs`
  - **Environment:** the scroll viewer passes a builder, and the shop viewer still gets `RoomEnvironment`. Extend the harness's fake `PMREMGenerator.fromScene` to record its scene argument if needed.
  - **Each variant:** builds without errors, and every geometry/material of the environment scene is disposed after conversion. An unknown `?env` falls back to `strip`.
  - **Light on landing:** `setPose` with `light = i` puts the key, hemisphere and environment intensity exactly at row *i*.
  - **Light changes:** a light-only change re-renders and marks the shadow dirty; a pure environment-rotation change does not mark the shadow dirty.
  - **Blueprint fade:** the existing test "mix zero retains studio materials…" (~1460) must pass unchanged. Its render counts rely on `light` staying constant across the fade at angle 2.
- `tests/scroll-motion.test.mjs` (or a new small test)
  - `resolveLight` returns rows exactly at integers and the midpoint between rows at `.5`, and azimuth wraps the short way (e.g. 170 → −170 passes through 180).
  - The timeline sets `pose.light` linearly over each camera window, forwards and in reverse, and integer times give integer `light`.
  - **Step seconds and the projection guard are unchanged.** Lighting must not alter any timing.
- `e2e/v2-scroll.spec.ts`: no change expected. Run it if `../server` exists; otherwise say it wasn't run. With `CAPTURE_SCREENSHOTS=1`, attach the five landed angles for each `?env` variant if practical.

## Constraints

- No new dependencies. No HDR/EXR files; the environment is built in code.
- Don't touch the shop viewer's or the try-on engine's lighting, the server, the shop pages or `tests/fixtures/round4`.
- Don't change camera paths, `pace`, `CAMERA_SPEED`, the effect windows or any timing.
- Reduced motion still cuts: light, environment rotation and pool jump with the pose, with no separate fade.
- Rendering stays on demand. Nothing may start a continuous render loop.
- Update `V2-SCROLL-DEMO.md` with a short **Lighting** section (environment variants, per-angle table, `ENV_FOLLOW`) and add `V2-LIGHTING.md` to its file list.

## Done when

- `npm run typecheck`, `npm test` and `npm run build` pass. `npm run test:e2e` passes, or it's reported as not run.
- On `/v2-demo` (or the offline demo with the server off), for each of `?env=strip`, `?env=soft` and `?env=window`:
  - the black acetate shows long, defined highlights along the rims and temples;
  - the lenses show an edge or surface reflection;
  - reflections slide along the frame while the camera turns;
  - the light visibly changes character per angle: rim at Side, dim into Top, raking at Hinge, symmetric at Front;
  - the background pool follows the light without banding;
  - Ink/Blue blueprint transitions look as before;
  - no step takes longer than before;
  - the shop product viewer at `/shop/...` looks unchanged.

## Round 1 result

Implemented in `90df437`, `380bf8b` and `51ada38`. Typecheck, 76 unit tests and the build pass.

A visual review on 2026-10-08 compared the old studio with all three variants at every landed angle (headless Chromium, SwiftShader, 1280 × 720):
- **`strip`:** the acetate goes from flat grey to deep glossy black, with crisp highlights on the rims and temples. A clear improvement.
- **`window`:** similar to `strip`, softer.
- **`soft`:** barely different from the old studio.
- **Top / blueprint:** unchanged.

Issues found:
- **Hinge detail:** the 15° raking key throws long, faint floor-shadow streaks across the background. With pool strength 0.6, the surround reads grey and smudgy.
- **Side, exploded:** the detached lenses reflect the dark room as grey patches. The old studio had the same patches, but they were fainter.
- **Side's cool key colour** is barely visible.

The environment variant hasn't been chosen yet; keep `?env` for now.

# Round 2: grounding shadow and tone mapping

Spec written 2026-10-08. This round covers the original ideas #4 and #6. Idea #5 (background agrees with the light) shipped in round 1 as the background pool.

## 4. Grounding shadow

Today the floor `ShadowMaterial` has opacity 0.035, which is invisible, so the frame floats above the paper. Make the shadow a visible, soft contact shadow, **in the v2 stage only**. The shop viewer shares `createStudio` and must not change.

### Softness
- `PCFSoftShadowMap` has been removed in the installed three (0.186); it now warns and falls back to `PCFShadowMap`.
- Read `node_modules/three/src/renderers/webgl/WebGLShadowMap.js` and the `shadowmap_pars_fragment` chunk to find which of these actually softens a directional shadow in this version:
  - `PCFShadowMap` with `shadow.radius`;
  - `VSMShadowMap` with `radius` / `blurSamples`.
- **Prefer `PCFShadowMap` + `radius`** if it works.
  - VSM requires the receiver in the shadow pass and is prone to light bleeding; use it only if PCF cannot soften. Report which one you used and why.
- The shadow-map type is renderer-wide. Pass it as an optional `createStudio` argument (default `PCFShadowMap`, as today), like the environment builder.

### Opacity per angle
Add `shadow` (floor opacity) to each row's `light` block and blend it in `resolveLight` like the other scalars. `createStudio` returns `floor` alongside `key` and `hemisphere`; the scroll viewer sets `floor.material.opacity`.

An opacity change re-renders (`renderRevision++`), but it does **not** set `shadowDirty`: the shadow map is unchanged, only how strongly the floor shows it.

Starting values; tune by eye:

| # | Angle | `shadow` | Note |
|---|---|---|---|
| 0 | Three-quarter | 0.14 | Visible contact shadow under the frame |
| 1 | Side, exploded | 0.12 | Each floating part casts its own shadow, which shows the separation |
| 2 | Top / blueprint | 0.10 | Sits directly under the frame; the blueprint sheet covers it on landing |
| 3 | Hinge detail | 0.05 | Low: the raking key would otherwise streak across the close-up |
| 4 | Front | 0.14 | |

### Hinge fixes from the round 1 review
On the Hinge detail row only:
- key elevation 15 → **25**;
- pool strength 0.6 → **0.8**.

Leave the other round 1 values alone.

### Shadow camera
Keep the ±23 shadow camera and `KEY_DISTANCE`.
- If a softer `radius` shows edge artefacts or acne on the floor, adjust `shadow.bias` / `normalBias` or `mapSize`. Don't enlarge the frustum unless the shadow is clipped.
- The hinge row is close up and the Top row looks straight down. Check that neither clips its shadow.

## 6. Tone mapping

Today the renderer uses `ACESFilmicToneMapping` at exposure 1.45. ACES flattens deep blacks and shifts hue, which matters for black acetate and for the other colourways.

### Variants
Add a dev query parameter, `?tone=aces|neutral|agx`, v2 only, read the same way as `?env`.

| Variant | Tone mapping | Starting exposure |
|---|---|---|
| `aces` (default, unchanged) | `ACESFilmicToneMapping` | 1.45 |
| `neutral` | `NeutralToneMapping` | 1.0 |
| `agx` | `AgXToneMapping` | 1.0 |

- Pass tone mapping and exposure into `createStudio` as an optional argument; the defaults are today's values.
- The shop viewer and try-on (`engine.ts`) don't change.
- The non-default exposures are starting points for a visual comparison afterwards. Don't tune them blind.

### Blueprint composite (the trap)
`blueprint-render.ts` **hard-codes `ACESFilmicToneMapping(...)`** in its cross-fade shader. If the renderer switches to Neutral or AgX and the shader doesn't, the studio image jumps in brightness and colour the moment a blueprint fade starts (mix > 0) and again when it ends.
- Make the composite use the same operator as the renderer: a define, or the matching function from `tonemapping_pars_fragment`, chosen when the material is created or when tone mapping changes.
- The composite already copies the renderer's exposure every draw; keep that.
- Add a test: for each tone variant, the composite's operator matches `renderer.toneMapping`.

### Constraints
- `toneMappingExposure` stays constant during motion. It is set once per variant, never animated.
- The existing tests that pin 1.45 must still pass with the default `aces`.

## Round 2 tests

- **Shadow opacity:** `resolveLight` blends `shadow`. A landed pose sets the floor opacity to the row value exactly. A shadow-only change re-renders without setting `shadowDirty`.
- **Hinge row:** has elevation 25 and pool strength 0.8. The round 1 test that asserts landed rows must follow the table, not keep the old values.
- **Shop viewer:** keeps opacity 0.035, `PCFShadowMap`, ACES and 1.45.
- **Tone variants:** each `?tone` value sets the renderer's tone mapping and exposure; an unknown value falls back to `aces`. The blueprint composite's operator matches in each case.
- **Unchanged:** the blueprint-fade render-count test (~viewer.test.mjs:1490), timing, the projection guard and the fit tests all pass as they are.
- **E2E:** `npm run test:e2e` if `../server` exists; otherwise report it as not run.

## Round 2 constraints

- Same as round 1: no new dependencies; v2 only; no timing changes; rendering stays on demand; reduced motion cuts with the pose.
- Don't delete any `?env` variant yet; the owner hasn't picked one.
- Update `V2-SCROLL-DEMO.md`'s Lighting section with the `shadow` column, the shadow-map choice and the `?tone` parameter.

## Round 2 done when

- `npm run typecheck`, `npm test` and `npm run build` pass. E2E passes, or it's reported as not run.
- On `/v2-demo` (owner or Claude review; no browser is needed in the implementation session):
  - a soft, visible shadow sits under the frame at the Three-quarter and Front angles;
  - each exploded part casts its own shadow at Side;
  - Hinge has no streaks across the background;
  - blueprint fades show no brightness jump under any `?tone`;
  - the shop viewer is unchanged.

## Later

- Delete the unchosen `?env` and `?tone` variants and their parameters once the owner picks.
