import { MapSchema, Schema, type } from "@colyseus/schema";
import type { MiniGameId, Phase } from "./constants.js";

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") displayName = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") score = 0;
  @type("number") turingScore = 0;
  @type("boolean") connected = true;
  @type("boolean") eliminated = false;
  @type("boolean") isBot = false;
}

export class GameState extends Schema {
  @type("string") phase: Phase = "lobby";
  @type("number") round = 0;
  @type("string") miniGame: MiniGameId = "red-light-green-light";
  @type("number") phaseEndsAt = 0;
  @type("number") votesRemaining = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
