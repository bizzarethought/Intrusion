# Intrusion

> **Can you catch the AI before it catches you?**

Intrusion is our Emory Hacks multiplayer party game for **3–10 human players
plus one hidden bot**. Compete in Red Light, Green Light, compare reactions,
discuss suspicious behavior, and vote out the AI before it survives every vote.

The world has a rendered 3D look: Blender backgrounds and animated robot
sprites are drawn in a 2D GPU scene, with React handling the interface.

## Play the current demo

1. Create a private room and share its room code or link.
2. At least three humans join; the host starts the match. For a local test,
   use three browser tabs with different display names.
3. After the intro and a short ready phase, run on green and freeze on red.
   Moving on red sends you back to the start. Earlier finishers earn more points.
4. Complete a reaction check, chat, and vote for the suspected bot or skip.
   Ties eliminate nobody, but still use a vote round.
5. Catch the bot to win. Otherwise, another round begins until the bot wins
   by surviving the vote budget or leaving only one human in play.

**Controls:** WASD or arrow keys to move, click/tap the ground to walk to a
point, Tab for scores, and Space or the on-screen pad for the reaction check.
Eliminated players can watch. Play again returns to the menu to create or join
a new room.

## Run locally

Requires **Node.js 22.12 or newer**, npm, and a browser with WebGL support.
Run these commands from the repository root:

```bash
npm --prefix server ci
npm --prefix client ci
```

Start the game server in one terminal:

```bash
npm --prefix server run dev
```

Start the frontend in a second terminal:

```bash
npm --prefix client run dev
```

Open **http://localhost:5173**. The backend listens on port **2567** by default.
Keep both terminals running. Client changes reload automatically; a backend
restart disconnects existing matches, so create a new room afterward.

For devices on the same Wi-Fi, start the frontend with
`npm --prefix client run dev -- --host 0.0.0.0` and open the network URL Vite
prints. The client connects to port 2567 on the page's hostname by default.

## Optional AI configuration

The demo works without an AI service: the bot uses simple contextual chat replies.
To generate its voting-discussion chat with an OpenAI-compatible endpoint,
create `server/.env` using `server/.env.example` as a template:

```dotenv
PORT=2567
AI_BASE_URL=https://your-model-server.example/v1
AI_API_KEY=your-key
AI_MODEL=your-model-name
```

`AI_BASE_URL` is the API prefix; the backend appends `/chat/completions`.
An AMD-hosted model can be used through this interface. Missing configuration,
failed requests, and timeouts use the built-in fallback.

During voting, the bot can defend itself, answer questions, challenge accusations,
and follow up using the last 20 chat messages, including its own replies. Direct
mentions take priority. Responses have a short thinking delay and at least four
seconds between messages, with at most five messages per voting round. Pending
replies are canceled when voting ends. Without a configured model, the same
conversation flow uses simple contextual templates rather than a full debate.

The model currently generates **chat only**. The server scripts the bot's
movement, reaction delays, occasional mistakes, and random votes. The bot's
reaction-check score is randomized. Human playtest-based calibration remains
future work. Hidden bot identity stays server-side until the final reveal.

For a separate backend host, set `VITE_BACKEND_URL` in `client/.env` using
`client/.env.example` as a template. Use a hostname reachable by the players'
devices; `localhost` on a phone points to the phone itself.

## Implementation status

| Feature | Current status |
| --- | --- |
| Rooms, host controls, multiplayer movement | Implemented with Colyseus |
| Red Light, Green Light | Playable, with server movement checks and scoring |
| Reaction checks, chat, voting, elimination, reveal | Implemented |
| Bot chat | Paced back-and-forth during voting; optional model endpoint with contextual fallback |
| Main screen and lobby | Animated water, foliage, pollen, two static roses, and one opening/closing rose |
| Arena rose | Opening/closing FX frames follow the server's red/green signal |
| Glass Bridge, Prompt Podium, Pick a Side | Artwork and client mappings exist; game rules are not implemented |
| Tile Drop, Handler mode, public matchmaking | Not implemented |
| Rejoining an active match | Not implemented |

The ready phase places players in the arena; there is no playable travel map.
Collision uses approximate client shapes and server field boundaries. Design
and feasibility documents include planned features beyond the current demo.

## Stack and layout

| Layer | Technology |
| --- | --- |
| Interface | React and TypeScript |
| Game rendering | PixiJS/WebGL, sprite atlases, pre-rendered Blender levels |
| Development and frontend build | Vite |
| Multiplayer backend | Node.js, TypeScript, Colyseus |
| AI chat | Optional OpenAI-compatible HTTP endpoint |
| State | In memory; no database required |

```text
client/      Interface, renderer, network client, and public runtime assets
server/      Rooms, game rules, state, timers, and AI chat client
elements/    Source sprite, level, and FX exports
art/         Blender source assets
docs/        Design, art handoff, and performance notes
```

The animation loop updates sprites outside React. Remote movement interpolates
between network snapshots; local movement is predicted immediately. Shared GPU
textures, cached labels, a 1.5× resolution cap, and scenery limits keep rendering
lightweight. Reduced-motion settings stop ambient scenery and hold the idle
rose open. No real-time 3D lighting or physics engine is used.

## Checks and builds

From the repository root:

```bash
npm --prefix client run check
npm --prefix client test
npm --prefix client run build
npm --prefix server run check
npm --prefix server test
npm --prefix server run build
```

These produce `client/dist` and `server/dist`. A production setup must serve
the frontend and run the backend; previewing the frontend alone does not start
a multiplayer server. The compiled backend starts with
`npm --prefix server start`.

For local profiling, add `?perf=1` to the game URL and inspect
`window.intrusionPerformance`, `window.intrusionFx`, and
`window.intrusionPlayers()` in browser DevTools. See the performance notes for
measurement limits and browser verification steps.

## Project docs

- [Performance, FX, and profiling](./docs/performance.md)
- [Art and frontend handoff](./docs/HANDOFF.md)
- [Feasibility study](./docs/feasibility_study.md)
- [Design decisions](./docs/decisions.md)
