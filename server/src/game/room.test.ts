import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "colyseus";
import { FindTheBotRoom } from "./room.js";

test("display names keep letters of any alphabet and lose everything that could break a screen", () => {
  const room = new FindTheBotRoom();
  const join = (displayName: unknown, sessionId: string) => {
    room.onJoin({ sessionId } as Client, { displayName });
    return room.state.players.get(sessionId)?.displayName;
  };
  assert.equal(join("  José   Müller-Ødegård ", "a"), "José Müller-Ødegård");
  assert.equal(join("李雷", "b"), "李雷");
  assert.equal(join("<b>Bo</b>\n💥", "c"), "bBob");
  assert.equal(join("x".repeat(60), "d"), "x".repeat(24));
  assert.equal(join("!!!", "e"), "Player");
  assert.equal(join(42, "f"), "Player");
});
