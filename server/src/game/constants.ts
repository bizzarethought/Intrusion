export const MIN_HUMANS = 3;
export const MAX_HUMANS = 10;
export const MAX_ROUNDS = 4;
export const ROUND_DURATION_MS = 90_000;
export const VOTE_DURATION_MS = 45_000;

export const MINI_GAMES = [
  "red-light-green-light",
  "pick-a-side",
  "prompt-podium",
  "glass-bridge-memory",
  "tile-drop",
] as const;

export type MiniGameId = (typeof MINI_GAMES)[number];
export type Phase =
  | "lobby"
  | "travel"
  | "minigame"
  | "turing-check"
  | "voting"
  | "scoreboard"
  | "reveal"
  | "game-over";
