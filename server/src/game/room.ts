import { Client, Room } from "colyseus";
import { BotController } from "./bot.js";
import {
  MAX_HUMANS,
  MAX_ROUNDS,
  MINI_GAMES,
  MIN_HUMANS,
  ROUND_DURATION_MS,
  VOTE_DURATION_MS,
  type MiniGameId,
  type Phase,
} from "./constants.js";
import { GameState, PlayerState } from "./schema.js";
import { AiClient } from "../ai/client.js";

type VoteMessage = { targetId: string | null };
type MoveMessage = { x: number; z: number };
type ScoreMessage = { score: number };
type TuringMessage = { score: number };
type ChatMessage = { message: string };

export class FindTheBotRoom extends Room<GameState> {
  maxClients = MAX_HUMANS;
  state = new GameState();

  private readonly votes = new Map<string, string | null>();
  private readonly aiClient = new AiClient();
  private bot?: BotController;
  private botChatRound = -1;
  private phaseTimer?: ReturnType<typeof setTimeout>;
  private tickTimer?: ReturnType<typeof setInterval>;

  onCreate(): void {
    this.setPatchRate(50);
    this.onMessage("start_match", (client) => this.startMatch(client));
    this.onMessage("move", (client, message: MoveMessage) => this.move(client, message));
    this.onMessage("score", (client, message: ScoreMessage) => this.recordScore(client, message));
    this.onMessage("turing_result", (client, message: TuringMessage) => this.recordTuringResult(client, message));
    this.onMessage("vote", (client, message: VoteMessage) => this.castVote(client.sessionId, message.targetId));
    this.onMessage("chat", (client, message: ChatMessage) => this.chat(client, message));
    this.tickTimer = setInterval(() => this.tick(), 100);
  }

  onJoin(client: Client, options: { displayName?: string }): void {
    if (this.state.phase !== "lobby") throw new Error("Match already started");
    const player = new PlayerState();
    player.id = client.sessionId;
    player.displayName = this.sanitizeName(options.displayName ?? `Player ${this.clients.length}`);
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
  }

  onDispose(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
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
    this.state.votesRemaining = Math.max(0, this.state.votesRemaining - 1);
    if (this.votes.size >= this.activePlayerCount()) this.resolveVote();
  }

  private startMatch(client: Client): void {
    if (client.sessionId !== this.clients[0]?.sessionId) return;
    if (this.activePlayerCount() < MIN_HUMANS) return;
    const botId = `bot-${this.roomId}`;
    const bot = new PlayerState();
    bot.id = botId;
    bot.displayName = "Alex";
    bot.isBot = true;
    this.state.players.set(botId, bot);
    this.bot = new BotController(this, botId);
    this.state.round = 1;
    this.state.miniGame = MINI_GAMES[0];
    this.beginPhase("travel", 1_000);
  }

  private move(client: Client, message: MoveMessage): void {
    if (this.state.phase !== "travel" && this.state.phase !== "minigame") return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.eliminated || !this.validCoordinate(message.x) || !this.validCoordinate(message.z)) return;
    const maxDelta = 2;
    player.x = Math.max(player.x - maxDelta, Math.min(player.x + maxDelta, message.x));
    player.z = Math.max(player.z - maxDelta, Math.min(player.z + maxDelta, message.z));
  }

  private recordScore(client: Client, message: ScoreMessage): void {
    if (this.state.phase !== "minigame" || !Number.isFinite(message.score)) return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.eliminated) return;
    player.score += Math.max(0, Math.min(100, Math.floor(message.score)));
  }

  private recordTuringResult(client: Client, message: TuringMessage): void {
    if (this.state.phase !== "turing-check" || !Number.isFinite(message.score)) return;
    const player = this.state.players.get(client.sessionId);
    if (!player || player.eliminated) return;
    player.turingScore = Math.max(0, Math.min(100, Math.floor(message.score)));
  }

  private chat(client: Client, message: ChatMessage): void {
    if (this.state.phase !== "voting" || typeof message.message !== "string") return;
    const text = message.message.trim().slice(0, 240);
    if (!text) return;
    this.broadcast("chat", { playerId: client.sessionId, message: text });
  }

  private beginPhase(phase: Phase, durationMs: number): void {
    this.state.phase = phase;
    this.state.phaseEndsAt = Date.now() + durationMs;
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => this.advancePhase(), durationMs);
  }

  private advancePhase(): void {
    switch (this.state.phase) {
      case "travel":
        this.beginPhase("minigame", ROUND_DURATION_MS);
        break;
      case "minigame":
        this.beginPhase("turing-check", 5_000);
        break;
      case "turing-check":
        this.votes.clear();
        this.state.votesRemaining = this.voteBudget();
        this.beginPhase("voting", VOTE_DURATION_MS);
        break;
      case "voting":
        this.resolveVote();
        break;
      case "scoreboard":
        if (this.state.round >= MAX_ROUNDS || this.activePlayerCount() <= 1) {
          this.beginPhase("reveal", 5_000);
        } else {
          this.state.round += 1;
          this.state.miniGame = MINI_GAMES[(this.state.round - 1) % MINI_GAMES.length];
          this.beginPhase("travel", 1_000);
        }
        break;
      case "reveal":
        this.beginPhase("game-over", 0);
        break;
      default:
        break;
    }
  }

  private resolveVote(): void {
    if (this.state.phase !== "voting") return;
    const counts = new Map<string, number>();
    for (const targetId of this.votes.values()) {
      if (targetId) counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
    const eliminatedId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (eliminatedId) {
      const eliminated = this.state.players.get(eliminatedId);
      if (eliminated) eliminated.eliminated = true;
    }
    this.beginPhase("scoreboard", 3_000);
  }

  private tick(): void {
    this.bot?.tick(100);
    if (this.state.phase === "turing-check" && this.bot) {
      const botPlayer = this.state.players.get(this.bot.id);
      if (botPlayer) botPlayer.turingScore = 35 + Math.floor(Math.random() * 55);
    }
    if (this.state.phase === "voting" && this.bot && !this.votes.has(this.bot.id)) {
      this.bot.vote(this.chooseBotVote());
    }
    if (this.state.phase === "voting" && this.bot && this.botChatRound !== this.state.round) {
      this.botChatRound = this.state.round;
      void this.botChat().catch((error: unknown) => {
        console.error("Bot chat failed", error);
        this.broadcast("chat", {
          playerId: this.bot?.id,
          message: "I do not know, everyone is looking suspicious.",
        });
      });
    }
  }

  private chooseBotVote(): string | null {
    const candidates = [...this.state.players.values()].filter((player) => !player.eliminated && !player.isBot);
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].id : null;
  }

  private activePlayerCount(): number {
    return [...this.state.players.values()].filter((player) => !player.eliminated).length;
  }

  private voteBudget(): number {
    return Math.max(2, Math.ceil(Math.log2(Math.max(2, this.clients.length))));
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^\w -]/g, "").trim().slice(0, 24) || "Player";
  }

  private validCoordinate(value: number): boolean {
    return Number.isFinite(value) && Math.abs(value) <= 100;
  }

  private async botChat(): Promise<void> {
    if (!this.bot) return;
    const message = await this.aiClient.respond({
      botName: this.state.players.get(this.bot.id)?.displayName ?? "Alex",
      phase: this.state.phase,
      round: this.state.round,
      visiblePlayers: [...this.state.players.values()].map((player) => ({
        name: player.displayName,
        score: player.score,
        eliminated: player.eliminated,
      })),
      recentChat: [],
      accusations: [],
    });
    this.broadcast("chat", { playerId: this.bot.id, message });
  }
}
