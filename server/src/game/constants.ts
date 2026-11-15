export const MIN_HUMANS = 3;
export const MAX_HUMANS = 10;

// How long each phase lasts.
export const LOADING_MS = 11_000; // the loading video plays on every client
export const TURING_MS = 6_000;
export const VOTE_DURATION_MS = 45_000; // ends early once everyone has voted
export const SCOREBOARD_MS = 6_000;

export type Phase =
  | "lobby"
  | "loading"
  | "travel"
  | "minigame"
  | "turing-check"
  | "voting"
  | "scoreboard"
  | "reveal";
