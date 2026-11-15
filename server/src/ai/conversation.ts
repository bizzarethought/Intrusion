import type { BotContext } from "./client.js";

export type ChatTurn = { name: string; message: string };
const MAX_MESSAGES = 5;
const GAP_MS = 4_000;
/** How long a line takes to type at 70 words a minute, give or take 5 (a word is five characters). */
const typingMs = (line: string, random: () => number) => (line.length * 12_000) / (65 + random() * 10);

export function addressesBot(message: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\W)@?${escaped}(?=$|\\W)`, "i").test(message);
}

/** Lines for when there is no language model: short and offhand, like someone typing with one thumb. */
function fallback(context: BotContext, turn: number): string {
  const text = context.replyTo?.message.toLowerCase() ?? "";
  if (/vote|sus|bot|\bai\b|robot/.test(text) || addressesBot(text, context.botName)) return ["why me lol", "nah not me", "ok but based on what", "thats what the bot would say", "bro i literally fell"][turn % 5];
  if (/\?/.test(text)) return ["idk", "no clue tbh", "couldnt tell you"][turn % 3];
  return ["lol", "maybe", "could be anyone tbh", "hm", "idk who it is"][turn % 5];
}

/** What a model says when it steps out of the game. Posting it would give the AI away. */
const BREAKS_CHARACTER = /\b(as an ai|language model|ai assistant|i can(?:'|no)?t (?:help|assist|comply)|i'?m sorry, but)\b/i;

/** Brings a reply down to the room's level: the model leans formal even when told not to. */
function casual(line: string, context: BotContext): string {
  const others = context.recentChat.filter((chat) => chat.name !== context.botName).map((chat) => chat.message);
  // Nobody here starts with a capital or ends with a full stop unless the humans do.
  if (!others.some((message) => /^[A-Z][a-z]/.test(message))) line = line.toLowerCase();
  if (!others.some((message) => /[a-z]\.$/i.test(message))) line = line.replace(/\.+$/, "");
  return line;
}

/**
 * Speaks only when spoken to: human messages trigger replies. No opener, no bot-to-bot feedback loop.
 * A reply appears when a person typing at 70 words a minute would have finished it, however fast the model was.
 */
export class BotConversation {
  private active = false;
  private generation = 0;
  private sent = 0;
  private dueAt = 0;
  private nextAt = 0;
  private pending: { reply: ChatTurn; direct: boolean } | undefined;
  private request: AbortController | undefined;
  /** A finished reply still being "typed", and when it will be sent. */
  private ready: { line: string; at: number } | undefined;
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
    this.pending = undefined; // it waits for someone else to speak first
    this.dueAt = 0;
  }

  stop(): void {
    this.active = false;
    this.generation++;
    this.request?.abort();
    this.request = undefined;
    this.pending = undefined;
    this.ready = undefined;
  }

  hear(turn: ChatTurn, botName: string): void {
    if (!this.active || this.sent >= MAX_MESSAGES) return;
    const direct = addressesBot(turn.message, botName);
    // Retain an accusation addressed to us when unrelated chat arrives in a burst.
    if (this.pending?.direct && !direct) return;
    const alreadyWaiting = !!this.pending;
    this.pending = { reply: turn, direct };
    // More incoming messages update context without postponing the reply forever.
    if (!alreadyWaiting) this.dueAt = Math.max(this.nextAt, this.now() + 700 + this.random() * 800); // a moment to read it
  }

  tick(endsAt: number, context: () => BotContext, send: (line: string) => void): void {
    if (!this.active) return;
    const now = this.now();
    if (this.ready) {
      if (now < this.ready.at) return; // still typing
      const { line } = this.ready;
      this.ready = undefined;
      if (now >= endsAt) return; // the vote closed first
      this.previous = line;
      this.sent++;
      this.nextAt = now + GAP_MS;
      send(line);
      return;
    }
    if (this.request || !this.pending || this.sent >= MAX_MESSAGES) return;
    if (now < Math.max(this.dueAt, this.nextAt) || endsAt - now < 1_000) return;
    const generation = this.generation;
    const turn = this.pending;
    this.pending = undefined;
    const controller = new AbortController();
    this.request = controller;
    const data = { ...context(), replyTo: turn.reply };
    void this.reply(data, controller, generation, now);
  }

  private async reply(context: BotContext, controller: AbortController, generation: number, startedAt: number) {
    let line: string | null = null;
    try {
      line = await this.respond(context, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) console.warn("Bot conversation used fallback", error instanceof Error ? error.message : "request failed");
    }
    if (!this.active || generation !== this.generation || controller.signal.aborted) return;
    this.request = undefined;
    line = casual((line ?? "").replace(/\s+/g, " ").trim().slice(0, 240), context);
    if (!line || line === this.previous || BREAKS_CHARACTER.test(line)) line = fallback(context, this.sent);
    // It started typing when it started on its answer, so the model's own speed is hidden inside the typing time.
    this.ready = { line, at: startedAt + typingMs(line, this.random) };
  }
}
