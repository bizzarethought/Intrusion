# Find the Bot

> **Can you catch the AI before it catches you?**

**Find the Bot** is our Emory Hacks 3D multiplayer party game. Run through a
shared world, compete in chaotic mini-games, interrogate your friends, and
vote out the player who is secretly an AI.

The twist: the bot does not just chat. It runs the course, makes mistakes,
answers prompts, joins conversations, and votes like an imperfect human.

## The demo

- **3-10 players** join a private room.
- Players run from spawn to the next arena.
- Everyone competes for points.
- Surprise Turing checks feed a deliberately unreliable sus meter.
- Players argue, accuse, and vote someone out.
- The reveal shows whether the vote was human or AI.

Catch the AI early for the biggest score. If it survives the vote-outs, the AI
wins.

## Five ways to look suspicious

1. **Red Light, Green Light** - reaction timing
2. **Pick a Side** - decisions and crowd-following
3. **Prompt Podium** - humor, chat, and typing rhythm
4. **Glass Bridge Memory** - memory and accuracy
5. **Tile Drop** - panic movement and pathing

Every mini-game creates evidence, but no single clue proves anything.

## What makes the bot believable?

The bot is split into two systems:

- **AI model:** chat, prompt answers, Turing checks, accusations, and votes
- **Game server:** travel, movement, timing, mistakes, pathing, and mini-game
  actions

It learns its imperfections from our own playtest data. The server only gives
the bot information a normal player could see, keeping hidden roles and
server state secret.

## Tech stack

| Layer | Technology |
| --- | --- |
| 3D client | Three.js with React Three Fiber or Babylon.js |
| Physics | Rapier |
| Multiplayer server | Node.js with Colyseus |
| AI model | AMD Developer Cloud |
| Game state | In-memory state for the hackathon demo |

## Backend status

The backend foundation is in `src/` and currently includes:

- Colyseus room creation and player joining
- Server-authoritative movement and scoring
- Match phases, round timers, and mini-game rotation
- Hidden bot creation and scripted travel behavior
- Vote validation and elimination
- Token Lab/AMD-compatible chat client with a safe fallback

To run it locally after installing Node.js:

```bash
npm install
cp .env.example .env
npm run dev
```

## Build order

1. Server-authoritative multiplayer movement
2. One small 3D world and travel route
3. One bot connected to the AI API
4. One complete mini-game
5. Voting, scoring, and the reveal
6. Remaining mini-games and bot tuning

We are optimizing for a playable demo, not a giant world. If time gets tight,
we cut mini-games before we cut the multiplayer loop.

## Project docs

- [Feasibility study](./feasibility_study.md)
- [Design decisions](./decisions.md)

