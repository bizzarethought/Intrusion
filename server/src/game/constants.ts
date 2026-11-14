export const MIN_HUMANS = 3;
export const MAX_HUMANS = 10;

// How long each phase lasts.
export const LOADING_MS = 11_000; // the loading video plays on every client
export const GET_READY_MS = 4_000; // everyone is placed on the start line
export const ROUND_DURATION_MS = 60_000; // a mini-game; ends early once everyone has finished
export const TURING_MS = 6_000;
export const VOTE_DURATION_MS = 45_000; // ends early once everyone has voted
export const SCOREBOARD_MS = 6_000;

/**
 * Mini-games the server can run, played in this order and repeated if a match
 * has more rounds than games. Add a game here once its rules exist in room.ts
 * and the client can draw it. Planned next: glass-bridge-memory, prompt-podium,
 * pick-a-side.
 */
export const MINI_GAMES = ["red-light-green-light"] as const;

export type MiniGameId = (typeof MINI_GAMES)[number];
export type Phase =
  | "lobby"
  | "loading"
  | "travel"
  | "minigame"
  | "turing-check"
  | "voting"
  | "scoreboard"
  | "reveal";
