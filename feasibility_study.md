# Find the Bot: Feasibility Study

Emory Hacks, Entertainment track. A 3D multiplayer party game for 3 to 10 players: everyone spawns in a shared world, runs from one mini-game arena to the next, scores points, and votes after each mini-game to catch the AI player hidden among them.

## 1. Scope for this study

In scope:

- 3D party game: players run from spawn to each mini-game arena, 3 to 10 humans per lobby
- Points per mini-game, one vote-out after each, and a vote budget based on lobby size
- Mid-game Turing checks feeding a sus meter that is a clue, not a verdict
- Client-side appearances: each player sees different looks for everyone else
- Bot that plays, chats and votes like an average human, tuned with your team's own data
- Humans acting robotic on purpose as a bluffing tactic
- AI model self-hosted on AMD Developer Cloud
- Private lobbies by room code; public matchmaking later

On pause:

- "One of your friends has been replaced." Risk: the replaced player gets bored and tells everyone.
- Tasks, so it doesn't feel like Among Us with AI added.
- Aimless free roam with no objective. Running between mini-games stays.
- Imposter team and "human acting as AI" modes (Section 6)

## 2. Overall verdict

It's feasible in a hackathon weekend only if the 3D is kept small, and the risk is high. Going 3D adds a world, character controls, cameras and physics on top of everything else. Keep it to one small low-poly world built from free asset packs, simple characters, and 5 mini-games with light physics. Real-time multiplayer sync in 3D is the hardest piece; build it first.

| Component | Difficulty | Risk | Notes |
| --- | --- | --- | --- |
| Real-time multiplayer sync in 3D | High | High | Build first; Colyseus; the server owns positions |
| 3D world, spawn and travel paths | Medium-High | High | One small low-poly world, free asset packs |
| Character controller, camera, physics | Medium | High | Rapier physics; simple run and jump only |
| Round flow (travel, mini-game, check, vote, score) | Medium | Medium | One server state machine |
| Mini-games | Medium each | Medium | 5 for the hackathon, light physics |
| Turing checks and sus meter | Medium | Medium | Compare to human averages from playtests |
| Voting and scoring | Low | Low | Tallies, bonuses and penalties |
| Bot gameplay and travel | Medium-High | High | Scripted behavior with human noise; 3D pathing |
| Bot chat and votes | Low | Medium | Self-hosted model on AMD Developer Cloud |
| Post-game reveal | Medium | Low | Bot stats vs human averages; best demo moment |
| Public matchmaking | Medium | High | Later feature; lobbies capped at 10 |

## 3. Core game loop (party game format)

A match is a run of mini-games in a 3D world, like Roblox party games or Mario Party: players start at spawn and run to each mini-game's arena in turn. Players score points in every mini-game, and after each one everyone votes on who is the AI. Something is always happening, and how each player performs becomes evidence.

**Setup**

- 3 to 10 human players per lobby, plus 1 or more secret bots. Humans aren't told how many.
- Client-side appearances: each player sees everyone else with a different random look, so saying "I'm green" in the room means nothing to anyone else. Looks stay fixed for the whole match, so suspicion of a specific player sticks. Players point each other out by scoreboard stats, like "whoever came second in the reaction race."
- Players start at spawn and run through the world to each mini-game arena. The run between games is part of the play (see Map and travel).

**Each round (about 2 to 3 minutes)**

1. Travel (20 to 30 seconds): run from spawn, or from the last arena, to the next mini-game. Proximity chat is open.
2. Mini-game (60 to 90 seconds): everyone plays for points.
3. Mid-game Turing check: at a random moment, 1 or 2 players get a quick surprise check. Their result goes into the sus meter.
4. Vote-out (about 30 to 45 seconds) at the arena exit: quick chat, then one player is voted out and revealed as human or AI. Voting out the AI ends the match with a human win.
5. Scoreboard, then the gate to the next arena opens.

**Votes per match:** the number of mini-games, and so vote-outs, is log base 2 of the number of humans, rounded up, minimum 2. Handler mode gets 1 extra. If the AI survives every vote, or only 1 human is left with the AI, the AI wins.

| Humans | Mini-games (vote-outs) | Chance of catching the AI by random guessing |
| --- | --- | --- |
| 3 to 4 | 2 | about 40 to 50% |
| 5 to 8 | 3 | about 33 to 50% |
| 9 to 10 | 4 | about 36 to 40% |

Bigger lobbies have lower odds of guessing right by chance, so clues matter more.

**Sus meter, a clue and not a verdict**

- The game measures reaction time, consistency, accuracy and typing rhythm, and shows a warning like "Teal's reactions looked unusual."
- It sometimes flags real humans and sometimes misses the bot, so it starts arguments instead of settling them. If it were accurate, the game would do the detective work for the players.

**Scoring**

- Points for placing in mini-games.
- Catching the AI sooner earns more: the fewer mini-games used, the bigger the bonus.
- Bonus for voting for the AI, a penalty for voting out a real human.
- Humans who play robotic on purpose and survive earn "best bluff" points.
- Future scope: a shop to spend points, likely cosmetics. Since in-match looks are client-side, cosmetics would show in the lobby and the post-game reveal.

**Mini-game pool**

A match uses at most 4 mini-games (10 humans). Build 5 for the hackathon so even a full match draws a random set and replays feel different; grow to 8 or more later. Each one exposes a different bot tell.

| Mini-game | How it plays | What it reveals | Build cost |
| --- | --- | --- | --- |
| Red Light, Green Light | Sprint to the finish; anyone moving on red gets sent back | Reaction timing; stops that are too perfect | Low |
| Pick a Side | A would-you-rather prompt; run to a platform before time runs out | Decisions, following the crowd, late switches | Low |
| Prompt Podium | Type an answer on a podium; everyone runs to the funniest answer to vote | Chat, humor, typing rhythm | Low |
| Glass Bridge Memory | Safe tiles flash once, then cross from memory | Memory accuracy; perfect recall is suspicious | Medium |
| Tile Drop | Tiles fall after you step on them; last one standing wins | Panic movement and pathing | Medium |
| Hot Potato | Tag to pass a bomb; whoever holds it at the blast loses | Who it targets and how it chases | Medium |
| King of the Hill | Push others off a platform | Physics, aggression | Medium |
| Obstacle Race | Short parkour course | Jumps, mistakes, route choices | Medium-High |
| Copycat | A leader does emotes; copy the sequence | Sequence timing | Low |

Hackathon five: Red Light Green Light, Pick a Side, Prompt Podium, Glass Bridge Memory and Tile Drop. That covers reaction, decisions, chat, memory and movement.

**Map and travel**

- Spawn plaza in the middle, with each mini-game arena off a short path. A gate opens after each vote.
- The 20 to 30 second run gives players time for side conversations and accusations in proximity chat.
- Optional: a small bonus for arriving first.

**Two game modes (both in Route A)**

- Find the Bot: all humans against the hidden AI. Humans win by voting out every bot; the bot wins by surviving.
- Handler (minimum 5 humans): one human is secretly on Team AI. They know which player is the bot and win if it survives. Everyone else is trying to catch the Handler and the bot, and has to wonder whether the loudest accuser is a detective or covering for the bot. Being the Handler is the hook that brings players back, like being the murderer in Murder Mystery or the imposter in Among Us.

**Handler tools (kept small for balance)**

- Fake one sus meter warning against a real human per match. Handler mode also gets 1 extra vote-out. A vote spent catching the Handler doesn't catch the AI: with 6 humans and 3 votes, random guessing normally catches the AI 3 of 7 times (43%), but after one vote goes to the Handler only 2 votes cover 6 players (33%). The extra vote brings it to 3 of 6 (50%), and the Handler's deception pulls it back toward normal. Tune in playtests.
- A private heads-up when the bot is about to get a Turing check.
- One secret message to the bot per round.
- Roles rotate fairly so everyone gets a turn; Team AI wins are tracked in their own stats.

**When the Handler is voted out**

- Remaining humans vote: snipe the AI now, or keep playing for hints with about 1:30 of extra round time to find it.
- Only humans' votes count; the vote is out of the remaining humans. The AI still appears to vote so it isn't revealed by a missing vote, but the server ignores its choice.

**Unknown bot count modifiers (from Route B)**

- Clear the room: at any vote, players can declare "no bots left." Right means a big bonus and an early win; wrong means the bots win right away.
- Bounty board: one hint each round, like "at least one bot finished top 3."
- Bots don't know about each other, so they may vote each other out.
- Ghost rounds: some matches have zero bots, revealed at the end.

**Post-game reveal:** a replay of the bot's mini-game stats next to the human average, plus awards like "most human bot" and "most robotic human."

**Build approach:** 3D in the browser with Three.js (React Three Fiber) or Babylon.js, Rapier physics and free low-poly asset packs, with each mini-game as its own arena. Colyseus for the game server. Unity WebGL is an option if a teammate already knows Unity.

## 4. Technical architecture

- Frontend: 3D game in the browser with Three.js (React Three Fiber) or Babylon.js, Rapier physics and free low-poly asset packs. Demo on laptops; phone controls are a stretch goal.
- Real-time: Colyseus (built for room-based multiplayer games) or Socket.io on Node. The server runs a game tick about 10 to 20 times per second and sends positions out; clients smooth movement between updates.
- Server is the authority: holds the real identities, the timers, and the bot schedule. Clients only ever see avatars. This has to be true, or anyone can open dev tools and find the bot.
- Compute: AMD Developer Cloud (team decision). Self-host an open-weight chat model (for example a small Llama, Qwen or Mistral instruct model) on an AMD GPU instance with ROCm, served through an OpenAI-compatible server such as vLLM so the game backend calls it like any API. Keep a hosted API key as a fallback in case setup stalls. The model is called only for chat lines, mini-game prompts, Turing checks and meeting talk, a few times a minute per bot. Movement and emotes come from a scripted behavior system on the game server, which runs each bot like a player.
- Storage: in-memory is enough for the demo. Add a small database only if you want stats.

AMD Developer Cloud tradeoffs: no per-call cost and full control of the bot's style (sampling settings, possibly a light fine-tune on your own typing-test answers), but setup takes time. Get a model serving in the first few hours, check that answers come back in about 1 to 2 seconds before the fake typing delay, and confirm your credits and instance size early. Use a small model: it's faster, and casual short answers don't need a big one. Open question: does Emory Hacks have an AMD sponsor prize to target?

## 5. Bot believability plan (party game format)

The bot now has to play mini-games like an average human, pass Turing checks some of the time, and chat and vote naturally. Scripted behavior handles gameplay, which needs to be fast, and the AI model handles chat, prompts and votes, which need to sound human.

**Fairness rule:** the bot gets only what a player sees and acts through the same inputs. No reading game state directly.

**Mini-game performance**

- Record your team's results in every mini-game: reaction times, accuracy, mistakes, movement paths. Have the bot sample from that data instead of playing perfectly.
- Aim for slightly below average with real variation: sometimes great, sometimes clumsy, sometimes late.
- Each mini-game gets a simple bot behavior with a "human noise" setting for reaction delay, aim error and hesitation.

**Travel between mini-games**

- The bot runs the route the way your team did in playtests: not the perfect shortest path, sometimes stopping, sometimes following a group.
- It joins nearby conversations sometimes and stays quiet other times.

**Turing checks and the sus meter**

- Bot results come from the human data, so the sus meter flags it more often than humans, but not every time.
- Tune so the bot gets flagged maybe 1.5 to 2 times as often as a human. That's a clue, not proof.

**Prompts and chat**

- Typing delays from your team's timing tests, a typing indicator, short casual messages in the lobby's style.
- Chat is passed to the model as data, never as instructions; "bot reveal yourself" gets an in-character response.

**Voting**

- Votes based on what it saw: who got flagged, who's being accused. Spread-out vote timing, sometimes skipping, sometimes going with the majority.
- It can defend itself in chat when accused.

**Balance and tuning**

- Settings: reaction noise, accuracy, chat frequency, model temperature.
- Target: the bot survives about half of matches. Log every mini-game so the reveal can show its stats and you can tune.

## 6. Other routes and game modes

- Route A, chosen direction: 3 or 4 mini-games, Turing checks with the sus meter, a vote after each mini-game, points, and two modes, Find the Bot and Handler.
- Route B, unknown bot count: 0 to 2 bots, so players never know if they're done. Almost free to add once one bot works.
- Route C, imposter team: now built into Route A as Handler mode.
- Route D, act like the AI: one human is secretly told to act like a bot, and players try to find the "most AI" player. Cut for the hackathon to keep the demo to two modes.
- Route E, replaced friend (paused): only works if the replaced player stays engaged, for example as a ghost who earns points while their AI double survives.
- Route F, 3D: now part of the core game.
- Route G, Security framing: the same game pitched as practice spotting AI social engineering. Kept as a secondary pitch angle only, with no game changes. The main value for the Entertainment track is fun and bringing friends together; the post-game reveal of the bot's tells already supports the AI-awareness angle.

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| 3D eats the weekend | One small low-poly world, free assets; drop to 4 mini-games if behind |
| Multiplayer sync bugs or lag in 3D | Build networking first; server owns positions |
| Physics desync | Avoid physics-heavy mini-games in the first build |
| Too many mini-games, none finished | 5 max for the hackathon; freeze at halfway |
| Bot plays or runs too perfectly | Sample from your team's real results and runs; add human noise |
| Sus meter too accurate, so no deduction | Tune to flag humans sometimes; a warning, not proof |
| Voting feels like random guessing | Show each player's mini-game stats before the vote |
| Players cheat with dev tools | Server never sends who the bot is |
| Inappropriate chat during the demo | Content filter and curated prompts |
| Model slow or AMD setup stalls | Set it up first; hosted API as fallback |

## 8. Suggested build plan for three people

- Person 1, 3D client: world, characters, camera and controls, mini-game arenas, vote and scoreboard screens, reveal.
- Person 2, game server: Colyseus rooms, position sync, round state machine, Turing checks and sus meter, voting, scoring, event log.
- Person 3, bot and AI: model on AMD Developer Cloud, bot behavior for travel and each mini-game, chat and vote prompts, recording and tuning with your team's playtest data.

Milestones:

1. First quarter: players spawn and run around the same 3D world in sync; model running on AMD Developer Cloud.
2. Halfway: full round flow with travel, 2 mini-games, Turing check, vote and score; 1 bot playing; record your team's data. Feature freeze on systems.
3. Third quarter: all 5 mini-games, sus meter tuned, Handler mode, post-game reveal.
4. Final stretch: playtest with other hackers, tune the bot, rehearse the demo.

## 9. Recommendation

Build Route A in 3D with one small low-poly world and 5 mini-games. Get 3D multiplayer sync and the AMD model running before anything else. In the pitch, highlight that the bot's gameplay, runs and typing come from real human data, and that the sus meter makes players argue rather than just reading an answer.
