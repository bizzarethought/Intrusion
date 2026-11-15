import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "colyseus";
import { FindTheBotRoom } from "./room.js";
import { matchAliases, shuffled } from "./identities.js";

type Internals = {
  botId: string;
  pendingWinner: string;
  playerId(session: string): string;
  startMatch(client: Client): void;
  startRound(): void;
  move(client: Client, message: Record<string, unknown>): void;
  recordTuringResult(client: Client, message: Record<string, unknown>): void;
  chat(client: Client, message: Record<string, unknown>): void;
  reveal(): void;
};
function setup() {
  const room = new FindTheBotRoom();
  room.lock = async () => {};
  const sent = new Map<string, Array<{ type: string; message: { playerId: string } }>>();
  const clients = ["Friend One", "Friend Two", "Friend Three"].map((displayName, i) => {
    const sessionId = `lobby-session-${i}`;
    const messages: Array<{ type: string; message: { playerId: string } }> = [];
    sent.set(sessionId, messages);
    const client = { sessionId, send: (type: string, message: { playerId: string }) => messages.push({ type, message }) } as unknown as Client;
    room.clients.push(client); room.onJoin(client, { displayName }); return client;
  });
  return { room, internal: room as unknown as Internals, clients, sent };
}

test("aliases are unique, exclude lobby names, and support ten humans plus a bot", () => {
  const originals = ["Alex", "SAM", "Jordan", "Riley", "Casey", "Morgan", "Jamie", "Taylor", "Quinn", "Avery"];
  const aliases = matchAliases(originals, 11);
  assert.equal(new Set(aliases).size, 11);
  for (const alias of aliases) assert.ok(!originals.some(name => name.toLowerCase() === alias.toLowerCase()));
  const source = [1, 2, 3]; assert.deepEqual([...shuffled(source)].sort(), source); assert.deepEqual(source, [1, 2, 3]);
});

test("match start replaces all lobby identities, privately identifies each human, and erases the host hint", () => {
  const { room, internal, clients, sent } = setup();
  const oldPlayers = [...room.state.players.values()];
  try {
    internal.startMatch(clients[1]); assert.equal(room.state.phase, "lobby"); // non-host cannot reshuffle
    internal.startMatch(clients[0]);
    assert.equal(room.state.phase, "loading"); assert.equal(room.state.players.size, 4); assert.equal(room.state.hostId, "");
    for (const player of room.state.players.values()) {
      assert.ok(!oldPlayers.includes(player)); assert.ok(!clients.some(client => client.sessionId === player.id));
      assert.ok(!oldPlayers.some(old => old.displayName === player.displayName));
      assert.equal(player.realName, ""); assert.equal(player.isBot, false);
    }
    const ownIds = clients.map(client => {
      const messages = sent.get(client.sessionId)!;
      assert.equal(messages.length, 1); assert.equal(messages[0].type, "match_identity");
      const id = messages[0].message.playerId;
      assert.equal(id, internal.playerId(client.sessionId)); assert.ok(room.state.players.has(id)); return id;
    });
    assert.equal(new Set(ownIds).size, 3); assert.ok(!ownIds.includes(internal.botId));
    const serialized = JSON.stringify(room.state.toJSON());
    for (const old of oldPlayers) { assert.ok(!serialized.includes(old.id)); assert.ok(!serialized.includes(old.displayName)); }
  } finally { room.onDispose(); }
});

test("aliases stay fixed across rounds and session-based actions reach the right anonymous player", () => {
  const { room, internal, clients } = setup();
  const broadcasts: Array<{ playerId: string; message: string }> = [];
  room.broadcast = ((_type: unknown, message: { playerId: string; message: string }) => broadcasts.push(message)) as typeof room.broadcast;
  try {
    internal.startMatch(clients[0]);
    const identities = [...room.state.players].map(([id, player]) => [id, player.displayName]);
    internal.startRound(); internal.startRound();
    assert.deepEqual([...room.state.players].map(([id, player]) => [id, player.displayName]), identities);
    const id = internal.playerId(clients[0].sessionId), me = room.state.players.get(id)!;
    room.state.phase = "minigame"; room.state.signal = "green";
    const oldX = me.x; internal.move(clients[0], { x: me.x + 0.05, z: me.z }); assert.ok(me.x > oldX);
    room.state.phase = "turing-check"; internal.recordTuringResult(clients[0], { score: 72 }); assert.equal(me.turingScore, 72);
    room.state.phase = "voting"; internal.chat(clients[0], { message: "who looked suspicious?" });
    assert.equal(broadcasts[0].playerId, id);
    assert.ok(!JSON.stringify(broadcasts).includes(clients[0].sessionId));
    room.onLeave(clients[1]); assert.equal(room.state.players.get(internal.playerId(clients[1].sessionId))?.connected, false);
    internal.pendingWinner = "humans"; internal.reveal();
    assert.equal(me.realName, "Friend One"); assert.equal(room.state.players.get(internal.botId)?.isBot, true);
    assert.deepEqual([...room.state.players].map(([id, player]) => [id, player.displayName]), identities);
  } finally { room.onDispose(); }
});

test("a new match has no reused player objects or public ids", () => {
  const a = setup(), b = setup();
  try {
    a.internal.startMatch(a.clients[0]); b.internal.startMatch(b.clients[0]);
    const ids = new Set(a.room.state.players.keys());
    assert.ok([...b.room.state.players.keys()].every(id => !ids.has(id)));
  } finally { a.room.onDispose(); b.room.onDispose(); }
});
