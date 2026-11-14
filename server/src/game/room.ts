import { Client, Room, generateId } from "colyseus";
import { AiClient } from "../ai/client.js";
import {
  GET_READY_MS,
  LOADING_MS,
  MAX_HUMANS,
  MINI_GAMES,
  MIN_HUMANS,
  ROUND_DURATION_MS,
  SCOREBOARD_MS,
  TURING_MS,
  VOTE_DURATION_MS,
  type Phase,
} from "./constants.js";
import { RLGL_FIELD, placementPoints, voteBudget, votedOut } from "./rules.js";
import { GameState, PlayerState } from "./schema.js";

const RUN_SPEED = 1.5; // metres per second; the client walks at this speed
const SPEED_SLACK = 1.5; // how far over that a move may be before it is cut short (network jitter)
const RED_GRACE_MS = 400; // reaction time allowed after the light turns red
const CHAT_GAP_MS = 600; // one chat message per player per this long
const BOT_NAMES = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Jamie", "Taylor", "Quinn", "Avery"];
// What the AI says when no language model is configured or the call fails.
const BOT_LINES = [
  "honestly no idea who it is",
  "i was just trying not to get caught lol",
  "someone stopped way too perfectly on that last red",
  "idk, im voting with whoever has a real reason",
  "that round was rough for me",
];

const between = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
// Messages come from the network: never trust their shape.
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export class FindTheBotRoom extends Room<GameState> {
  maxClients = MAX_HUMANS;
  state = new GameState();

  private readonly aiClient = new AiClient();
  /** The AI player's id. Lives only on the server until the reveal. */
  private botId = "";
  private pendingWinner: "" | "humans" | "ai" = "";
  private readonly votes = new Map<string, string | null>();
  private readonly turingDone = new Set<string>();
  private readonly lastMoveAt = new Map<string, number>();
  private readonly lastChatAt = new Map<string, number>();
  private recentChat: Array<{ name: string; message: string }> = [];
  private finishers = 0;
  private signalSince = 0;
  /** How the AI plays this round and when it next acts. */
  private readonly bot = { speed: 1.3, lane: 0, moving: false, switchAt: 0, voteAt: 0, chatAt: 0 };
  private phaseTimer?: ReturnType<typeof setTimeout>;
  private signalTimer?: ReturnType<typeof setTimeout>;
  private tickTimer?: ReturnType<typeof setInterval>;

  onCreate(): void {
    this.setPatchRate(50);
    this.onMessage("start_match", (client) => this.startMatch(client));
    this.onMessage("move", (client, message) => this.move(client, asRecord(message)));
    this.onMessage("turing_result", (client, message) => this.recordTuringResult(client, asRecord(message)));
    this.onMessage("vote", (client, message) => {
      const target = asRecord(message).targetId;
      this.castVote(client.sessionId, typeof target === "string" ? target : null);
    });
    this.onMessage("chat", (client, message) => this.chat(client, asRecord(message)));
    this.tickTimer = setInterval(() => this.tick(), 100);
  }

  onJoin(client: Client, options: { displayName?: unknown }): void {
    if (this.state.phase !== "lobby") throw new Error("Match already started");
    const player = new PlayerState();
    player.id = client.sessionId;
    player.displayName = this.sanitizeName(typeof options?.displayName === "string" ? options.displayName : "");
    this.state.players.set(client.sessionId, player);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.state.phase === "lobby") {
      this.state.players.delete(client.sessionId); // free the seat and the name
      if (this.state.hostId === client.sessionId) {
        this.state.hostId = [...this.state.players.keys()][0] ?? "";
      }
      return;
    }
    player.connected = false;
    // Don't make everyone wait on someone who has gone.
    if (this.state.phase === "voting" && this.everyoneVoted()) this.resolveVote();
  }

  onDispose(): void {
    clearTimeout(this.phaseTimer);
    clearTimeout(this.signalTimer);
    clearInterval(this.tickTimer);
  }

  // ---------------------------------------------------------------- players

  private all(): PlayerState[] {
    return [...this.state.players.values()];
  }
  /** Still in the match and able to act: not voted out, and connected (the AI always is). */
  private playing(): PlayerState[] {
    return this.all().filter((player) => !player.eliminated && (player.connected || player.id === this.botId));
  }
  private everyoneVoted(): boolean {
    return this.playing().every((player) => this.votes.has(player.id));
  }
  private sanitizeName(name: string): string {
    return name.replace(/[^\w -]/g, "").trim().slice(0, 24) || "Player";
  }

  // ----------------------------------------------------------------- phases

  private startMatch(client: Client): void {
    if (this.state.phase !== "lobby") return;
    if (client.sessionId !== this.state.hostId) return; // only the host
    const humans = this.all().length;
    if (humans < MIN_HUMANS) return;
    this.lock(); // nobody can join a running match

    // The AI joins looking like any other player: a random id and an unused ordinary name.
    const taken = new Set(this.all().map((player) => player.displayName.toLowerCase()));
    const bot = new PlayerState();
    bot.id = generateId();
    bot.displayName = pick(BOT_NAMES.filter((name) => !taken.has(name.toLowerCase())));
    this.botId = bot.id;
    this.state.players.set(bot.id, bot);

    this.state.votesRemaining = voteBudget(humans);
    this.beginPhase("loading", LOADING_MS);
  }

  private beginPhase(phase: Phase, durationMs: number): void {
    this.state.phase = phase;
    this.state.phaseEndsAt = Date.now() + durationMs;
    clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => this.advancePhase(), durationMs);
  }

  private advancePhase(): void {
    switch (this.state.phase) {
      case "loading":
        this.startRound();
        break;
      case "travel":
        this.setSignal("green");
        this.beginPhase("minigame", ROUND_DURATION_MS);
        break;
      case "minigame": {
        clearTimeout(this.signalTimer);
        this.state.signal = "";
        this.turingDone.clear();
        const bot = this.state.players.get(this.botId);
        if (bot) bot.turingScore = Math.round(between(35, 90)); // sometimes looks more human than a human
        this.beginPhase("turing-check", TURING_MS);
        break;
      }
      case "turing-check": {
        this.votes.clear();
        const now = Date.now();
        this.bot.chatAt = now + between(2_000, 7_000);
        this.bot.voteAt = now + between(5_000, VOTE_DURATION_MS * 0.6);
        this.beginPhase("voting", VOTE_DURATION_MS);
        break;
      }
      case "voting":
        this.resolveVote();
        break;
      case "scoreboard":
        if (this.pendingWinner) this.reveal();
        else this.startRound();
        break;
      default:
        break;
    }
  }

  /** Puts everyone on the start line for the next mini-game. */
  private startRound(): void {
    this.state.round += 1;
    this.state.miniGame = MINI_GAMES[(this.state.round - 1) % MINI_GAMES.length];
    this.state.signal = "";
    this.finishers = 0;
    this.lastMoveAt.clear();
    const lineup = this.all().filter((player) => !player.eliminated);
    lineup.forEach((player, i) => {
      const share = lineup.length > 1 ? i / (lineup.length - 1) : 0.5;
      player.x = RLGL_FIELD.spawnX - (i % 2) * 0.23; // two staggered columns
      player.z = RLGL_FIELD.laneTop + share * (RLGL_FIELD.laneBottom - RLGL_FIELD.laneTop);
      player.finished = false;
      if (player.id === this.botId) this.bot.lane = player.z;
    });
    this.bot.speed = between(1.15, RUN_SPEED);
    this.bot.moving = false;
    this.beginPhase("travel", GET_READY_MS);
  }

  private reveal(): void {
    clearTimeout(this.phaseTimer);
    const bot = this.state.players.get(this.botId);
    if (bot) bot.isBot = true; // the only moment this is ever sent
    this.state.winner = this.pendingWinner;
    this.state.phase = "reveal";
    this.state.phaseEndsAt = 0;
  }

  // ---------------------------------------------- Red Light, Green Light

  private setSignal(color: "green" | "red"): void {
    const now = Date.now();
    this.state.signal = color;
    this.signalSince = now;
    // The AI reacts like a person: a beat late to start, and now and then too late to stop.
    this.bot.switchAt = now + (color === "green" ? between(250, 700) : between(100, 480));
    clearTimeout(this.signalTimer);
    this.signalTimer = setTimeout(
      () => this.setSignal(color === "green" ? "red" : "green"),
      color === "green" ? between(2_200, 4_400) : between(1_600, 3_200),
    );
  }

  /**
   * Moves a player, human or AI, under the same rules. Returns false if the
   * rose caught them moving on red and sent them back to the start.
   */
  private tryMove(player: PlayerState, x: number, z: number, now: number): boolean {
    const field = RLGL_FIELD;
    // shortcut: only the picture's edges are enforced here, not the pond or the rose; add shapes when collision art exists
    x = clamp(x, field.minX, field.maxX);
    z = clamp(z, field.minZ, field.maxZ);
    const moved = Math.hypot(x - player.x, z - player.z);
    const onField = player.x > field.startX && player.x < field.finishX && !player.finished;
    if (this.state.signal === "red" && now - this.signalSince > RED_GRACE_MS && onField && moved > 0.03) {
      player.x = field.spawnX;
      return false;
    }
    player.x = x;
    player.z = z;
    if (!player.finished && x >= field.finishX) this.finish(player);
    return true;
  }

  private finish(player: PlayerState): void {
    player.finished = true;
    player.score += placementPoints(this.finishers++);
    // Everyone is across: no need to run out the clock.
    if (this.playing().every((each) => each.finished)) this.beginPhase("minigame", 2_000);
  }

  private move(client: Client, message: Record<string, unknown>): void {
    if (this.state.phase !== "minigame") return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.eliminated || !finite(message.x) || !finite(message.z)) return;
    const now = Date.now();
    // Nobody moves faster than a run. A longer step is cut short, not thrown away.
    const elapsed = Math.min((now - (this.lastMoveAt.get(player.id) ?? 0)) / 1000, 0.5);
    this.lastMoveAt.set(player.id, now);
    const reach = RUN_SPEED * SPEED_SLACK * elapsed + 0.05;
    let stepX = message.x - player.x;
    let stepZ = message.z - player.z;
    const distance = Math.hypot(stepX, stepZ);
    if (distance > reach) {
      stepX *= reach / distance;
      stepZ *= reach / distance;
    }
    if (!this.tryMove(player, player.x + stepX, player.z + stepZ, now)) client.send("caught");
  }

  /** The AI's turn in the mini-game, ten times a second. */
  private stepBot(now: number): void {
    const bot = this.state.players.get(this.botId);
    if (!bot || bot.eliminated || bot.finished) return;
    if (now >= this.bot.switchAt) this.bot.moving = this.state.signal === "green";
    if (!this.bot.moving) return;
    const drift = (this.bot.lane - bot.z) * 0.05 + between(-0.01, 0.01); // wanders a little, like a hand on a keyboard
    if (!this.tryMove(bot, bot.x + this.bot.speed * 0.1, bot.z + drift, now)) this.bot.moving = false;
  }

  // ------------------------------------------------------- checks and votes

  private recordTuringResult(client: Client, message: Record<string, unknown>): void {
    if (this.state.phase !== "turing-check" || !finite(message.score) || this.turingDone.has(client.sessionId)) return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.eliminated) return;
    this.turingDone.add(client.sessionId); // one answer per check
    player.turingScore = clamp(Math.floor(message.score), 0, 100);
  }

  castVote(voterId: string, targetId: string | null): void {
    if (this.state.phase !== "voting" || this.votes.has(voterId)) return;
    const voter = this.state.players.get(voterId);
    if (!voter || voter.eliminated) return;
    if (targetId !== null) {
      const target = this.state.players.get(targetId);
      if (!target || target.eliminated || targetId === voterId) return;
    }
    this.votes.set(voterId, targetId);
    if (this.everyoneVoted()) this.resolveVote();
  }

  private resolveVote(): void {
    if (this.state.phase !== "voting") return;
    this.state.votesRemaining = Math.max(0, this.state.votesRemaining - 1);
    const outId = votedOut(this.votes.values());
    const out = outId ? this.state.players.get(outId) : undefined;
    if (out) {
      out.eliminated = true;
      for (const [voterId, targetId] of this.votes) {
        const voter = this.state.players.get(voterId);
        if (!voter || targetId !== outId || voterId === this.botId) continue;
        // Voting out the AI pays; voting out a human costs.
        voter.score = outId === this.botId ? voter.score + 50 : Math.max(0, voter.score - 20);
      }
    }
    const humansLeft = this.all().filter((player) => player.id !== this.botId && !player.eliminated);
    if (outId === this.botId) {
      this.pendingWinner = "humans";
      // Catching it sooner is worth more: a bonus for every vote the humans did not need.
      for (const human of humansLeft) human.score += 50 * (this.state.votesRemaining + 1);
    } else if (this.state.votesRemaining <= 0 || humansLeft.length <= 1) {
      this.pendingWinner = "ai"; // it survived every vote, or there is nobody left to out-vote it
    }
    this.beginPhase("scoreboard", SCOREBOARD_MS);
  }

  private chat(client: Client, message: Record<string, unknown>): void {
    if (this.state.phase === "lobby" || this.state.phase === "loading" || typeof message.message !== "string") return;
    const player = this.state.players.get(client.sessionId);
    const text = message.message.trim().slice(0, 240);
    const now = Date.now();
    if (!player || player.eliminated || !text || now - (this.lastChatAt.get(player.id) ?? 0) < CHAT_GAP_MS) return;
    this.lastChatAt.set(player.id, now);
    this.say(player, text);
  }

  private say(player: PlayerState, text: string): void {
    this.recentChat = [...this.recentChat, { name: player.displayName, message: text }].slice(-12);
    this.broadcast("chat", { playerId: player.id, message: text });
  }

  // -------------------------------------------------------------------- AI

  private tick(): void {
    const now = Date.now();
    if (this.state.phase === "minigame") this.stepBot(now);
    if (this.state.phase !== "voting") return;
    const bot = this.state.players.get(this.botId);
    if (!bot || bot.eliminated) return;
    if (this.bot.chatAt && now >= this.bot.chatAt) {
      this.bot.chatAt = 0;
      void this.botChat(bot);
    }
    // The AI always votes, so a missing vote can't give it away.
    if (now >= this.bot.voteAt && !this.votes.has(bot.id)) {
      const humans = this.all().filter((player) => player.id !== bot.id && !player.eliminated);
      this.castVote(bot.id, humans.length ? pick(humans).id : null);
    }
  }

  private async botChat(bot: PlayerState): Promise<void> {
    let line: string | null = null;
    try {
      line = await this.aiClient.respond({
        botName: bot.displayName,
        phase: this.state.phase,
        round: this.state.round,
        // Only what any player can see on their own screen.
        visiblePlayers: this.all().map((player) => ({ name: player.displayName, score: player.score, eliminated: player.eliminated })),
        recentChat: this.recentChat,
        accusations: this.recentChat.filter((chat) => chat.message.toLowerCase().includes(bot.displayName.toLowerCase())).map((chat) => chat.message),
      });
    } catch (error) {
      console.error("Bot chat failed", error);
    }
    if (this.state.phase === "voting" && !bot.eliminated) this.say(bot, line ?? pick(BOT_LINES));
  }
}
