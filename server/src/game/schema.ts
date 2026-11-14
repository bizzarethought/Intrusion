import { MapSchema, Schema, type } from "@colyseus/schema";
import type { Phase } from "./constants.js";

// Everything here is sent to every client, so nothing secret may live here.
// Which player is the AI stays inside the room until the reveal.

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") displayName = "";
  /** Position in metres from the middle of the level: x across, z toward the camera. */
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") score = 0;
  /** 0-100, higher looks more human. A clue for the sus meter, not a verdict. */
  @type("number") turingScore = 0;
  @type("boolean") connected = true;
  @type("boolean") eliminated = false;
  /** Has crossed the finish line in the current mini-game. */
  @type("boolean") finished = false;
  /** False for everyone until the reveal, then true for the AI. */
  @type("boolean") isBot = false;
}

export class GameState extends Schema {
  @type("string") phase: Phase = "lobby";
  @type("number") round = 0;
  @type("string") miniGame = "";
  @type("number") phaseEndsAt = 0;
  /** Vote-outs left in the match. The AI wins if it survives them all. */
  @type("number") votesRemaining = 0;
  /** Red Light, Green Light: "green", "red", or "" when no light is showing. */
  @type("string") signal = "";
  /** "" while the match is on, then "humans" or "ai". */
  @type("string") winner = "";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
