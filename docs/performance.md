# Frontend rendering and profiling

Gameplay uses PixiJS/WebGL: one background texture, one shared texture source per loaded robot look, cached frame views, cached name labels, and a shared shadow sprite. Pixi batches compatible sprites while preserving foot-depth order. No physics, live lighting, or blur filters are used. The new FX layer animates at most 96 foliage pieces (48 on narrow screens), below the 150-piece ceiling.

The display resolution multiplier is capped at 1.5. Source backgrounds are unchanged. Gameplay sheets decode directly at 1920 × 1440 (240 px per frame), rather than decoding at full size and running a JavaScript tint loop. Warm tint is applied on the GPU. Assets load on demand for visible looks; the landing page uses one demo look. Portraits are loaded for assigned lobby looks. Previously loaded looks remain cached for reuse.

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

`elements/fx_pack` is the supplied art; the runtime copies live in `client/public/assets/fx`. `fx.ts` loads the manifest, packs the four foliage images into one shared GPU atlas, repacks water to 1536 × 1152 and rose frames to 2048 × 1536, and caches them between arena changes. Rose textures load only when Red Light, Green Light is shown.

The rose traverses its ten closed-to-open frames in 300 ms, with reversal from its current pose when the server signal changes. That closing duration fits within the server's 400 ms reaction grace. A ground sample, masked once with the open head's alpha, covers the open rose already baked into the background. The original background is preserved; a future clean background plate can replace this approximation.

Water uses 10 FPS ping-pong playback in conservative pond masks, preserving the source image's banks and reflections. Foliage uses stable placements and gentle GPU skew, with at most 96 pieces (48 below 700 CSS pixels). The floor layer stays behind players. Masks and texture preparation run once per level, not per animation frame. Reduced-motion mode stops water and foliage and switches rose poses immediately. FX load failures leave the original level and game controls usable.

With the new FX, a local ten-player Chrome smoke test measured approximately 60 FPS, 16.8 ms p95 frame interval, and 0.8 ms average CPU frame work, with 86 foliage pieces and two water areas. Browser checks covered rose endpoints, changing water frames, lazy rose loading, reduced motion, mobile limits, arena cleanup, and a missing water asset. These measurements are local headless results; real phones should still be profiled.

Use `?perf=1` and inspect `window.intrusionFx` for live readiness, active level, foliage count, water/rose frame numbers, reduced-motion state, and load errors. The periodic `window.intrusionPerformance` report includes the FX snapshot.
