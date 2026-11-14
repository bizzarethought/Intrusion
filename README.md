# Find the Bot

**Find the Bot** is a 3D multiplayer party game for Emory Hacks. Players run
through a small shared world, compete in mini-games, and vote after each round
to find the AI player hidden among them.

The game is designed for **3 to 10 human players** in a private room. The
challenge is not simply to identify an AI response: the bot also plays the
mini-games, travels between arenas, chats, and votes like an imperfect human.

## How it works

1. Players spawn in a shared 3D world.
2. Everyone runs to the next mini-game arena.
3. Players compete for points.
4. One or two players receive a surprise Turing check.
5. Players discuss and vote someone out.
6. The game reveals whether the voted player was human or AI.
7. The next arena opens.

The AI wins by surviving the vote-outs. Humans win by catching it. A noisy
sus meter provides clues based on reaction time, accuracy, consistency, and
typing rhythm, but it is intentionally not a final answer.

## Mini-games

The hackathon mini-game pool is:

- Red Light, Green Light
- Pick a Side
- Prompt Podium
- Glass Bridge Memory
- Tile Drop

Each mini-game exposes different behavior: reaction timing, decision-making,
chat and typing, memory, or movement.

## AI design

The bot has two parts:

- **Model-powered behavior:** chat, prompt responses, Turing checks, meeting
  discussion, and voting.
- **Scripted gameplay behavior:** movement, travel, reaction delays, mistakes,
  pathing, and mini-game actions.

The model must only receive information available to a normal player. Hidden
roles and server-only state stay on the authoritative game server. Bot
behavior is tuned using the team's own playtest data so it is varied rather
than perfect.

## Planned technology

- **Client:** Three.js with React Three Fiber or Babylon.js
- **Physics:** Rapier
- **Multiplayer:** Colyseus on Node.js
- **AI:** AMD Developer Cloud or Token Lab through an OpenAI-compatible API
- **Storage:** In-memory state for the demo; persistent stats later if needed

## Development priorities

1. Build server-authoritative multiplayer synchronization.
2. Get players moving together in one small 3D world.
3. Connect one bot to the server and AI API.
4. Complete one mini-game end to end.
5. Add the round flow, voting, scoring, and reveal.
6. Expand to the remaining mini-games and tune bot behavior.

The project intentionally prioritizes a small, playable world over a large
world or complex physics system. If time is limited, reduce the number of
mini-games rather than leaving the multiplayer loop unfinished.

## Project documents

- [Feasibility study](./feasibility_study.md)
- [Design decisions](./decisions.md)

## Security

API keys must remain server-side and must never be committed to the
repository. Store local credentials in environment variables, such as
`AMD_TOKENLAB_API_KEY`, and keep `.env` files untracked.
