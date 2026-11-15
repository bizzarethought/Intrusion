# Frontend rendering and profiling

Gameplay uses PixiJS/WebGL: one background texture, one shared texture source per loaded robot look, cached frame views, and cached name labels. Pixi batches compatible sprites while preserving foot-depth order. No physics, live lighting, or blur filters are used. The new FX layer animates at most 96 foliage pieces (48 on narrow screens), below the 150-piece ceiling.

The display resolution multiplier is capped at 1.5. Level backgrounds ship as JPEG and the robot sheets at the size they are drawn (1920 × 1440, 240 px per frame); the ground shadow baked into each sheet is stripped once as it loads. Warm tint is applied on the GPU. Assets load on demand for visible looks; the landing page uses one demo look. Portraits are loaded for assigned lobby looks. Previously loaded looks remain cached for reuse.

Game movement and portrait animation update outside React state. Network positions are captured once per state patch, rather than rebuilding and sorting the roster every animation frame. Remote players render 100 ms behind the latest arrival timeline, interpolating between samples. Local movement remains predicted immediately; phase changes reset the buffer and respawns snap. Missing packets hold the last known remote position rather than extrapolating through obstacles.

## Checking performance

1. Start the server and client normally, then open `http://localhost:5173/?perf=1`.
2. Open Chrome DevTools → Performance and record loading, movement, stopping, voting, and the return to the oak.
3. Inspect `window.intrusionPerformance` in the Console after at least 120 rendered frames. It reports FPS, frame interval p95, average CPU frame work, bot count, loaded gameplay sheets, and resolution multiplier. It does not measure GPU completion time.
4. In Network, filter `topdown` and `portraits` to inspect which looks were requested. Use a cold cache to inspect loading; use a warmed cache to inspect steady-state drawing.
5. Repeat on the target phones and with network/CPU throttling. Watch main-thread long tasks and GPU/raster work; FPS alone does not identify the bottleneck.

Local smoke test on November 14, 2026: headless Chrome, 1440 × 900 viewport, device pixel ratio 2 capped to 1.5, ten players (nine human clients and one bot). During Red Light, Green Light: approximately 60 FPS, 16.8 ms p95 frame interval, 0.58 ms average CPU frame work, and no page errors. A second test with three human clients and one bot loaded four gameplay sheets, measured approximately 60 FPS and 0.45 ms average CPU frame work, and returned to the menu and resized without page errors. This is a post-change smoke measurement, not a before/after benchmark or a mobile performance guarantee.

Validation: `cd client && npm run check && npm test && npm run build`. Interpolation tests cover intermediate positions, immediate local state, packet gaps, respawns, and phase resets.

## FX pack integration

`elements/fx_pack` is the supplied art; the runtime copies live in `client/public/assets/fx`. `fx.ts` loads the manifest, packs the four foliage images into one shared GPU atlas, repacks water to 1536 × 1152 and rose frames to 2048 × 1536, and caches them between arena changes. The rose atlas is shared by the oak screen and Red Light, Green Light.

The rose traverses its ten closed-to-open frames in 300 ms, with reversal from its current pose when the server signal changes. That closing duration fits within the server's 400 ms reaction grace. A ground sample, masked once with the open head's alpha, covers the open rose already baked into the background. The original background is preserved; a future clean background plate can replace this approximation.

Water uses 10 FPS ping-pong playback in conservative pond masks, preserving the source image's banks and reflections. Foliage uses stable placements and gentle GPU skew, with at most 96 pieces (48 below 700 CSS pixels). The floor layer stays behind players. Masks and texture preparation run once per level, not per animation frame. Reduced-motion mode stops water and foliage and switches rose poses immediately. FX load failures leave the original level and game controls usable.

With the new FX, a local ten-player Chrome smoke test measured approximately 60 FPS, 16.8 ms p95 frame interval, and 0.8 ms average CPU frame work, with 86 foliage pieces and two water areas. Browser checks covered rose endpoints, changing water frames, lazy rose loading, reduced motion, mobile limits, arena cleanup, and a missing water asset. These measurements are local headless results; real phones should still be profiled.

Use `?perf=1` and inspect `window.intrusionFx` for live readiness, active level, foliage count, water/rose frame numbers, reduced-motion state, and load errors. The periodic `window.intrusionPerformance` report includes the FX snapshot.

### Main screen motion visibility

The oak scene now uses stronger root-anchored foliage sway, a slow water current, six expanding pond rings, and up to 24 drifting pollen sprites (12 on narrow screens). Ring and pollen textures are drawn once and reused; no live blur filters are used. Including foliage, the scenery stays below 150 moving pieces. All added motion stops or hides in reduced-motion mode.

A landing-page browser check compared screenshots of pond and grass regions that exclude the robot and UI. Over 1.4 seconds, approximately 2.3% of pond pixels and 39.4% of grass pixels changed above a visible color threshold. The same run measured 60 FPS and 0.72 ms average CPU frame work locally, with no page errors. Narrow-screen limits and reduced-motion behavior also passed. This verifies scenery movement rather than relying solely on advancing animation counters.


The oak rose now uses the FX pack's ten transparent petal frames at a fixed position and scale. Its eight-second idle cycle holds closed, opens over one second, rests open, and closes over one second. The old transform-based background cutout has been removed. Only the stationary cover uses a mask of the baked-in rose; moving pixels come exclusively from the supplied FX atlas. Reduced-motion mode holds the open frame. Browser checks confirm distinct open/closed images with identical sprite scale and no page errors.

The oak composition now has two static open roses (bank and far meadow) and one animated rose in clear foreground grass. All use the atlas's natural aspect ratio, with leafy bases. Per-frame petal bounds determine the anchor so the bottom of each bloom stays planted as it opens and closes. Browser validation confirmed two static roses, distinct animated endpoints, constant scale, and reduced-motion behavior without page errors.

## Turning regression

Robot scale now explicitly assigns both axes each frame. Pixi's width setter preserves a negative horizontal scale, which previously let a left-facing mirror persist into right/front/back poses. Walking also takes priority over temporary reaction poses, and direction selection compensates for the camera's depth compression. Click movement clamps each step to the remaining target distance, preventing alternating overshoots at low frame rates.

Regression tests use actual Pixi sprites to check repeated mirror resets. Live browser matches verify repeated left/right/up/down turns, movement continuing through turns, returning to idle, advancing walk frames, and settling at a short click target. Those browser checks passed both at normal rendering speed and with 35 ms added to each animation-frame callback to exercise low-frame-rate movement. With `?perf=1`, `window.intrusionPlayers()` reads current position, facing, movement, texture frame, and signed scales for diagnosis without publishing per-frame React state.
