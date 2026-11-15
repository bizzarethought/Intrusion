import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIDGE, SIDES, bridgeCell, bridgePattern, podiumResults, sideOf, sidePoints } from "./minigames.js";

test("bridge: banks are not panels, and the middle of each panel maps to its column and row", () => {
  assert.equal(bridgeCell(BRIDGE.startX - 0.01, 0), null);
  assert.equal(bridgeCell(BRIDGE.finishX, 0), null);
  assert.deepEqual(bridgeCell(BRIDGE.startX + 0.25, BRIDGE.rowCentre[0]), { col: 0, row: 0 });
  assert.deepEqual(bridgeCell(BRIDGE.finishX - 0.25, BRIDGE.rowCentre[1]), { col: 6, row: 1 });
});

test("bridge: cutting the corner between two safe panels touches neither wrong one", () => {
  // Walk straight from the middle of (column 0, row 0) to the middle of (column 1, row 1).
  for (let t = 0; t <= 1; t += 0.02) {
    const cell = bridgeCell(BRIDGE.startX + 0.25 + t * BRIDGE.columnWidth, BRIDGE.rowCentre[0] + t * (BRIDGE.rowCentre[1] - BRIDGE.rowCentre[0]));
    if (cell) assert.ok((cell.col === 0 && cell.row === 0) || (cell.col === 1 && cell.row === 1), `stepped on ${cell.col}:${cell.row}`);
  }
});

test("bridge: the safe path names one row for each column", () => {
  for (let i = 0; i < 20; i++) assert.match(bridgePattern(), new RegExp(`^[01]{${BRIDGE.columns}}$`));
});

test("sides: the bigger crowd scores most, ties pay both, the stones pay nothing", () => {
  assert.equal(sideOf(-2, 0), "A");
  assert.equal(sideOf(3, 0), "B");
  assert.equal(sideOf(0.5, -0.28), ""); // on the middle stone
  assert.equal(sideOf(-0.5, -1.2), "A"); // grass beside the pond, level with the first stones, is still the left bank
  for (const x of SIDES.startStones) assert.equal(sideOf(x, SIDES.laneZ), ""); // nobody starts with a side
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
