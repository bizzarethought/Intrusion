import { Client, type Room } from 'colyseus.js';
import { PositionBuffer } from './interpolation';
import { mapLivePlayers, mapSignal, mapState } from './stateMapper';
import { BACKEND_URL, MAX_CHAT_LENGTH, ROOM_NAME, type ChatLine, type LivePlayer, type Snapshot } from './types';

// The one place that talks to Colyseus. Screens read `Snapshot` through
// useGameRoom(); the 3D world reads positions through live().

const EMPTY: Snapshot = {
  status: 'idle', error: '', roomId: '', selfId: '', hostId: '',
  phase: 'lobby', round: 0, miniGame: '', phaseEndsAt: 0, votesRemaining: 0, winner: '', players: [], chat: [],
};

let room: Room | null = null;
let livePlayers: LivePlayer[] = [];
const positions = new PositionBuffer();
function receiveState() {
  if (!room) return;
  livePlayers = mapLivePlayers(room.state);
  positions.push(livePlayers, `${room.state.phase}:${room.state.round}`, performance.now());
  refresh();
}
let snapshot = EMPTY;
let snapshotKey = '';
let chat: ChatLine[] = [];
let chatKey = 0;
const listeners = new Set<() => void>();
let caught = () => {};
/** Called when the server sends the local player back to the start line. */
export const onCaught = (handler: () => void) => { caught = handler; };

function publish(next: Snapshot) {
  // Positions change many times a second; only tell the UI when something it shows changed.
  const key = JSON.stringify(next);
  if (key === snapshotKey) return;
  snapshotKey = key;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function refresh() {
  if (!room) return;
  const state = mapState(room.state);
  publish({
    ...state,
    status: 'connected',
    error: '',
    roomId: room.roomId,
    selfId: room.sessionId,
    hostId: state.hostId,
    chat,
  });
}

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/not found|invalid/i.test(message)) return 'No room with that code. Check it and try again.';
  if (/already started/i.test(message)) return 'That match has already started.';
  if (/locked|full/i.test(message)) return 'That room is full.';
  if (/failed to fetch|network|ECONNREFUSED|ws/i.test(message)) return `Can't reach the game server at ${BACKEND_URL}.`;
  return message || 'Something went wrong while connecting.';
}

export async function connect(mode: 'create' | 'join', displayName: string, code = '') {
  publish({ ...EMPTY, status: 'connecting' });
  let joined: Room;
  try {
    const client = new Client(BACKEND_URL);
    joined = mode === 'create'
      ? await client.create(ROOM_NAME, { displayName })
      : await client.joinById(code.trim(), { displayName });
  } catch (error) {
    publish({ ...EMPTY, error: friendly(error) });
    return;
  }
  room = joined;
  chat = [];
  positions.reset();
  livePlayers = [];
  joined.onStateChange(receiveState);
  joined.onMessage('chat', (message: { playerId?: unknown; message?: unknown }) => {
    if (typeof message?.playerId !== 'string' || typeof message?.message !== 'string') return;
    chat = [...chat, { key: chatKey++, playerId: message.playerId, message: message.message, round: snapshot.round }];
    refresh();
  });
  joined.onMessage('caught', () => caught());
  joined.onError((_code, message) => publish({ ...snapshot, error: message ?? 'The server reported an error.' }));
  joined.onLeave(() => {
    if (room !== joined) return; // we left on purpose
    room = null;
    publish({ ...snapshot, status: 'disconnected', error: 'Lost the connection to the game server.' });
  });
  receiveState();
}

export function leave() {
  const leaving = room;
  room = null;
  livePlayers = [];
  positions.reset();
  leaving?.leave();
  publish(EMPTY);
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getSnapshot = () => snapshot;

/** Positions and phase straight from the server state, for the 3D world's frame loop. */
export function live(): { players: LivePlayer[]; signal: 'green' | 'red' | null; phase: string; miniGame: string; phaseEndsAt: number; round: number; selfId: string } {
  return {
    players: room ? positions.read(livePlayers, snapshot.selfId, performance.now()) : [],
    signal: room ? mapSignal(room.state) : null,
    phase: snapshot.phase,
    miniGame: snapshot.miniGame,
    phaseEndsAt: snapshot.phaseEndsAt,
    round: snapshot.round,
    selfId: snapshot.selfId,
  };
}

// Messages the server accepts today. Do not add new ones without the backend.
export const send = {
  startMatch: () => room?.send('start_match'),
  move: (x: number, z: number) => room?.send('move', { x, z }),
  turingResult: (score: number) => room?.send('turing_result', { score }),
  vote: (targetId: string | null) => room?.send('vote', { targetId }),
  chat: (message: string) => room?.send('chat', { message: message.slice(0, MAX_CHAT_LENGTH) }),
};
