import { Client, Room, generateId } from "colyseus";
import { AiClient, type BotContext } from "../ai/client.js";
import { BotConversation, addressesBot } from "../ai/conversation.js";
import { config } from "../config.js";
import {
  LOADING_MS,
  MAX_HUMANS,
  MIN_HUMANS,
  SCOREBOARD_MS,
  TURING_MS,
  VOTE_DURATION_MS,
  type Phase,
} from "./constants.js";
import { MINI_GAME_IDS, createMiniGame, type Host, type MiniGame } from "./minigames.js";
import { placementPoints, voteBudget, votedOut } from "./rules.js";
import { matchAliases, shuffled } from "./identities.js";
import { GameState, PlayerState } from "./schema.js";

const RUN_SPEED = 1.5; // metres per second; the client walks at this speed
const SPEED_SLACK = 1.5; // how far over that a move may be before it is cut short (network jitter)
const CHAT_GAP_MS = 600; // one chat message per player per this long
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
  private readonly conversation = new BotConversation((context, signal) => this.aiClient.respond(context, signal));
  /** The AI player's id. Lives only on the server until the reveal. */
  private botId = "";
  private readonly matchPlayers = new Map<string, string>();
  private readonly lobbyNames = new Map<string, string>();
  private pendingWinner: "" | "humans" | "ai" = "";
  private readonly votes = new Map<string, string | null>();
  private readonly turingDone = new Set<string>();
  private readonly lastMoveAt = new Map<string, number>();
  private readonly lastChatAt = new Map<string, number>();
  private recentChat: Array<{ name: string; message: string }> = [];
  private finishers = 0;
  /** When the AI casts its vote. */
  private readonly bot = { voteAt: 0 };
  /** The mini-game being played, and the ones still to come this match (shuffled, refilled when empty). */
  private game: MiniGame = createMiniGame(MINI_GAME_IDS[0]);
  private pool: string[] = [];
  /** What a mini-game may ask of the room. */
  private readonly host: Host = {
    state: this.state,
    bot: () => {
      const bot = this.state.players.get(this.botId);
      return bot && !bot.eliminated ? bot : undefined;
    },
    playing: () => this.playing(),
    finish: (player) => this.finish(player),
    endIn: (ms) => this.beginPhase("minigame", ms),
    askAi: (question) => this.aiClient.answer(question),
  };
  private phaseTimer?: ReturnType<typeof setTimeout>;
  private tickTimer?: ReturnType<typeof setInterval>;

  onCreate(): void {
    this.setPatchRate(50);
    this.onMessage("start_match", (client) => this.startMatch(client));
    this.onMessage("move", (client, message) => this.move(client, asRecord(message)));
    this.onMessage("turing_result", (client, message) => this.recordTuringResult(client, asRecord(message)));
    this.onMessage("vote", (client, message) => {
      const target = asRecord(message).targetId;
      this.castVote(this.playerId(client.sessionId), typeof target === "string" ? target : null);
    });
    this.onMessage("chat", (client, message) => this.chat(client, asRecord(message)));
    // Mini-game input: a typed answer and a pick (Prompt Podium).
    for (const type of ["answer", "pick"]) {
      this.onMessage(type, (client, message) => {
        const player = this.state.players.get(this.playerId(client.sessionId));
        if (this.state.phase === "minigame" && player && !player.eliminated) this.game.message(this.host, player, type, asRecord(message), Date.now());
      });
    }
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
    const player = this.state.players.get(this.playerId(client.sessionId));
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
    this.conversation.stop();
    clearTimeout(this.phaseTimer);
    clearInterval(this.tickTimer);
  }

  // ---------------------------------------------------------------- players

  private playerId(sessionId: string): string {
    return this.matchPlayers.get(sessionId) ?? sessionId;
  }

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

    // Replace every lobby object and id, including join order, before adding the AI.
    // Reusing schema objects would preserve an observable reference back to a friend.
    const lobby = this.all();
    const oldIds = new Set(lobby.map(player => player.id));
    const aliases = matchAliases(lobby.map(player => player.displayName), humans + 1);
    const seats = shuffled([...lobby.map(player => ({ sessionId: player.id, name: player.displayName })), { sessionId: "", name: "" }]);
    this.state.players.clear();
    this.state.hostId = ""; // host status must not identify a human during the match
    seats.forEach((seat, index) => {
      const player = new PlayerState();
      do { player.id = generateId(); } while (oldIds.has(player.id) || this.state.players.has(player.id));
      player.displayName = aliases[index];
      if (seat.sessionId) {
        this.matchPlayers.set(seat.sessionId, player.id);
        this.lobbyNames.set(player.id, seat.name);
      } else this.botId = player.id;
      this.state.players.set(player.id, player);
    });

    this.state.votesRemaining = voteBudget(humans);
    this.beginPhase("loading", LOADING_MS);
    for (const client of this.clients) client.send("match_identity", { playerId: this.playerId(client.sessionId) });
  }

  private beginPhase(phase: Phase, durationMs: number): void {
    if (phase !== "voting") this.conversation.stop();
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
        this.game.begin(this.host, Date.now());
        this.beginPhase("minigame", this.game.durationMs);
        break;
      case "minigame": {
        this.game.end(this.host);
        this.turingDone.clear();
        const bot = this.state.players.get(this.botId);
        if (bot) bot.turingScore = Math.round(between(35, 90)); // sometimes looks more human than a human
        this.beginPhase("turing-check", TURING_MS);
        break;
      }
      case "turing-check": {
        this.votes.clear();
        const now = Date.now();
        this.bot.voteAt = now + between(5_000, VOTE_DURATION_MS * 0.6);
        this.beginPhase("voting", VOTE_DURATION_MS);
        this.conversation.start();
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

  /** Draws the next mini-game from the shuffled pool and sets everyone up for it. */
  private startRound(): void {
    this.state.round += 1;
    if (!this.pool.length) {
      const fixed = config.miniGames.filter((id) => (MINI_GAME_IDS as readonly string[]).includes(id));
      this.pool = fixed.length ? [...fixed] : shuffled(MINI_GAME_IDS);
    }
    this.state.miniGame = this.pool.shift()!;
    this.game = createMiniGame(this.state.miniGame);
    this.finishers = 0;
    this.lastMoveAt.clear();
    const lineup = this.all().filter((player) => !player.eliminated);
    for (const player of lineup) player.finished = false;
    this.game.setup(this.host, lineup);
    this.beginPhase("travel", this.game.readyMs);
  }

  private reveal(): void {
    this.conversation.stop();
    clearTimeout(this.phaseTimer);
    const bot = this.state.players.get(this.botId);
    if (bot) bot.isBot = true; // the only moment this is ever sent
    for (const player of this.all()) player.realName = this.lobbyNames.get(player.id) ?? "";
    this.state.winner = this.pendingWinner;
    this.state.phase = "reveal";
    this.state.phaseEndsAt = 0;
  }

  // ------------------------------------------------------------- mini-games

  private finish(player: PlayerState): void {
    player.finished = true;
    player.score += placementPoints(this.finishers++);
    // Everyone is across: no need to run out the clock.
    if (this.playing().every((each) => each.finished)) this.beginPhase("minigame", 2_000);
  }

  private move(client: Client, message: Record<string, unknown>): void {
    if (this.state.phase !== "minigame") return;
    const player = this.state.players.get(this.playerId(client.sessionId));
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
    if (!this.game.move(this.host, player, player.x + stepX, player.z + stepZ, now)) client.send("caught");
  }

  // ------------------------------------------------------- checks and votes

  private recordTuringResult(client: Client, message: Record<string, unknown>): void {
    if (this.state.phase !== "turing-check" || !finite(message.score) || this.turingDone.has(client.sessionId)) return;
    const player = this.state.players.get(this.playerId(client.sessionId));
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
    const player = this.state.players.get(this.playerId(client.sessionId));
    const text = message.message.trim().slice(0, 240);
    const now = Date.now();
    if (!player || player.eliminated || !text || now - (this.lastChatAt.get(player.id) ?? 0) < CHAT_GAP_MS) return;
    this.lastChatAt.set(player.id, now);
    this.say(player, text);
    const bot = this.state.players.get(this.botId);
    if (this.state.phase === "voting" && bot && !bot.eliminated) {
      this.conversation.hear({ name: player.displayName, message: text }, bot.displayName);
    }
  }

  private say(player: PlayerState, text: string): void {
    this.recentChat = [...this.recentChat, { name: player.displayName, message: text }].slice(-20);
    this.broadcast("chat", { playerId: player.id, message: text });
  }

  // -------------------------------------------------------------------- AI

  private tick(): void {
    const now = Date.now();
    if (this.state.phase === "minigame") this.game.tick(this.host, now);
    if (this.state.phase !== "voting") return;
    const bot = this.state.players.get(this.botId);
    if (!bot || bot.eliminated) return;
    this.conversation.tick(this.state.phaseEndsAt, () => this.botChatContext(bot), line => {
      if (this.state.phase === "voting" && !bot.eliminated) this.say(bot, line);
    });
    // The AI always votes, so a missing vote can't give it away.
    if (now >= this.bot.voteAt && !this.votes.has(bot.id)) {
      const humans = this.all().filter((player) => player.id !== bot.id && !player.eliminated);
      this.castVote(bot.id, humans.length ? pick(humans).id : null);
    }
  }

  private botChatContext(bot: PlayerState): BotContext {
    return {
      botName: bot.displayName,
      phase: this.state.phase,
      round: this.state.round,
      // No hidden roles, individual votes, bot schedule, or private movement data.
      visiblePlayers: this.all().map(player => ({ name: player.displayName, score: player.score, eliminated: player.eliminated })),
      recentChat: [...this.recentChat],
      accusations: this.recentChat.filter(chat => addressesBot(chat.message, bot.displayName)).map(chat => chat.message),
    };
  }
}
