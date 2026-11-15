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
  voting: 'Vote',
  scoreboard: 'Scoreboard',
  reveal: 'Reveal',
};

export type MiniGame = {
  name: string;
  /** The rules, in a sentence or two. */
  how: string;
  /** How you play it with your hands. Shown on the get-ready card. */
  controls: string;
  /** Set where the controls are not what a player would guess, so the card shouts them. */
  loud?: boolean;
};

export const MINI_GAMES: Record<string, MiniGame> = {
  'red-light-green-light': {
    name: 'Red Light, Green Light',
    how: 'Run from the left row of roses to the right one. Move while the big rose is watching and you go back to the start.',
    controls: 'Move with W A S D or the arrow keys, or click where you want to go.',
  },
  'pick-a-side': {
    name: 'Pick a Side',
    how: 'A would-you-rather. Be standing on the bank of your answer when time runs out. The bigger crowd scores most.',
    controls: 'Hop the stones with W A S D or the arrow keys, or click where you want to go.',
  },
  'prompt-podium': {
    name: 'Prompt Podium',
    how: 'Everyone answers the same prompt. Then you vote for the funniest answer that is not yours.',
    controls: 'Type your answer in the box and press Enter.',
  },
  'glass-bridge-memory': {
    name: 'Glass Bridge Memory',
    how: 'The safe panels light up once. Memorise them, then cross from memory. A wrong panel drops you back on the bank.',
    controls: 'CLICK a panel to hop onto it. You cannot walk on the bridge.',
    loud: true,
  },
};

export const UNKNOWN_MINI_GAME: MiniGame = {
  name: 'Mystery arena',
  how: 'This mini-game is new to this version of the game.',
  controls: 'Reload the page to get the latest version.',
};

export const miniGameInfo = (id: string): MiniGame => MINI_GAMES[id] ?? UNKNOWN_MINI_GAME;

export type Player = {
  id: string;
  name: string;
  /** Original lobby name, only available after the final reveal. */
  realName?: string;
  score: number;
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

/** Live values the game view reads every frame. */
export type LivePlayer = { id: string; name: string; x: number; z: number; eliminated: boolean; finished: boolean };
