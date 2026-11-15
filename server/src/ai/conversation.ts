import type { BotContext } from "./client.js";

export type ChatTurn = { name: string; message: string };
const MAX_MESSAGES = 5;
const GAP_MS = 4_000;

export function addressesBot(message: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\W)@?${escaped}(?=$|\\W)`, "i").test(message);
}

function fallback(context: BotContext, turn: number): string {
  const reply = context.replyTo;
  if (!reply) return "anyone have an actual reason for their vote?";
  const prefix = `${reply.name}, `;
  const text = reply.message.toLowerCase();
  if (/stop|react|timing|perfect|fast/.test(text)) return prefix + [
    "watching the light isn't proof. what else made you suspicious?",
    "one reaction isn't much to go on. did you notice anything else?",
    "what about the timing looked off to you?",
  ][turn % 3];
  if (/vote|sus|bot|\bai\b|robot/.test(text) || addressesBot(text, context.botName)) {
    return prefix + [
      "why me though? give me something besides a hunch",
      "that's a pretty easy accusation. what did you actually notice?",
      "i don't think that proves it. anyone else see the same thing?",
    ][turn % 3];
  }
  if (/\?/.test(text)) return prefix + "i'm not sure yet. what are you basing your guess on?";
  return prefix + "could be, but i'd like more than one clue before voting";
}

/** One opening comment, then human-triggered replies. No bot-to-bot feedback loop. */
export class BotConversation {
  private active = false;
  private generation = 0;
  private sent = 0;
  private dueAt = 0;
  private nextAt = 0;
  private pending: { reply?: ChatTurn; direct: boolean } | undefined;
  private request: AbortController | undefined;
  private previous = "";

  private readonly respond: (context: BotContext, signal: AbortSignal) => Promise<string | null>;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    respond: (context: BotContext, signal: AbortSignal) => Promise<string | null>,
    now: () => number = Date.now,
    random: () => number = Math.random,
  ) { this.respond = respond; this.now = now; this.random = random; }

  start(): void {
    this.stop();
    this.active = true;
    this.sent = 0;
    this.previous = "";
    this.nextAt = 0;
    this.pending = { direct: false };
    this.dueAt = this.now() + 2_000 + this.random() * 2_000;
  }

  stop(): void {
    this.active = false;
    this.generation++;
    this.request?.abort();
    this.request = undefined;
    this.pending = undefined;
  }

  hear(turn: ChatTurn, botName: string): void {
    if (!this.active || this.sent >= MAX_MESSAGES) return;
    const direct = addressesBot(turn.message, botName);
    // Retain an accusation addressed to us when unrelated chat arrives in a burst.
    if (this.pending?.direct && !direct) return;
    const alreadyWaiting = !!this.pending;
    const replacingOpener = !!this.pending && !this.pending.reply;
    this.pending = { reply: turn, direct };
    // More incoming messages update context without postponing the reply forever.
    if (!alreadyWaiting || replacingOpener) this.dueAt = Math.max(this.nextAt, this.now() + 1_200 + this.random() * 1_200);
  }

  tick(endsAt: number, context: () => BotContext, send: (line: string) => void): void {
    if (!this.active || this.request || !this.pending || this.sent >= MAX_MESSAGES) return;
    const now = this.now();
    if (now < Math.max(this.dueAt, this.nextAt) || endsAt - now < 1_000) return;
    const generation = this.generation;
    const turn = this.pending;
    this.pending = undefined;
    const controller = new AbortController();
    this.request = controller;
    const data = { ...context(), replyTo: turn.reply };
    void this.reply(data, controller, generation, endsAt, send);
  }

  private async reply(context: BotContext, controller: AbortController, generation: number, endsAt: number, send: (line: string) => void) {
    let line: string | null = null;
    try {
      line = await this.respond(context, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) console.warn("Bot conversation used fallback", error instanceof Error ? error.message : "request failed");
    }
    if (!this.active || generation !== this.generation || controller.signal.aborted) return;
    this.request = undefined;
    if (this.now() >= endsAt) return;
    line = (line ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
    if (!line || line === this.previous) line = fallback(context, this.sent);
    this.previous = line;
    this.sent++;
    this.nextAt = this.now() + GAP_MS;
    send(line);
  }
}
