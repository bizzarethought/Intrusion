import { RLGL_FIELD } from "./rules.js";
import { shuffled } from "./identities.js";
import type { GameState, PlayerState } from "./schema.js";

// The mini-games. Each one is a small object the room drives: it places the
// players, decides what a move means, plays the AI's part ten times a second,
// and hands out any end-of-round points. The AI goes through the same `move`
// as everyone else, so the same rules catch it.
//
// Positions are metres from the middle of the level (x across, z toward the
// camera). The numbers mirror the pixel positions in client/src/game/levels.ts.

/** What a mini-game may ask of the room. */
export type Host = {
  state: GameState;
  /** The AI player, while it is still in the match. */
  bot(): PlayerState | undefined;
  /** Everyone still playing: not voted out and connected (the AI always is). */
  playing(): PlayerState[];
  /** A player reached the goal: scores them by finishing place. */
  finish(player: PlayerState): void;
  /** Ends the mini-game phase this many milliseconds from now. */
  endIn(ms: number): void;
  /** One short line from the language model, or null when it is unavailable. */
  askAi(question: string): Promise<string | null>;
};

export interface MiniGame {
  /** How long players get to read the rules before it starts. */
  readonly readyMs: number;
  readonly durationMs: number;
  /** The round is announced: place the players and publish anything they need to read. */
  setup(host: Host, lineup: PlayerState[]): void;
  /** Get-ready is over. */
  begin(host: Host, now: number): void;
  /** A player (or the AI) tries to step to x, z. False means they were sent back to the start. */
  move(host: Host, player: PlayerState, x: number, z: number, now: number): boolean;
  /** Ten times a second: timers and the AI's turn. */
  tick(host: Host, now: number): void;
  /** A game-specific message from a player (typed answers, picks, hops). False means they were sent back to the start. */
  message(host: Host, player: PlayerState, type: string, data: Record<string, unknown>, now: number): boolean | void;
  /** The phase is over: tidy up shared state. */
  end(host: Host): void;
}

const between = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** Walks a player one AI step (a tenth of a second) toward a point. Returns what `move` returned. */
function stepToward(game: MiniGame, host: Host, bot: PlayerState, x: number, z: number, speed: number, now: number): boolean {
  const dx = x - bot.x;
  const dz = z - bot.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.01) return true;
  const stride = Math.min(distance, speed * 0.1);
  return game.move(host, bot, bot.x + (dx / distance) * stride, bot.z + (dz / distance) * stride, now);
}

/** Lines players up in two staggered columns at x, spread between two z values. */
function lineUp(lineup: PlayerState[], x: number, top: number, bottom: number): void {
  lineup.forEach((player, i) => {
    const share = lineup.length > 1 ? i / (lineup.length - 1) : 0.5;
    player.x = x - (i % 2) * 0.23;
    player.z = top + share * (bottom - top);
  });
}

// ------------------------------------------------------ Red Light, Green Light

const RED_GRACE_MS = 400; // reaction time allowed after the light turns red

/** Run from the left roses to the right ones. Move while the rose watches and you go back. */
class RedLightGreenLight implements MiniGame {
  readonly readyMs = 5_000; // the rules, then a three-second count-in
  readonly durationMs = 60_000;
  private signalSince = 0;
  private flipAt = Infinity;
  /** Where each player stood when the rose first saw them on red, so small steps add up. */
  private readonly held = new Map<string, { x: number; z: number }>();
  private readonly ai = { speed: 1.3, lane: 0, moving: false, switchAt: 0 };

  setup(host: Host, lineup: PlayerState[]): void {
    lineUp(lineup, RLGL_FIELD.spawnX, RLGL_FIELD.laneTop, RLGL_FIELD.laneBottom);
    this.ai.lane = host.bot()?.z ?? 0;
    this.ai.speed = between(1.15, 1.5);
  }

  begin(host: Host, now: number): void {
    this.setSignal(host, "green", now);
  }

  private setSignal(host: Host, color: "green" | "red", now: number): void {
    host.state.signal = color;
    this.signalSince = now;
    this.held.clear();
    this.flipAt = now + (color === "green" ? between(2_200, 4_400) : between(1_600, 3_200));
    // The AI reacts like a person: a beat late to start, and now and then too late to stop.
    this.ai.switchAt = now + (color === "green" ? between(250, 700) : between(100, 480));
  }

  move(host: Host, player: PlayerState, x: number, z: number, now: number): boolean {
    const field = RLGL_FIELD;
    // shortcut: only the picture's edges are enforced here, not the pond or the rose; add shapes when collision art exists
    x = clamp(x, field.minX, field.maxX);
    z = clamp(z, field.minZ, field.maxZ);
    const onField = player.x > field.startX && player.x < field.finishX && !player.finished;
    if (host.state.signal === "red" && now - this.signalSince > RED_GRACE_MS && onField) {
      const from = this.held.get(player.id) ?? { x: player.x, z: player.z };
      this.held.set(player.id, from);
      if (Math.hypot(x - from.x, z - from.z) > 0.03) {
        player.x = field.spawnX;
        return false;
      }
    }
    player.x = x;
    player.z = z;
    if (!player.finished && x >= field.finishX) host.finish(player);
    return true;
  }

  tick(host: Host, now: number): void {
    if (now >= this.flipAt) this.setSignal(host, host.state.signal === "green" ? "red" : "green", now);
    const bot = host.bot();
    if (!bot || bot.finished) return;
    if (now >= this.ai.switchAt) this.ai.moving = host.state.signal === "green";
    if (!this.ai.moving) return;
    const drift = (this.ai.lane - bot.z) * 0.05 + between(-0.01, 0.01); // wanders a little, like a hand on a keyboard
    if (!this.move(host, bot, bot.x + this.ai.speed * 0.1, bot.z + drift, now)) this.ai.moving = false;
  }

  message(): void {}

  end(host: Host): void {
    host.state.signal = "";
  }
}

// ---------------------------------------------------------- Glass Bridge Memory

/** The bridge: seven columns of two panels over the pond, between two banks. */
export const BRIDGE = {
  spawnX: -1.9, // where players wait on the left bank
  startX: -1.5, // left edge of the first column
  finishX: 2.0, // right edge of the last column
  columns: 7,
  columnWidth: 0.5,
  rowCentre: [0.16, -0.39], // row 0 is nearer the camera, row 1 further
  bankTop: -0.75,
  bankBottom: 0.35,
};
const HOP_MS = 250; // one hop at a time: the next is refused until this one has landed

/**
 * A safe row (0 or 1) for each column, as a string. Each column is a coin flip, but a path that
 * runs nearly straight or nearly zigzags is thrown back: anyone could cross it without
 * remembering, and a player who then "forgets" one gives themselves away. The path changes row
 * two, three or four times in its six steps.
 */
export function bridgePattern(random: () => number = Math.random): string {
  for (;;) {
    const pattern = Array.from({ length: BRIDGE.columns }, () => (random() < 0.5 ? "0" : "1")).join("");
    const turns = [...pattern].filter((row, i) => i > 0 && row !== pattern[i - 1]).length;
    if (turns >= 2 && turns <= 4) return pattern;
  }
}

/**
 * The safe panels flash once; then everyone crosses from memory, one hop at a time: a player
 * names a panel in the next column and lands on its middle. A wrong panel breaks and drops them
 * back on the bank. Nobody walks here, so there is no edge of a panel to slip over.
 */
class GlassBridgeMemory implements MiniGame {
  readonly readyMs = 7_000; // long enough to memorise seven panels
  readonly durationMs = 60_000;
  private pattern = "";
  private readonly broken = new Set<string>();
  /** Each player's column (-1 on the left bank, 7 once across), last hop, and place on the bank. */
  private readonly at = new Map<string, { col: number; hopAt: number; x: number; z: number }>();
  /** What the AI believes the safe row is for each column: mostly right, sometimes not. */
  private aiPlan: number[] = [];
  private aiWaitUntil = 0;

  setup(host: Host, lineup: PlayerState[]): void {
    this.pattern = bridgePattern();
    host.state.pattern = this.pattern; // shown while players get ready...
    host.state.broken = "";
    lineUp(lineup, BRIDGE.spawnX, BRIDGE.bankTop, BRIDGE.bankBottom);
    for (const player of lineup) this.at.set(player.id, { col: -1, hopAt: 0, x: player.x, z: player.z });
  }

  begin(host: Host, now: number): void {
    host.state.pattern = ""; // ...then hidden: from here it is memory
    this.aiPlan = [...this.pattern].map((row) => (Math.random() < 0.72 ? Number(row) : 1 - Number(row)));
    this.aiWaitUntil = now + between(600, 1_800);
  }

  move(): boolean {
    return true; // nobody walks: the only way forward is a hop
  }

  /** Hops a player onto a panel in the next column, or off the last column onto the far bank. False if the panel gave way. */
  private hop(host: Host, player: PlayerState, col: number, row: number, now: number): boolean {
    const spot = this.at.get(player.id);
    if (!spot || player.finished || col !== spot.col + 1 || now - spot.hopAt < HOP_MS) return true; // not a hop they can make: ignored
    spot.hopAt = now;
    spot.col = col;
    if (col >= BRIDGE.columns) {
      // Across: onto the far bank, opposite where they started.
      player.x = BRIDGE.finishX + 0.35 + (BRIDGE.spawnX - spot.x);
      player.z = spot.z;
      host.finish(player);
      return true;
    }
    const key = `${col}:${row}`;
    if (this.broken.has(key) || this.pattern[col] !== String(row)) {
      this.broken.add(key); // it shatters, so everyone after can see it was wrong
      host.state.broken = [...this.broken].join(",");
      spot.col = -1;
      player.x = spot.x;
      player.z = spot.z;
      return false;
    }
    player.x = BRIDGE.startX + (col + 0.5) * BRIDGE.columnWidth;
    player.z = BRIDGE.rowCentre[row];
    return true;
  }

  tick(host: Host, now: number): void {
    const bot = host.bot();
    const spot = bot && this.at.get(bot.id);
    if (!bot || !spot || bot.finished || now < this.aiWaitUntil) return;
    const col = spot.col + 1;
    // It learns from panels anyone has already broken.
    if (col < BRIDGE.columns && this.broken.has(`${col}:${this.aiPlan[col]}`)) this.aiPlan[col] = 1 - this.aiPlan[col];
    // Hesitates before each panel, and longer after getting one wrong.
    this.aiWaitUntil = now + (this.hop(host, bot, col, this.aiPlan[col] ?? 0, now) ? between(450, 1_400) : between(1_000, 2_000));
  }

  message(host: Host, player: PlayerState, type: string, data: Record<string, unknown>, now: number): boolean | void {
    if (type !== "hop" || !Number.isInteger(data.col) || (data.row !== 0 && data.row !== 1)) return;
    return this.hop(host, player, data.col as number, data.row, now);
  }

  end(host: Host): void {
    host.state.pattern = "";
    host.state.broken = "";
  }
}

// ----------------------------------------------------------------- Pick a Side

/**
 * The pond level: the left bank is the red answer, the right bank the blue one. Everyone starts
 * on a grass islet in the middle of the pond, and a row of stepping stones joins it to both banks.
 * The crossing (stones and islet: between leftX and rightX, top and bottom) is neither side.
 * Mirrors SIDES in client/src/game/levels.ts.
 */
export const SIDES = {
  leftX: -0.55, rightX: 2.447, top: -0.865, bottom: 0.419, midX: 0.498,
  /** The row of stepping stones. */
  laneZ: -0.279,
  /** Where everyone starts on the islet: four across, three rows, the middle row first. */
  startX: [0.123, 0.373, 0.623, 0.873],
  startZ: [-0.223, -0.463, 0.017],
  /** Grass on each bank where the AI may come to rest: [x from, x to, z from, z to]. */
  rest: { A: [-1.99, -1.24, -1.0, 0.0], B: [2.61, 3.09, -0.28, 0.17] },
  minX: -3.2, maxX: 3.2, minZ: -1.6, maxZ: 2.7,
};
const SIDE_PROMPTS: Array<[question: string, red: string, blue: string]> = [
  ["Would you rather...", "always be ten minutes late", "always be an hour early"],
  ["Would you rather...", "fight one horse-sized duck", "fight a hundred duck-sized horses"],
  ["Would you rather...", "only whisper", "only shout"],
  ["Would you rather...", "have hiccups for a year", "feel a sneeze coming for a year"],
  ["Would you rather...", "know every language", "talk to animals"],
  ["Would you rather...", "never eat cheese again", "never eat chocolate again"],
  ["Would you rather...", "live without music", "live without films"],
  ["Would you rather...", "have a rewind button", "have a pause button"],
  ["Would you rather...", "always be too hot", "always be too cold"],
  ["Would you rather...", "give up your phone for a month", "give up your bed for a month"],
];

/** Which bank a player is standing on: "A" (red, left), "B" (blue, right) or "" (still on the crossing). */
export function sideOf(x: number, z: number): "A" | "B" | "" {
  const crossing = x > SIDES.leftX && x < SIDES.rightX && z > SIDES.top && z < SIDES.bottom;
  return crossing ? "" : x < SIDES.midX ? "A" : "B";
}

/** Points for a would-you-rather: the bigger crowd scores most; a tie pays both; not choosing pays nothing. */
export function sidePoints(side: "A" | "B" | "", a: number, b: number): number {
  if (!side) return 0;
  if (a === b) return 40;
  return (side === "A" ? a > b : b > a) ? 60 : 20;
}

/** A would-you-rather: cross to the bank you choose before time runs out. */
class PickASide implements MiniGame {
  readonly readyMs = 6_000; // time to read the question
  readonly durationMs = 24_000;
  private decideAt = 0;
  /** The AI's choice, when it sets off, and how far across its bank's resting place it will stop (0 to 1 each way). */
  private readonly ai = { goAt: 0, side: "A" as "A" | "B", reconsiderAt: 0, across: 0.5, along: 0.5 };

  setup(host: Host, lineup: PlayerState[]): void {
    const [question, red, blue] = pick(SIDE_PROMPTS);
    host.state.prompt = question;
    host.state.optionA = red;
    host.state.optionB = blue;
    host.state.stage = "choose";
    lineup.forEach((player, i) => {
      player.x = SIDES.startX[i % SIDES.startX.length];
      player.z = SIDES.startZ[Math.floor(i / SIDES.startX.length) % SIDES.startZ.length];
    });
  }

  begin(_host: Host, now: number): void {
    this.decideAt = now + this.durationMs - 4_000; // the last four seconds show the result
    this.ai.side = Math.random() < 0.5 ? "A" : "B";
    this.ai.goAt = now + between(2_500, 10_000);
    this.ai.reconsiderAt = now + between(12_000, 16_000);
    this.ai.across = Math.random(); // somewhere on the bank, never the same spot twice
    this.ai.along = Math.random();
  }

  move(host: Host, player: PlayerState, x: number, z: number): boolean {
    if (host.state.stage !== "choose") return true; // choices are locked in
    player.x = clamp(x, SIDES.minX, SIDES.maxX);
    player.z = clamp(z, SIDES.minZ, SIDES.maxZ);
    return true;
  }

  tick(host: Host, now: number): void {
    if (host.state.stage === "choose" && now >= this.decideAt) {
      const players = host.playing();
      const a = players.filter((player) => sideOf(player.x, player.z) === "A").length;
      const b = players.filter((player) => sideOf(player.x, player.z) === "B").length;
      for (const player of players) player.score += sidePoints(sideOf(player.x, player.z), a, b);
      host.state.board = JSON.stringify({ a, b });
      host.state.stage = "result";
      return;
    }
    const bot = host.bot();
    if (!bot || host.state.stage !== "choose" || now < this.ai.goAt) return;
    if (now >= this.ai.reconsiderAt) {
      // A late look at where the crowd went; sometimes it follows.
      this.ai.reconsiderAt = Infinity;
      const others = host.playing().filter((player) => player !== bot);
      const a = others.filter((player) => sideOf(player.x, player.z) === "A").length;
      const b = others.filter((player) => sideOf(player.x, player.z) === "B").length;
      if (a !== b && Math.random() < 0.4) this.ai.side = a > b ? "A" : "B";
    }
    // Onto the row of stones, along it to the bank, then to its spot on the grass.
    const [fromX, toX, fromZ, toZ] = SIDES.rest[this.ai.side];
    const shore = this.ai.side === "A" ? SIDES.leftX - 0.45 : SIDES.rightX + 0.1; // the first footing on the bank
    const arrived = this.ai.side === "A" ? bot.x <= shore + 0.02 : bot.x >= shore - 0.02;
    const offStones = Math.abs(bot.z - SIDES.laneZ) > 0.05;
    const [x, z] = arrived ? [fromX + (toX - fromX) * this.ai.across, fromZ + (toZ - fromZ) * this.ai.along] : offStones ? [bot.x, SIDES.laneZ] : [shore, SIDES.laneZ];
    stepToward(this, host, bot, x, z, 1.3, now);
  }

  message(): void {}

  end(host: Host): void {
    host.state.prompt = host.state.optionA = host.state.optionB = host.state.stage = host.state.board = "";
  }
}

// --------------------------------------------------------------- Prompt Podium

/** The ten boulders, as pixels on the podium level (266.67 px per metre, 38 degree camera). */
const PODIUM_SPOTS = [[208, 332], [316, 437], [462, 397], [638, 444], [833, 548], [1034, 524], [1229, 521], [1405, 426], [1551, 407], [1658, 271]]
  .map(([px, py]) => ({ x: (px - 960) / 266.67, z: (py - 540) / (266.67 * Math.sin((38 * Math.PI) / 180)) }));
const PODIUM_PROMPTS = [
  "The worst thing to say on a first date",
  "A terrible name for a pet goldfish",
  "What robots dream about",
  "The real reason the chicken crossed the road",
  "A bad slogan for a dentist",
  "Something you should never put in a sandwich",
  "The title of your autobiography",
  "What the moon is actually made of",
  "A rejected ice cream flavour",
  "The worst superpower to have",
];
const PODIUM_FALLBACKS = ["honestly no idea", "probably soup", "my wifi password", "a slightly damp sock", "idk but it sounds expensive"];
const ANSWER_MS = 25_000;
const VOTE_MS = 15_000;
const RESULTS_MS = 6_000;
const ANSWER_LENGTH = 80;

export type PodiumEntry = { key: number; text: string; playerId?: string; votes?: number };

/** Counts the picks for each answer and returns the entries, most-voted first, with their authors. */
export function podiumResults(answers: Map<string, string>, keys: Map<string, number>, picks: Map<string, number>): PodiumEntry[] {
  return [...answers].map(([playerId, text]) => {
    const key = keys.get(playerId) ?? -1;
    return { key, text, playerId, votes: [...picks.values()].filter((picked) => picked === key).length };
  }).sort((a, b) => b.votes - a.votes);
}

/** Everyone types an answer to a prompt, then votes for the funniest one that is not their own. */
class PromptPodium implements MiniGame {
  readonly readyMs = 5_000; // the rules, then a three-second count-in
  readonly durationMs = ANSWER_MS + VOTE_MS + RESULTS_MS;
  private stageEndsAt = 0;
  private readonly answers = new Map<string, string>();
  private readonly keys = new Map<string, number>();
  private readonly picks = new Map<string, number>();
  private aiAnswer = "";
  private aiActsAt = Infinity;

  setup(host: Host, lineup: PlayerState[]): void {
    host.state.prompt = pick(PODIUM_PROMPTS);
    host.state.stage = "answer";
    host.state.board = "";
    // Spread along the row, so a small group stands on boulders well apart, one each.
    const step = (PODIUM_SPOTS.length - 1) / Math.max(1, lineup.length - 1);
    lineup.forEach((player, i) => Object.assign(player, PODIUM_SPOTS[Math.min(PODIUM_SPOTS.length - 1, Math.round(i * step))]));
  }

  begin(host: Host, now: number): void {
    this.stageEndsAt = now + ANSWER_MS;
    // The AI "types" for a human sort of time, whatever the model's own speed.
    this.aiActsAt = now + between(5_000, 14_000);
    this.aiAnswer = pick(PODIUM_FALLBACKS);
    host.askAi(`Party game prompt: "${host.state.prompt}". Reply with one short, funny answer a casual player would type. Lowercase, under 10 words, no quotes.`)
      .then((line) => { if (line) this.aiAnswer = line; })
      .catch(() => {}); // keep the fallback
  }

  move(): boolean {
    return true; // everyone stays at their boulder
  }

  tick(host: Host, now: number): void {
    const players = host.playing();
    const bot = host.bot();
    if (host.state.stage === "answer") {
      if (bot && now >= this.aiActsAt && !this.answers.has(bot.id)) this.answers.set(bot.id, this.aiAnswer.slice(0, ANSWER_LENGTH));
      if (now < this.stageEndsAt && !players.every((player) => this.answers.has(player.id))) return;
      // Answers go up shuffled and unsigned.
      shuffled([...this.answers.keys()]).forEach((playerId, key) => this.keys.set(playerId, key));
      host.state.board = JSON.stringify([...this.answers].map(([playerId, text]) => ({ key: this.keys.get(playerId), text })).sort((a, b) => (a.key ?? 0) - (b.key ?? 0)));
      host.state.stage = "vote";
      this.stageEndsAt = now + VOTE_MS;
      this.aiActsAt = now + between(3_000, 9_000);
    } else if (host.state.stage === "vote") {
      if (bot && now >= this.aiActsAt && !this.picks.has(bot.id)) {
        const others = [...this.keys].filter(([playerId]) => playerId !== bot.id).map(([, key]) => key);
        if (others.length) this.picks.set(bot.id, pick(others));
        else this.picks.set(bot.id, -1);
      }
      const canPick = players.filter((player) => [...this.keys.keys()].some((author) => author !== player.id));
      if (now < this.stageEndsAt && !canPick.every((player) => this.picks.has(player.id))) return;
      const results = podiumResults(this.answers, this.keys, this.picks);
      for (const entry of results) {
        const author = host.state.players.get(entry.playerId ?? "");
        if (author) author.score += Math.min(120, (entry.votes ?? 0) * 40);
      }
      host.state.board = JSON.stringify(results);
      host.state.stage = "results";
      host.endIn(RESULTS_MS);
    }
  }

  message(host: Host, player: PlayerState, type: string, data: Record<string, unknown>): void {
    if (type === "answer" && host.state.stage === "answer" && typeof data.text === "string") {
      // Printable text only, one line, kept short.
      const text = data.text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, ANSWER_LENGTH);
      if (text) this.answers.set(player.id, text);
    } else if (type === "pick" && host.state.stage === "vote" && typeof data.key === "number") {
      const own = this.keys.get(player.id);
      if (data.key !== own && [...this.keys.values()].includes(data.key)) this.picks.set(player.id, data.key);
    }
  }

  end(host: Host): void {
    host.state.prompt = host.state.stage = host.state.board = "";
  }
}

// ------------------------------------------------------------------------ pool

export const MINI_GAME_IDS = ["red-light-green-light", "glass-bridge-memory", "pick-a-side", "prompt-podium"] as const;
export type MiniGameId = (typeof MINI_GAME_IDS)[number];

/** Mini-games still to come before any of them repeats. Shared by every match on this server, so matches played back to back get different games. */
let upcoming: string[] = [];
let lastDrawn = "";

/**
 * The next mini-game for a match that has already had `played` (which this adds to): the next
 * one in the shared rotation that this match has not played yet.
 */
export function nextMiniGame(played: Set<string>): string {
  if (played.size >= MINI_GAME_IDS.length) played.clear();
  let index = upcoming.findIndex((id) => !played.has(id));
  if (index < 0) {
    const fresh = shuffled(MINI_GAME_IDS);
    if (fresh[0] === lastDrawn) fresh.push(fresh.shift()!); // a new shuffle never opens with the game just played
    upcoming.push(...fresh);
    index = upcoming.findIndex((id) => !played.has(id));
  }
  [lastDrawn] = upcoming.splice(index, 1);
  played.add(lastDrawn);
  return lastDrawn;
}

export function createMiniGame(id: string): MiniGame {
  if (id === "glass-bridge-memory") return new GlassBridgeMemory();
  if (id === "pick-a-side") return new PickASide();
  if (id === "prompt-podium") return new PromptPodium();
  return new RedLightGreenLight();
}
