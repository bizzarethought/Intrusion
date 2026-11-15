import type { LivePlayer, Player } from './types';

// The server state arrives untyped, and the backend is still changing, so
// every field is read defensively with a fallback.

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw => (typeof value === 'object' && value !== null ? (value as Raw) : {});
const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const bool = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback);

/** The bot's identity may only be shown once the server says the match is over. */
export const isRevealPhase = (phase: string) => phase === 'reveal';

function eachPlayer(state: unknown, visit: (id: string, player: Raw) => void) {
  const players = asRecord(state).players as { forEach?: (fn: (value: unknown, key: string) => void) => void } | undefined;
  if (typeof players?.forEach !== 'function') return; // no players yet
  players.forEach((value, key) => visit(key, asRecord(value)));
}

export function mapState(state: unknown) {
  const raw = asRecord(state);
  const phase = str(raw.phase, 'lobby');
  const players: Player[] = [];
  eachPlayer(state, (id, p) => {
    players.push({
      id,
      name: str(p.displayName, 'Player'),
      realName: isRevealPhase(phase) ? str(p.realName) || undefined : undefined,
      score: num(p.score),
      connected: bool(p.connected, true),
      eliminated: bool(p.eliminated),
      finished: bool(p.finished),
      // Dropped here, at the edge, so no screen can leak it early.
      isBot: isRevealPhase(phase) ? bool(p.isBot) : undefined,
    });
  });
  // Public ids and server insertion order are shuffled at match start. Keep the UI stable.
  players.sort((a, b) => a.id.localeCompare(b.id));
  return {
    hostId: str(raw.hostId),
    phase,
    round: num(raw.round),
    miniGame: str(raw.miniGame),
    phaseEndsAt: num(raw.phaseEndsAt),
    votesRemaining: num(raw.votesRemaining),
    winner: str(raw.winner),
    prompt: str(raw.prompt),
    optionA: str(raw.optionA),
    optionB: str(raw.optionB),
    stage: str(raw.stage),
    board: str(raw.board),
    players,
  };
}

/** The Red Light, Green Light signal: 'green', 'red', or null. */
export const mapSignal = (state: unknown) => {
  const signal = asRecord(state).signal;
  return signal === 'green' || signal === 'red' ? signal : null;
};

/** What the game view needs for Glass Bridge: the lit panels (while memorising) and the broken ones. */
export const mapBridge = (state: unknown) => {
  const raw = asRecord(state);
  return { pattern: str(raw.pattern), broken: str(raw.broken) };
};

export function mapLivePlayers(state: unknown): LivePlayer[] {
  const players: LivePlayer[] = [];
  eachPlayer(state, (id, p) => {
    players.push({ id, name: str(p.displayName, 'Player'), x: num(p.x), z: num(p.z), eliminated: bool(p.eliminated), finished: bool(p.finished) });
  });
  return players.sort((a, b) => a.id.localeCompare(b.id));
}
