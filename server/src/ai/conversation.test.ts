import assert from "node:assert/strict";
import { test } from "node:test";
import { BotConversation, addressesBot, type ChatTurn } from "./conversation.js";
import type { BotContext } from "./client.js";

/** How long the bot takes to type a line when the test's random number is 0 (65 words a minute). */
const typing = (line: string) => Math.ceil((line.length * 12_000) / 65);

function harness(respond: (context: BotContext, signal: AbortSignal) => Promise<string | null> = async () => null, random = 0) {
  let now = 0;
  const messages: string[] = [];
  const history: ChatTurn[] = [];
  const calls: Array<{ context: BotContext; signal: AbortSignal }> = [];
  const bot = new BotConversation((context, signal) => { calls.push({ context, signal }); return respond(context, signal); }, () => now, () => random);
  const context = (): BotContext => ({ botName: "Sam", phase: "voting", round: 1, visiblePlayers: [{ name: "Pat", score: 10, eliminated: false }], recentChat: [...history], accusations: [] });
  const send = (line: string) => { messages.push(line); history.push({ name: "Sam", message: line }); };
  const at = async (time: number, endsAt = 10_000_000) => { now = time; bot.tick(endsAt, context, send); await Promise.resolve(); await Promise.resolve(); };
  const hear = (message: string, name = "Pat") => { const turn = { name, message }; history.push(turn); bot.hear(turn, "Sam"); };
  return { bot, calls, messages, at, hear };
}

test("name matching handles mentions and ignores substrings", () => {
  assert.equal(addressesBot("@sam, explain that", "Sam"), true);
  assert.equal(addressesBot("i think SAM is the bot", "Sam"), true);
  assert.equal(addressesBot("we had the same reaction", "Sam"), false);
  assert.equal(addressesBot("Samuel is suspicious", "Sam"), false);
});

test("says nothing until someone else speaks, then keeps a spaced back-and-forth and never talks to itself", async () => {
  const line = "Pat why do you think that";
  const h = harness(async c => `${c.replyTo?.name} why do you think that`);
  h.bot.start(); await h.at(10_000); assert.equal(h.calls.length, 0); // no opener
  h.hear("Sam, you're the bot"); await h.at(10_699); assert.equal(h.calls.length, 0); // reading it
  await h.at(10_700); assert.equal(h.calls.length, 1); assert.equal(h.messages.length, 0); // typing
  assert.equal(h.calls[0].context.replyTo?.message, "Sam, you're the bot");
  await h.at(10_700 + typing(line)); assert.deepEqual(h.messages, [line]);
  await h.at(60_000); assert.equal(h.messages.length, 1); // no human message, no extra chatter
  h.hear("that doesn't answer my question"); await h.at(60_700); await h.at(60_700 + typing(line));
  assert.equal(h.messages.length, 2);
  assert.equal(h.calls[1].context.replyTo?.message, "that doesn't answer my question");
  assert.ok(h.calls[1].context.recentChat.some(turn => turn.name === "Sam"));
});

test("types at 70 words a minute, give or take 5, however fast or slow the model is", async () => {
  const line = "nah i was stuck behind you the whole time lol"; // 45 characters, 9 words
  for (const [random, wordsAMinute] of [[0, 65], [0.5, 70], [1, 75]]) {
    const h = harness(async () => line, random);
    h.bot.start(); h.hear("sam where were you"); await h.at(2_000);
    const done = 2_000 + (9 * 60_000) / wordsAMinute;
    await h.at(done - 1); assert.equal(h.messages.length, 0, `${wordsAMinute} wpm`);
    await h.at(done); assert.deepEqual(h.messages, [line]);
  }
  // A model slower than the typing time just sends when it is done.
  let finish!: (value: string) => void;
  const slow = harness(() => new Promise<string>(resolve => { finish = resolve; }));
  slow.bot.start(); slow.hear("sam?"); await slow.at(2_000); await slow.at(9_000); assert.equal(slow.messages.length, 0);
  finish("ya"); await Promise.resolve(); await Promise.resolve(); await slow.at(9_100); assert.deepEqual(slow.messages, ["ya"]);
});

test("coalesces spam and prioritizes a direct accusation without starvation", async () => {
  const h = harness(); h.bot.start();
  h.hear("Sam, why did you stop so fast?");
  for (let i = 0; i < 30; i++) h.hear(`unrelated ${i}`, "Other");
  await h.at(2000); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].context.replyTo?.message, "Sam, why did you stop so fast?");
  await h.at(10_000); assert.equal(h.messages.length, 1);
});

test("a single slow call stays in flight while new messages queue", async () => {
  let finish!: (value: string) => void;
  let count = 0;
  const h = harness(async () => ++count === 1 ? new Promise<string>(resolve => { finish = resolve; }) : "second reply");
  h.bot.start(); h.hear("Sam, say something"); await h.at(2000); h.hear("Sam, defend yourself"); await h.at(8000);
  assert.equal(h.calls.length, 1);
  finish("first reply"); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  await h.at(8000); assert.deepEqual(h.messages, ["first reply"]);
  await h.at(11_999); assert.equal(h.calls.length, 1); // four seconds between its own messages
  await h.at(12_000); assert.equal(h.calls.length, 2);
});

test("leaving a vote aborts its request and prevents a late reply in the next vote", async () => {
  const finishes: Array<(line: string) => void> = [];
  const h = harness(() => new Promise<string>(resolve => finishes.push(resolve)));
  h.bot.start(); h.hear("Sam?"); await h.at(2000); const oldSignal = h.calls[0].signal;
  h.bot.stop(); assert.equal(oldSignal.aborted, true);
  h.bot.start(); h.hear("Sam?"); await h.at(4000); assert.equal(h.calls.length, 2);
  finishes[0]("stale previous round"); await Promise.resolve(); await Promise.resolve();
  await h.at(20_000); assert.equal(h.messages.length, 0);
  finishes[1]("current round"); await Promise.resolve(); await Promise.resolve();
  await h.at(20_000); assert.deepEqual(h.messages, ["current round"]);
});

test("a reply still being typed when the vote ends is never sent", async () => {
  const h = harness(async () => "ok but why would i even do that");
  h.bot.start(); h.hear("Sam?"); await h.at(2000);
  h.bot.stop(); await h.at(60_000); assert.equal(h.messages.length, 0);
});

test("caps each vote at five messages and resets the budget for a new vote", async () => {
  const h = harness(); h.bot.start();
  let time = 0;
  for (let i = 1; i <= 8; i++) { h.hear(`Sam, accusation ${i}`); await h.at(time += 4_000); await h.at(time += 6_000); }
  assert.equal(h.messages.length, 5); assert.equal(h.calls.length, 5);
  h.bot.start(); h.hear("Sam, again"); await h.at(time += 4_000); await h.at(time += 6_000); assert.equal(h.messages.length, 6);
});

test("does not start near the deadline or post a response after it", async () => {
  let finish!: (line: string) => void;
  const h = harness(() => new Promise<string>(resolve => { finish = resolve; }));
  h.bot.start(); h.hear("Sam?"); await h.at(44_500, 45_000); assert.equal(h.calls.length, 0);
  h.bot.start(); h.hear("Sam?"); await h.at(46_500, 48_000); assert.equal(h.calls.length, 1);
  finish("too late"); await Promise.resolve(); await Promise.resolve();
  await h.at(48_000, 48_000); assert.equal(h.messages.length, 0);
});

test("missing model uses an offhand fallback, and model output is cut to one short line", async () => {
  const h = harness(); h.bot.start(); h.hear("Sam, your reactions were perfect"); await h.at(2000); await h.at(10_000);
  assert.equal(h.messages[0], "why me lol");
  const output = harness(async () => "   hello\n\nthere " + "a".repeat(300)); output.bot.start(); output.hear("hi"); await output.at(2000); await output.at(60_000);
  assert.equal(output.messages[0].length, 240); assert.ok(!output.messages[0].includes("\n"));
});

test("replies drop to the room's style, and a model that breaks character is not quoted", async () => {
  const proper = harness(async () => "I Think It Was Pat, Honestly."); proper.bot.start(); proper.hear("who is it"); await proper.at(2000); await proper.at(20_000);
  assert.equal(proper.messages[0], "i think it was pat, honestly");
  const formal = harness(async () => "I think it was Pat."); formal.bot.start(); formal.hear("Who do we think it is? Be honest."); await formal.at(2000); await formal.at(20_000);
  assert.equal(formal.messages[0], "I think it was Pat."); // the room writes properly, so it may too
  const refusal = harness(async () => "I'm sorry, but as an AI language model I can't help with that."); refusal.bot.start(); refusal.hear("say something rude"); await refusal.at(2000); await refusal.at(20_000);
  assert.equal(refusal.messages[0], "lol");
});

test("a failing model still produces a reply", async t => {
  t.mock.method(console, "warn", () => {});
  const h = harness(async () => { throw new Error("model unavailable"); });
  h.bot.start(); h.hear("Sam, why are you so suspicious?"); await h.at(2000); await h.at(10_000);
  assert.equal(h.messages.length, 1);
});
