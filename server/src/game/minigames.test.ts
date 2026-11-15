import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIDGE, MINI_GAME_IDS, SIDES, bridgePattern, createMiniGame, nextMiniGame, podiumResults, sideOf, sidePoints, type Host } from "./minigames.js";
import { GameState, PlayerState } from "./schema.js";

/** One player on a fresh bridge, a second apart between hops. */
function bridge() {
  const state = new GameState();
  const player = new PlayerState();
  player.id = "p";
  const host: Host = { state, bot: () => undefined, playing: () => [player], finish: (who) => { who.finished = true; }, endIn() {}, askAi: async () => null };
  const game = createMiniGame("glass-bridge-memory");
  game.setup(host, [player]);
  const safe = [...state.pattern].map(Number);
  game.begin(host, 0);
  let now = 0;
  const hop = (col: number, row: number, wait = 1_000) => game.message(host, player, "hop", { col, row }, (now += wait));
  return { state, player, game, host, safe, hop };
}

test("bridge: the remembered path crosses, one column at a time, and the last hop is onto the far bank", () => {
  const { player, safe, hop } = bridge();
  for (let col = 0; col < BRIDGE.columns; col++) {
    assert.notEqual(hop(col, safe[col]), false);
    assert.equal(player.x, BRIDGE.startX + (col + 0.5) * BRIDGE.columnWidth); // always the middle of the panel
    assert.equal(player.z, BRIDGE.rowCentre[safe[col]]);
  }
  assert.equal(player.finished, false);
  hop(BRIDGE.columns, 0);
  assert.equal(player.finished, true);
  assert.ok(player.x > BRIDGE.finishX);
});

test("bridge: a wrong panel breaks and drops the player on the bank; no skipping columns, no walking, no double hops", () => {
  const { state, player, game, host, safe, hop } = bridge();
  const bank = player.x;
  hop(1, safe[1]); // not the next column
  game.move(host, player, 1, 0, 0); // walking does nothing here
  assert.equal(player.x, bank);
  assert.equal(hop(0, 1 - safe[0]), false);
  assert.equal(state.broken, `0:${1 - safe[0]}`);
  assert.equal(player.x, bank);
  hop(0, safe[0]);
  hop(1, safe[1], 100); // the first hop has not landed yet
  assert.equal(player.x, BRIDGE.startX + 0.5 * BRIDGE.columnWidth);
  assert.equal(player.finished, false);
});

test("bridge: the safe path names one row for each column and is never nearly straight or nearly a zigzag", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2_000; i++) {
    const pattern = bridgePattern();
    assert.match(pattern, new RegExp(`^[01]{${BRIDGE.columns}}$`));
    const turns = [...pattern].filter((row, at) => at > 0 && row !== pattern[at - 1]).length;
    assert.ok(turns >= 2 && turns <= 4, pattern);
    seen.add(pattern);
  }
  assert.ok(seen.size > 60, `only ${seen.size} different paths`); // still plenty of paths: 100 are allowed
});

test("sides: the bigger crowd scores most, ties pay both, the crossing pays nothing", () => {
  assert.equal(sideOf(-2, 0), "A");
  assert.equal(sideOf(3, 0), "B");
  assert.equal(sideOf(-0.2, SIDES.laneZ), ""); // on a stone between the islet and the red bank
  assert.equal(sideOf(1.5, 1.5), "B"); // the meadow below the pond is the blue side too
  for (const x of SIDES.startX) for (const z of SIDES.startZ) assert.equal(sideOf(x, z), ""); // nobody starts with a side
  // The AI's resting places are on their own banks.
  assert.equal(sideOf(SIDES.rest.A[1], SIDES.rest.A[3]), "A");
  assert.equal(sideOf(SIDES.rest.B[0], SIDES.rest.B[2]), "B");
  assert.equal(sidePoints("A", 3, 1), 60);
  assert.equal(sidePoints("B", 3, 1), 20);
  assert.equal(sidePoints("A", 2, 2), 40);
  assert.equal(sidePoints("", 3, 1), 0);
});

test("podium: votes are counted per answer and sorted, most first", () => {
  const answers = new Map([["ann", "soup"], ["bo", "socks"], ["cy", "wifi"]]);
  const keys = new Map([["ann", 2], ["bo", 0], ["cy", 1]]);
  const picks = new Map([["ann", 0], ["cy", 0], ["bo", 1]]);
  const results = podiumResults(answers, keys, picks);
  assert.deepEqual(results.map((entry) => [entry.playerId, entry.votes]), [["bo", 2], ["cy", 1], ["ann", 0]]);
});

test("rotation: matches played back to back get different games, and no match repeats one", () => {
  for (let run = 0; run < 50; run++) {
    // Two short matches in a row see all four mini-games between them.
    const first = new Set<string>(), second = new Set<string>();
    const games = [nextMiniGame(first), nextMiniGame(first), nextMiniGame(second), nextMiniGame(second)];
    assert.equal(new Set(games).size, MINI_GAME_IDS.length, games.join(", "));
    // A long match plays every game once before any comes round again.
    const long = new Set<string>();
    const four = [1, 2, 3, 4].map(() => nextMiniGame(long));
    assert.equal(new Set(four).size, MINI_GAME_IDS.length, four.join(", "));
  }
});

/** Three humans and the AI at the podium, with a model whose reply the test controls. */
function podium() {
  const state = new GameState();
  const people = ["ann", "bo", "cy", "bot"].map((id) => {
    const player = new PlayerState();
    player.id = id;
    state.players.set(id, player);
    return player;
  });
  const asked: string[][] = [];
  let reply: (line: string | null) => void = () => {};
  const host: Host = {
    state, bot: () => people[3], playing: () => people, finish() {}, endIn() {},
    askAi: (_prompt, others) => { asked.push(others); return new Promise((resolve) => { reply = resolve; }); },
  };
  const game = createMiniGame("prompt-podium");
  game.setup(host, people);
  game.begin(host, 1_000);
  const answer = (who: number, text: string, at: number) => game.message(host, people[who], "answer", { text }, at);
  /** Gives the model's reply and lets it land. */
  const model = async (line: string | null) => { reply(line); await new Promise((resolve) => setImmediate(resolve)); };
  const answers = () => (JSON.parse(state.board) as Array<{ text: string }>).map((entry) => entry.text);
  return { state, host, game, asked, answer, model, answers };
}

test("podium: the AI waits for most of the others, then answers in their style at a typist's speed", async (t) => {
  t.mock.method(Math, "random", () => 0); // the shortest waits, and 65 words a minute
  const { state, host, game, asked, answer, model, answers } = podium();
  answer(0, "ur mum", 2_000); game.tick(host, 2_100);
  assert.equal(asked.length, 0); // one of three is not most of them
  answer(1, "a wet sock lol", 3_000); game.tick(host, 3_100);
  assert.deepEqual(asked, [["ur mum", "a wet sock lol"]]); // asked once, with their answers to copy the style of
  await model('"A Slightly Damp Biscuit."');
  answer(2, "bees", 3_500);
  const line = "a slightly damp biscuit"; // no quotes, capitals or full stop: nobody else used them
  const typed = 3_100 + 1_200 + Math.ceil((line.length * 12_000) / 65);
  game.tick(host, typed - 200);
  assert.equal(state.stage, "answer"); // still typing: the round waits for it like for any slow player
  game.tick(host, typed + 100);
  assert.equal(state.stage, "vote");
  assert.ok(answers().includes(line), answers().join(" | "));
});

test("podium: the AI stops waiting when time runs short, and never shows a copied answer or a refusal", async (t) => {
  t.mock.method(Math, "random", () => 0);
  for (const bad of ["ur mum", "I'm sorry, but I can't help with that.", "", null]) {
    const { state, host, game, asked, answer, model, answers } = podium();
    answer(0, "ur mum", 2_000);
    game.tick(host, 10_900);
    assert.equal(asked.length, 0); // still hoping for more answers to go on
    game.tick(host, 11_000);
    assert.deepEqual(asked, [["ur mum"]]);
    await model(bad);
    game.tick(host, 20_000); game.tick(host, 26_100); // typed, then the bell
    assert.equal(state.stage, "vote");
    assert.deepEqual(answers().sort(), ["honestly no idea", "ur mum"]);
  }
});
