import assert from "node:assert/strict";
import { test } from "node:test";
import { BotConversation, addressesBot, type ChatTurn } from "./conversation.js";
import type { BotContext } from "./client.js";

function harness(respond: (context: BotContext, signal: AbortSignal) => Promise<string | null> = async () => null) {
  let now = 0;
  const messages: string[] = [];
  const history: ChatTurn[] = [];
  const calls: Array<{ context: BotContext; signal: AbortSignal }> = [];
  const bot = new BotConversation((context, signal) => { calls.push({ context, signal }); return respond(context, signal); }, () => now, () => 0);
  const context = (): BotContext => ({ botName: "Sam", phase: "voting", round: 1, visiblePlayers: [{ name: "Pat", score: 10, eliminated: false }], recentChat: [...history], accusations: [] });
  const send = (line: string) => { messages.push(line); history.push({ name: "Sam", message: line }); };
  const at = async (time: number, endsAt = 45_000) => { now = time; bot.tick(endsAt, context, send); await Promise.resolve(); await Promise.resolve(); };
  const hear = (message: string, name = "Pat") => { const turn = { name, message }; history.push(turn); bot.hear(turn, "Sam"); };
  return { bot, calls, messages, at, hear };
}

test("name matching handles mentions and ignores substrings", () => {
  assert.equal(addressesBot("@sam, explain that", "Sam"), true);
  assert.equal(addressesBot("i think SAM is the bot", "Sam"), true);
  assert.equal(addressesBot("we had the same reaction", "Sam"), false);
  assert.equal(addressesBot("Samuel is suspicious", "Sam"), false);
});

test("keeps a back-and-forth history, spaces replies, and never talks to itself", async () => {
  const h = harness(async c => c.replyTo ? `${c.replyTo.name}, why do you think that?` : "any clues?");
  h.bot.start(); await h.at(1999); assert.equal(h.messages.length, 0);
  await h.at(2000); assert.equal(h.messages.length, 1);
  await h.at(10_000); assert.equal(h.messages.length, 1); // no human message, no extra chatter
  h.hear("Sam, you're the bot"); await h.at(11_200);
  assert.equal(h.messages.length, 2); assert.equal(h.calls[1].context.replyTo?.message, "Sam, you're the bot");
  assert.ok(h.calls[1].context.recentChat.some(line => line.name === "Sam"));
  h.hear("that doesn't answer my question"); await h.at(15_199); assert.equal(h.messages.length, 2);
  await h.at(15_200); assert.equal(h.messages.length, 3);
  assert.equal(h.calls[2].context.replyTo?.message, "that doesn't answer my question");
});

test("coalesces spam and prioritizes a direct accusation without starvation", async () => {
  const h = harness(); h.bot.start();
  h.hear("Sam, why did you stop so fast?");
  for (let i = 0; i < 30; i++) h.hear(`unrelated ${i}`, "Other");
  await h.at(2000); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].context.replyTo?.message, "Sam, why did you stop so fast?");
  assert.match(h.messages[0], /^Pat, /);
});

test("a single slow call stays in flight while new messages queue", async () => {
  let finish!: (value: string) => void;
  let count = 0;
  const h = harness(async () => ++count === 1 ? new Promise<string>(resolve => { finish = resolve; }) : "second reply");
  h.bot.start(); await h.at(2000); h.hear("Sam, defend yourself"); await h.at(8000);
  assert.equal(h.calls.length, 1);
  finish("first reply"); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  await h.at(11_999); assert.equal(h.calls.length, 1);
  await h.at(12_000); assert.equal(h.calls.length, 2);
});

test("leaving a vote aborts its request and prevents a late reply in the next vote", async () => {
  const finishes: Array<(line: string) => void> = [];
  const h = harness(() => new Promise<string>(resolve => finishes.push(resolve)));
  h.bot.start(); await h.at(2000); const oldSignal = h.calls[0].signal;
  h.bot.stop(); assert.equal(oldSignal.aborted, true);
  h.bot.start(); await h.at(4000); assert.equal(h.calls.length, 2);
  finishes[0]("stale previous round"); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.messages.length, 0);
  finishes[1]("current round"); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(h.messages, ["current round"]);
});

test("caps each vote at five messages and resets the budget for a new vote", async () => {
  const h = harness(); h.bot.start(); await h.at(2000);
  for (let i = 1; i <= 8; i++) { h.hear(`Sam, accusation ${i}`); await h.at(2000 + i * 4000); }
  assert.equal(h.messages.length, 5); assert.equal(h.calls.length, 5);
  h.bot.start(); await h.at(36_000); assert.equal(h.messages.length, 6);
});

test("does not start near the deadline or post a response after it", async () => {
  let finish!: (line: string) => void;
  const h = harness(() => new Promise<string>(resolve => { finish = resolve; }));
  h.bot.start(); await h.at(44_500); assert.equal(h.calls.length, 0);
  h.bot.start(); await h.at(46_500, 48_000); assert.equal(h.calls.length, 1);
  await h.at(48_000, 48_000); finish("too late"); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.messages.length, 0);
});

test("missing model uses contextual fallback and normalizes model output", async () => {
  const h = harness(); h.bot.start(); h.hear("Sam, your reactions were perfect"); await h.at(2000);
  assert.match(h.messages[0], /^Pat, /); assert.match(h.messages[0], /light|reaction|timing/);
  const output = harness(async () => "   hello\n\nthere " + "a".repeat(300)); output.bot.start(); await output.at(2000);
  assert.equal(output.messages[0].length, 240); assert.ok(!output.messages[0].includes("\n"));
});

test("a failing model still produces a contextual reply", async t => {
  t.mock.method(console, "warn", () => {});
  const h = harness(async () => { throw new Error("model unavailable"); });
  h.bot.start(); h.hear("Sam, why are you so suspicious?"); await h.at(2000);
  assert.equal(h.messages.length, 1); assert.match(h.messages[0], /^Pat, /);
});
