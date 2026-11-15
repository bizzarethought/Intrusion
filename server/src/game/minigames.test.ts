import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIDGE, SIDES, bridgePattern, createMiniGame, podiumResults, sideOf, sidePoints, type Host } from "./minigames.js";
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

test("bridge: the safe path names one row for each column", () => {
  for (let i = 0; i < 20; i++) assert.match(bridgePattern(), new RegExp(`^[01]{${BRIDGE.columns}}$`));
});

test("sides: the bigger crowd scores most, ties pay both, the middle pays nothing", () => {
  assert.equal(sideOf(-2), "A");
  assert.equal(sideOf(2), "B");
  assert.equal(sideOf(-1.1), ""); // on the stones between the middle and the red platform
  for (const x of SIDES.startX) assert.equal(sideOf(x), ""); // nobody starts with a side
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
