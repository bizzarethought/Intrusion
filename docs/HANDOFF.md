# INTRUSION: front-end and graphics handoff

You are taking over the front end and graphics for INTRUSION (working title in the feasibility study: "Find the Bot"), a hackathon party game for 3 to 10 players where everyone tries to vote out a hidden AI player. Read `feasibility_study.md` for the full game design. This brief covers what has changed since that study, what to build, and what each file in this package is.

## 1. The decision that changes your work

**The game is now 2D with a 3D look, not real-time 3D with low-poly assets.** The owner decided this after seeing the art. If you have a 3D low-poly build in progress, the world, character controller, camera and physics parts of it are being replaced. Networking, round flow, voting, scoring and bot logic are unaffected.

How the look is achieved: every bot and every level was modelled and rendered in Blender, then exported as images. The game draws a pre-rendered background, then bot sprites on top, sorted by vertical position, with a few cheap effects (section 5) so the bots feel like they are standing in the place.

You do not need Blender. Everything here is PNG, JSON and MP4.

**Engine:** your choice. If your stack is already Three.js or React Three Fiber, the least rewrite is an orthographic camera looking at textured planes and sprites. PixiJS or Phaser also work; the sprite atlases are in the TexturePacker "JSON Hash" format both load directly.

## 2. Scope changes from the feasibility study

| Topic | Study says | Now |
|---|---|---|
| View | 3D third-person | Fixed three-quarter overhead view, 2D |
| Art | Free low-poly packs | The pre-rendered art in this package |
| Minigames | Five | Three core: Red Light Green Light, Prompt Podium, Glass Bridge Memory. Fourth if time: Pick a Side. Tile Drop is cut. |
| Camera | Not specified | Follows the local player, zoomed so that player is roughly 1/6 of screen height, with a wide enough view to watch other players |
| Physics | Rapier | Not needed. Flat-plane movement with simple collision. |

One design issue to raise with the owner, not to solve silently: appearances are client-side (each player sees different looks for everyone else), but the study's sus meter example names a player by look ("Teal's reactions looked unusual"). Any on-screen reference to a player must be translated per client or use a shared label such as a scoreboard number.

## 3. What to build

1. **Bot rendering.** Load the ten sprite atlases. Play idle and walk for four directions (right = side frames, left = side frames flipped, down = front, up = back). Show expression frames and the deactivated frame when the game calls for them.
2. **Client-side looks.** `players.json` lists the ten looks. Each client assigns looks to the other players randomly and keeps them fixed for the match.
3. **Levels.** Draw the background image, place bots at pixel positions, sort bots by their feet y so nearer bots draw over farther ones.
4. **Player camera.** Centre on the local player, clamp to the level image bounds.
5. **Grounding effects** from section 5.
6. **Minigame presentation** for the three core games (section 6), plus lobby, vote and reveal screens.
7. **Loading screen.** Play the loading video while a match loads.

## 4. Files in this package

### `sprites_topdown/`  (use these in gameplay)
Rendered from 38 degrees above horizontal, the same angle as the level backgrounds.
- `bot_<look>.png` and `bot_<look>.json` for ten looks: original, crimson, cobalt, lime, sunflower, bubblegum, violet, snow, tangerine, teal.
- Each sheet is an 8 by 6 grid of 360 px cells, transparent, with a soft ground shadow baked in.
- Animations (frame lists and suggested fps are in each JSON): `idle_side` (6), `walk_side` (8), `idle_front` (6), `walk_front` (8), `idle_back` (1), `walk_back` (8).
- Single frames: `blink_side`, `emote_blink`, `emote_happy`, `emote_angry`, `emote_sus`, `deactivated`.
- Anchor (feet on the ground) is at x 0.5, y 0.788 of the cell.
- `players.json`: the list of looks with a UI colour for each.
- Scale: draw a cell so the bot body is about the `bot_height_px` value given in each level JSON.

### `sprites_side/`  (use these for UI, not gameplay)
The same ten looks rendered nearly side-on (12 degrees). Better for portraits: lobby list, vote screen, scoreboard, sus meter, reveal. Same grid and frame names. Anchor y is 0.86.

### `levels/`
For each of `oak` (lobby and voting), `rlgl` (Red Light Green Light), `bridge` (Glass Bridge Memory), `podium` (Prompt Podium), `side` (Pick a Side):
- `<level>_bg.png`: 1920 by 1080 background with no bots.
- `<level>.json`: `pixels_per_meter`, `bot_height_px`, and `spawn_points` as pixel positions with a facing angle. For `bridge` it also lists every glass panel with its pixel centre, size, grid position and whether it is present in the image.
- `example_sprites_on_bridge.png`: six top-down sprites pasted onto `bridge_bg.png` at its spawn points using the scale and anchor described above, with no tint or extra shadow. Use it to check your own placement maths.

### `loading/`
- `loading_screen_reference.mp4`: the owner's render of an earlier cut of the loading screen (10 s). The owner is rendering the final 13.5 s cut and will supply it.

### `feasibility_study.md`
The game design. Sections 3 and 5 matter most to you.

## 5. Making sprites feel grounded

These are cheap and make most of the difference. In rough priority order:

1. **Depth sorting:** draw bots in order of feet y.
2. **Scale lock:** never scale a bot independently of the level; use `bot_height_px`.
3. **Tint per level:** the sprites are lit neutrally and the levels are warm and slightly dim. Multiply sprites by a warm tint (start near 1.0, 0.93, 0.82 at about 85 percent brightness) and tune by eye.
4. **Blob shadow:** the baked shadow is faint on dark grass. Add a soft dark ellipse under each bot.
5. **Water reflection:** on water areas, draw a vertically flipped copy of the bot below it at low opacity.
6. **Hop and bob:** a small vertical offset while moving sells the motion; the walk frames already include a body bob.
7. **Splash and ripple overlays** when a bot falls in water. No art for this is included yet.

## 6. Minigame presentation notes

- **Red Light, Green Light (`rlgl`):** players run left to right between two lines of small roses. The giant rose at the right is the watcher. Green light: rose open. Red light: rose closed. Only the open rose is in the background; a closed-rose frame is not included yet.
- **Glass Bridge Memory (`bridge`):** two rows of seven panels over the pond. Safe panels flash once, then players cross from memory. Use the panel positions in `bridge.json` to draw the flash, and to draw a break and fall when a wrong panel is stepped on. The background shows three panels already missing and one tilted, which was for the preview; treat `present: false` panels as already broken or ask for a full-bridge render.
- **Prompt Podium (`podium`):** ten boulders in an arc, one per player, around a rose. Mostly a typing interface over the level.
- **Pick a Side (`side`):** a rose bank on the left and a boulder bank on the right, joined by stepping stones. Players walk to the side they choose.
- **Lobby and voting (`oak`):** the oak trunk by the pond.

## 7. What is missing or rough

Be direct with the owner about these; none are solved in this package.

- **No collision maps.** Nothing marks where water, rocks and the trunk block movement. Either author simple shapes by hand over each background, or ask for rendered collision masks.
- **No foreground layers.** Bots cannot yet walk behind rocks or the trunk. This was tested and works when a separate foreground image is drawn over the bots, but those layers have not been rendered for these levels.
- **Levels are one screen each.** Each background is a single 1920 by 1080 view of a meadow about 7 m wide. A camera that follows the player needs larger maps; these are not made. Until then, show the whole level and keep the camera fixed, or zoom modestly.
- **No travel map** between arenas.
- **Water banding.** The pond renders in flat blue bands from this angle.
- **`podium` reads weakly.** The boulders are small relative to the bots.
- **Sprites were checked on one background only** (`example_sprites_on_bridge.png`). Scale and angle match. They read slightly brighter than the scene, so the tint in section 5 is still worth doing.
- **No sound, no UI art, no splash or flash effects.**

## 8. Asking for more art

The Blender scenes and build scripts live with the owner's other session. Things it can render on request: full-bridge background, closed watcher rose, foreground and collision layers, larger maps, level variants (water level and prop positions can change per render), extra bot expressions, effect sprites.
