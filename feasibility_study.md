# Find the Bot: Feasibility Study

Emory Hacks, Entertainment track. A 2D multiplayer party game for up to 10 players: back-to-back mini-games for points, a vote after each one, and an AI player hidden among them that everyone is trying to catch.

## 1. Scope for this study

In scope:

- 2D party game with back-to-back mini-games, lobbies of up to 10
- Points per mini-game and a vote on who's the AI after each one
- Mid-game Turing checks feeding a sus meter that is a clue, not a verdict
- Look-alike characters reshuffled each match
- Bot that plays, chats and votes like an average human, tuned with your team's own data
- Humans acting robotic on purpose as a bluffing tactic
- AI model self-hosted on AMD Developer Cloud
- Private lobbies by room code; public matchmaking later

On pause:

- "One of your friends has been replaced." Risk: the replaced player gets bored and tells everyone.
- Tasks, so it doesn't feel like Among Us with AI added.
- 3D, saved for after the hackathon.
- Imposter team and "human acting as AI" modes (Section 6)

## 2. Overall verdict

It's feasible in a hackathon weekend in 2D, with medium-high risk. Each mini-game is a small self-contained build, so the main risk is how many you make: 3 or 4 polished ones beat 8 buggy ones. Real-time multiplayer sync is still the hardest piece, and making the bot play like a human is the most interesting one.

| Component | Difficulty | Risk | Notes |
| --- | --- | --- | --- |
| Real-time multiplayer sync | High | High | Build first; Colyseus rooms |
| Round flow (mini-game, check, vote, score) | Medium | Medium | One server state machine |
| Mini-games | Medium each | Medium | Start with 3 or 4 simple ones as Phaser scenes |
| Turing checks and sus meter | Medium | Medium | Compare to human averages from your playtests |
| Voting and scoring | Low | Low | Tallies, bonuses and penalties |
| Bot gameplay | Medium | High | Per-mini-game behavior with human noise |
| Bot chat and votes | Low | Medium | Self-hosted model on AMD Developer Cloud |
| Post-game reveal | Medium | Low | Bot stats vs human averages; best demo moment |
| Public matchmaking | Medium | High | Later feature; lobbies capped at 10 |

## 3. Core game loop (party game format)

A match is a run of short mini-games, back to back, like Roblox party games or Mario Party. Players score points in every mini-game, and after each one everyone votes on who is the AI. Something is always happening, and how each player performs becomes evidence.

**Setup**

- Up to 10 players per lobby. 1 or more are secretly bots, and humans aren't told how many.
- Look-alike characters with random colors and accessories, reshuffled each match.
- A small lobby area between rounds, then players are dropped into each mini-game arena.

**Each round (about 2 to 3 minutes)**

1. Mini-game (60 to 90 seconds): everyone plays for points. Some are free-for-all, some team up random players.
2. Mid-game Turing check: at a random moment, 1 or 2 players get a quick surprise check, like a reaction tap, a fast prompt, or tracing a shape. Their result goes into the sus meter.
3. Vote (about 30 to 45 seconds): quick chat, then everyone votes for who they think is the AI, or skips. The player with the most votes is revealed as human or AI.
4. Scoreboard: points updated, next mini-game.

**Sus meter, a clue and not a verdict**

- The game measures reaction time, consistency, accuracy and typing rhythm, and shows a warning like "Teal's reactions looked unusual."
- It sometimes flags real humans and sometimes misses the bot, so it starts arguments instead of settling them. If it were accurate, the game would do the detective work for the players.

**Scoring**

- Points for placing in mini-games.
- Bonus for voting for the bot, a penalty for voting out a real human.
- Humans who play robotic on purpose and survive votes earn "best bluff" points.
- Humans win together by catching every bot; the bot wins by surviving to the end. The top-scoring human also gets bragging rights.

**Starter mini-games (build 3 or 4)**

- Reaction race: tap when the light turns green. Tests timing.
- Prompt sprint: everyone answers a quick prompt and the group votes on the funniest. Tests chat and creativity.
- Would-you-rather run: run to a side before the floor drops. Tests decisions and movement.
- Memory sequence: repeat a pattern of colors. Tests accuracy; perfect play is suspicious.
- Team relay: random pairs work together. Tests cooperation, since a partner can watch the bot closely.

**Two game modes (both in Route A)**

- Find the Bot: all humans against the hidden AI. Humans win by voting out every bot; the bot wins by surviving.
- Handler: one human is secretly on Team AI. They know which player is the bot and win if it survives. Everyone else is trying to catch the Handler and the bot, and has to wonder whether the loudest accuser is a detective or covering for the bot. Being the Handler is the hook that brings players back, like being the murderer in Murder Mystery or the imposter in Among Us.

**Handler tools (kept small for balance)**

- Fake one sus meter warning against a real human per match.
- A private heads-up when the bot is about to get a Turing check.
- One secret message to the bot per round.
- Roles rotate fairly so everyone gets a turn; Team AI wins are tracked in their own stats.

**When the Handler is voted out**

- Remaining humans vote: snipe the AI now, or keep playing for hints with about 1:30 of extra round time to find it.
- Only humans' votes count; the vote is out of the remaining humans. The AI still appears to vote so it isn't revealed by a missing vote, but the server ignores its choice.

**Wardrobe change**

- At random moments a big flash hits the screen ("Wardrobe change!") and every character's look gets reshuffled, like a robot with a top hat becoming a robot with a mustache.
- This stops friends in the same room from tracking each other by saying "I'm green."

**Unknown bot count modifiers (from Route B)**

- Clear the room: at any vote, players can declare "no bots left." Right means a big bonus and an early win; wrong means the bots win right away.
- Bounty board: one hint each round, like "at least one bot finished top 3."
- Bots don't know about each other, so they may vote each other out.
- Ghost rounds: some matches have zero bots, revealed at the end.

**Post-game reveal:** a replay of the bot's mini-game stats next to the human average, plus awards like "most human bot" and "most robotic human."

**Build approach:** Phaser (2D) in the browser, with each mini-game as its own scene, and Colyseus or Socket.io for the game server. 3D after the hackathon.

## 4. Technical architecture

- Frontend: Phaser 3 game in the browser, with a simple React or HTML lobby page. Judges join with a QR code; touch controls (a virtual joystick) are needed for phones.
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
- Route F, 3D version: Three.js or Unity after the hackathon, reusing the same server and bot brain.
- Route G, Security framing: the same game pitched as practice spotting AI social engineering. Kept as a secondary pitch angle only, with no game changes. The main value for the Entertainment track is fun and bringing friends together; the post-game reveal of the bot's tells already supports the AI-awareness angle.

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Multiplayer sync bugs or lag | Build networking first; keep game state on the server |
| Too many mini-games, none finished | 3 or 4 max; freeze at halfway |
| Bot plays too perfectly | Sample from your team's real results; add human noise |
| Sus meter too accurate, so no deduction | Tune to flag humans sometimes; show it as a warning, not proof |
| Bot impossible to catch | Turing checks and mini-game stats create tells |
| Voting feels like random guessing | Show each player's mini-game stats before the vote |
| Players cheat with dev tools | Server never sends who the bot is |
| Inappropriate chat during the demo | Content filter and curated prompts |
| Model slow or AMD setup stalls | Set it up first; hosted API as fallback |
| Phone controls are clunky | Design mini-games for taps and simple controls |

## 8. Suggested build plan for three people

- Person 1, game client: Phaser scenes for each mini-game, lobby, vote screen, scoreboard, reveal, phone controls.
- Person 2, game server: Colyseus rooms, sync, round state machine, Turing checks and sus meter, voting, scoring, event log.
- Person 3, bot and AI: model on AMD Developer Cloud, bot behavior for each mini-game, chat and vote prompts, recording and tuning with your team's playtest data.

Milestones:

1. First quarter: players join a room and play 1 mini-game in sync; model running on AMD Developer Cloud.
2. Halfway: full round flow with mini-game, Turing check, vote and score; 1 bot playing; record your team's data. Feature freeze.
3. Third quarter: 3 or 4 mini-games, sus meter tuned, post-game reveal.
4. Final stretch: playtest with other hackers, tune the bot, rehearse the QR code demo.

## 9. Recommendation

Build Route A in 2D with 3 or 4 mini-games, then add Route B's unknown bot count once one bot works. Get multiplayer sync and the AMD model running first. In the pitch, highlight that the bot's gameplay and typing come from real human data, and that the sus meter makes players argue rather than just reading an answer.
