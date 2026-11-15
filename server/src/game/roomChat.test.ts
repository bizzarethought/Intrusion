import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "colyseus";
import { FindTheBotRoom } from "./room.js";
import { PlayerState } from "./schema.js";
import type { AiClient, BotContext } from "../ai/client.js";

type RoomInternals = {
  botId: string;
  bot: { voteAt: number };
  aiClient: AiClient;
  advancePhase(): void;
  tick(): void;
  chat(client: Client, message: Record<string, unknown>): void;
  resolveVote(): void;
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function setup() {
  const room = new FindTheBotRoom();
  const internal = room as unknown as RoomInternals;
  const human = new PlayerState(); human.id = "human"; human.displayName = "Pat";
  const bot = new PlayerState(); bot.id = "bot"; bot.displayName = "Sam";
  room.state.players.set(human.id, human); room.state.players.set(bot.id, bot);
  internal.botId = bot.id; room.state.round = 1; room.state.votesRemaining = 2;
  room.state.phase = "minigame";
  const messages: Array<{ playerId: string; message: string }> = [];
  room.broadcast = ((_type: unknown, message: { playerId: string; message: string }) => messages.push(message)) as typeof room.broadcast;
  internal.advancePhase(); internal.bot.voteAt = Infinity;
  return { room, internal, messages, client: { sessionId: human.id } as Client };
}

test("room routes successive player messages into bot replies using public conversation history", async t => {
  let now = 100_000;
  t.mock.method(Date, "now", () => now); t.mock.method(Math, "random", () => 0);
  const { room, internal, messages, client } = setup();
  const contexts: BotContext[] = [];
  internal.aiClient.respond = async context => { contexts.push(context); return `reply ${contexts.length}: ${context.replyTo?.name}`; };
  try {
    internal.chat(client, { message: "Sam, your reaction was too perfect" });
    now += 2000; internal.tick(); await flush(); // it starts on a reply...
    now += 3000; internal.tick(); // ...and sends it once it would have finished typing
    assert.equal(messages.filter(line => line.playerId === "bot").length, 1);
    now += 1000; internal.chat(client, { message: "you still haven't explained it" });
    now += 3000; internal.tick(); await flush();
    now += 3000; internal.tick();
    assert.equal(messages.filter(line => line.playerId === "bot").length, 2);
    assert.equal(contexts[1].replyTo?.message, "you still haven't explained it");
    assert.ok(contexts[1].recentChat.some(line => line.name === "Sam" && line.message.startsWith("reply 1")));
    assert.deepEqual(Object.keys(contexts[1].visiblePlayers[0]).sort(), ["eliminated", "name", "score"]);
    assert.equal(room.state.players.get("bot")?.isBot, false);
    assert.equal(room.state.phase, "voting");
    // The bot's broadcast does not enqueue another reply without a new human message.
    now += 5000; internal.tick(); await flush(); assert.equal(contexts.length, 2);
  } finally { room.onDispose(); }
});

test("resolving a real room vote cancels a pending model response", async t => {
  let now = 100_000;
  t.mock.method(Date, "now", () => now); t.mock.method(Math, "random", () => 0);
  const { room, internal, messages, client } = setup();
  let finish!: (line: string) => void;
  let signal: AbortSignal | undefined;
  internal.aiClient.respond = (_context, requestSignal) => { signal = requestSignal; return new Promise(resolve => { finish = resolve; }); };
  try {
    internal.chat(client, { message: "Sam, explain yourself" }); now += 2000; internal.tick();
    assert.ok(signal); assert.equal(signal.aborted, false);
    internal.resolveVote(); assert.equal(room.state.phase, "scoreboard"); assert.equal(signal.aborted, true);
    finish("late defense"); await flush();
    assert.equal(messages.filter(line => line.playerId === "bot").length, 0);
  } finally { room.onDispose(); }
});
