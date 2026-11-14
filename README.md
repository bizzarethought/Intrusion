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

## Built with

- Three.js with React Three Fiber or Babylon.js
- Rapier physics
- Colyseus on Node.js
- AMD Developer Cloud or Token Lab
- In-memory game state for the hackathon demo

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

## Keep secrets secret

API keys stay server-side and never go in the repository. Use environment
variables such as `AMD_TOKENLAB_API_KEY`; local `.env` files are ignored by
Git.
