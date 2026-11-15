// Everything the client assumes about the backend lives in this folder.
// If the server changes a message, phase or field, change it here.

export const ROOM_NAME = 'find_the_bot';
export const MIN_HUMANS = 3;
export const MAX_NAME_LENGTH = 24;
export const MAX_CHAT_LENGTH = 240;

export const BACKEND_URL: string =
  import.meta.env.VITE_BACKEND_URL ?? `ws://${location.hostname}:2567`;

/** Phases the client has a screen for. Anything else gets a fallback screen. */
export const PHASE_LABELS: Record<string, string> = {
  lobby: 'Lobby',
  loading: 'Loading',
  travel: 'Get ready',
  minigame: 'Mini-game',
  'turing-check': 'Turing check',
  voting: 'Vote',
  scoreboard: 'Scoreboard',
  reveal: 'Reveal',
  'game-over': 'Game over',
};

export type MiniGame = {
  name: string;
  how: string;
  reveals: string;
  /** Accent colour for the arena, sign and UI. */
  color: string;
};

export const MINI_GAMES: Record<string, MiniGame> = {
  'red-light-green-light': {
    name: 'Red Light, Green Light',
    how: 'Sprint to the finish. Move on red and you go back to the start.',
    reveals: 'Reaction timing',
    color: '#ff4d6d',
  },
  'pick-a-side': {
    name: 'Pick a Side',
    how: 'A would-you-rather. Walk to the bank you choose before time runs out.',
    reveals: 'Decisions and crowd-following',
    color: '#4dd2ff',
  },
  'prompt-podium': {
    name: 'Prompt Podium',
    how: 'Type an answer, then vote for the funniest one.',
    reveals: 'Humour and typing rhythm',
    color: '#ffd24d',
  },
  'glass-bridge-memory': {
    name: 'Glass Bridge Memory',
    how: 'Safe panels flash once. Cross from memory; a wrong panel drops you back.',
    reveals: 'Memory and accuracy',
    color: '#9b7bff',
  },
};

export const UNKNOWN_MINI_GAME: MiniGame = {
  name: 'Mystery arena',
  how: 'This mini-game is new to this version of the game.',
  reveals: 'Unknown',
  color: '#ffffff',
};

export const miniGameInfo = (id: string): MiniGame => MINI_GAMES[id] ?? UNKNOWN_MINI_GAME;

export type Player = {
  id: string;
  name: string;
  /** Original lobby name, only available after the final reveal. */
  realName?: string;
  score: number;
  /** 0-100, higher looks more human. A clue, not a verdict. */
  turingScore: number;
  connected: boolean;
  eliminated: boolean;
  /** Has crossed the finish line in the current mini-game. */
  finished: boolean;
  /** Only filled in once the server reaches the reveal. Never before. */
  isBot?: boolean;
};

export type ChatLine = { key: number; playerId: string; message: string; round: number };

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** What the screens render from. Positions are left out so movement does not re-render the UI. */
export type Snapshot = {
  status: ConnectionStatus;
  error: string;
  roomId: string;
  selfId: string;
  hostId: string;
  phase: string;
  round: number;
  miniGame: string;
  phaseEndsAt: number;
  /** Vote-outs left in the match. */
  votesRemaining: number;
  /** '' while the match is on, then 'humans' or 'ai'. */
  winner: string;
  // Mini-game state; each game fills in what it uses.
  /** The question (Pick a Side, Prompt Podium). */
  prompt: string;
  optionA: string;
  optionB: string;
  /** 'choose'/'result' (Pick a Side) or 'answer'/'vote'/'results' (Prompt Podium). */
  stage: string;
  /** JSON lists from the server: Podium answers and results, Pick a Side counts. */
  board: string;
  players: Player[];
  chat: ChatLine[];
};

/** Live values the 3D world reads every frame. */
export type LivePlayer = { id: string; name: string; x: number; z: number; eliminated: boolean; finished: boolean };
