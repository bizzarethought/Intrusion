# Find the Bot: Decisions

Why we made each design choice for our Emory Hacks game, kept in sync with the feasibility study. Started November 13, 2026.

## Current decisions

| # | Decision | Why |
| --- | --- | --- |
| 1 | Entertainment track: a game where players find the AI hidden among them | Mixes the human-or-AI chat games with Among Us party energy; easy to pitch in one sentence |
| 2 | Party game made of mini-games: players spawn and run to each mini-game arena in turn | Aimless roaming had no goal; mini-games like Roblox party games keep action constant and turn performance into evidence, and running between them keeps the world meaningful |
| 3 | No tasks | Avoid feeling like "Among Us with AI" |
| 4 | 3D game with 3D avatars, kept to one small low-poly world | The team wants a real 3D world to run around in; accepting the extra risk and keeping assets simple to fit the weekend |
| 5 | 3 to 10 humans per lobby | Matches Among Us lobby sizes; public matchmaking is future scope |
| 6 | Client-side appearances: each player sees different looks for everyone else, fixed all match | Friends in the same room can't defeat the game by saying "I'm green," and suspicion of a specific player isn't wiped out the way a mid-round shuffle would wipe it |
| 7 | Vote-outs per match = log base 2 of humans, rounded up, minimum 2 | Random guessing catches the AI about 50% of the time at 3 players but only about 33 to 36% at 8 to 10, so clues matter more in bigger lobbies, as they should |
| 8 | Voting out the AI ends the match; humans lose if the AI survives every vote or only 1 human is left | Clear, tense ending; a one-on-one vote can't work |
| 9 | Catching the AI sooner earns more points | Rewards good detective work over guessing |
| 10 | Turing checks feed a sus meter that is a clue, not a verdict | If the game reliably flagged the bot, players would have nothing to figure out; a noisy meter starts arguments |
| 11 | Two modes: Find the Bot and Handler | Two modes keeps the demo focused; Handler gives players the chance to be the sneaky one, which is the replay hook (like the murderer in Murder Mystery or the imposter in Among Us) |
| 12 | Handler mode needs at least 5 humans | 1 Handler against 2 detectives is too lopsided |
| 13 | Handler mode gets 1 extra vote-out | A vote spent on the Handler doesn't catch the AI. With 6 humans and 3 votes, random guessing normally catches the AI 43% of the time; after one vote goes to the Handler, 2 votes over 6 players gives 33%. The extra vote brings it to 50%, and the Handler's deception pulls it back toward normal. To tune in playtests |
| 14 | When the Handler is voted out, remaining humans vote: snipe the AI or keep playing about 1:30 more for hints; only humans' votes count | The AI isn't really playing, so it shouldn't swing that choice; it still appears to vote so a missing vote doesn't expose it |
| 15 | AI always votes in vote-outs | A missing vote would give it away |
| 16 | Modifiers kept: clear the room call, bounty board, bots unaware of each other, ghost rounds | Make the unknown bot count actually change how people play |
| 17 | Bot timing and play based on our own typing tests and playtest data | Real human data instead of guesswork; also a pitch point |
| 18 | AI model hosted on AMD Developer Cloud | Team choice; no per-call cost and full control of the bot's style |
| 19 | Main pitch: fun and bringing friends together; spotting AI as a secondary angle | It's the Entertainment track; no game changes needed for the secondary angle |
| 20 | Future scope: a points shop, likely cosmetics shown in the lobby and reveal | Gives points meaning; in-match looks are client-side so cosmetics can't show there |
| 21 | Mini-game pool of 5 for the hackathon, 8 or more later | A full match uses at most 4, so 5 keeps even max-size matches varied; 8 or more later is about double a match so replays feel fresh |
| 22 | Hackathon five: Red Light Green Light, Pick a Side, Prompt Podium, Glass Bridge Memory, Tile Drop | Each exposes a different bot tell: reaction, decisions, chat, memory, movement; mostly light physics |

## Cut or replaced

| Idea | What happened | Why |
| --- | --- | --- |
| Structured prompt rounds as the whole game | Replaced by mini-games | Felt like a group version of one-on-one human-or-AI chat, not interactive enough |
| Aimless free roam with hotspots | Replaced by running between mini-game arenas | Running around had no clear objective; heading to the next mini-game gives it one |
| Teleporting straight to the next mini-game | Replaced by running there | We're building a 3D world and avatars for a reason |
| 2D for the hackathon | Replaced by 3D | The team wants 3D avatars and a real world |
| Wardrobe change (mid-round look shuffle) | Replaced by client-side appearances | Shuffling erased players' suspicion of specific people |
| Rotating sprites after each vote | Dropped | Same problem as the wardrobe change |
| "Replaced friend" mode | Paused | The replaced player might get bored and reveal it |
| Persistent bot personas | Dropped | Not needed once answers are prompt and mini-game based |
| Human acting as AI mode | Cut for the hackathon | Keep the demo to two modes |
