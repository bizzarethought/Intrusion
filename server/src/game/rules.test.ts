import assert from "node:assert/strict";
import { test } from "node:test";
import { placementPoints, voteBudget, votedOut } from "./rules.js";

test("vote budget follows log2 of humans with a floor of two", () => {
  assert.deepEqual([3, 4, 5, 8, 9, 10].map(voteBudget), [2, 2, 3, 3, 4, 4]);
});

test("the most-voted player is out", () => {
  assert.equal(votedOut(["a", "b", "a", null]), "a");
});

test("skips are votes for nobody: one vote cannot beat a room of skips", () => {
  assert.equal(votedOut(["a", null, null, null]), null);
  assert.equal(votedOut(["a", "a", null, null]), null);
  assert.equal(votedOut(["a", "a", "a", null, null]), "a");
});

test("a tie for first, or only skips, removes nobody", () => {
  assert.equal(votedOut(["a", "b"]), null);
  assert.equal(votedOut([null, null]), null);
  assert.equal(votedOut([]), null);
});

test("earlier finishers score more, and everyone who finishes scores", () => {
  assert.ok(placementPoints(0) > placementPoints(1));
  assert.equal(placementPoints(40), 10);
});
