import { Client, type Room } from 'colyseus.js';
import { PositionBuffer } from './interpolation';
import { mapBridge, mapLivePlayers, mapSignal, mapState } from './stateMapper';
import { BACKEND_URL, MAX_CHAT_LENGTH, ROOM_NAME, type ChatLine, type LivePlayer, type Snapshot } from './types';

// The one place that talks to Colyseus. Screens read `Snapshot` through
// useGameRoom(); the game view reads positions through live().

const EMPTY: Snapshot = {
  status: 'idle', error: '', roomId: '', selfId: '', hostId: '',
  phase: 'lobby', round: 0, miniGame: '', phaseEndsAt: 0, votesRemaining: 0, winner: '',
  prompt: '', optionA: '', optionB: '', stage: '', board: '', players: [], chat: [],
};

let room: Room | null = null;
let matchSelfId = '';
let livePlayers: LivePlayer[] = [];
const positions = new PositionBuffer();
function receiveState() {
  if (!room) return;
  // The server stamps its own time on the state as each timed phase begins.
  const clock = (room.state as { clock?: unknown }).clock;
  if (typeof clock === 'number' && clock > 0 && clock !== seenClock) { seenClock = clock; clockOffset = clock - Date.now(); }
  livePlayers = mapLivePlayers(room.state);
  positions.push(livePlayers, `${room.state.phase}:${room.state.round}`, performance.now());
  refresh();
}
let snapshot = EMPTY;
let snapshotKey = '';
let chat: ChatLine[] = [];
let chatKey = 0;
const listeners = new Set<() => void>();
/** The server's clock minus this machine's, in milliseconds. Laptop clocks can disagree by seconds. */
let clockOffset = 0;
let seenClock = 0;
/** The time on the server's clock. Phase deadlines are compared against this, so every screen counts down together. */
export const serverNow = () => Date.now() + clockOffset;
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
    selfId: state.phase === 'lobby' ? room.sessionId : matchSelfId,
    hostId: state.hostId,
    chat,
  });
}

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/not found|invalid/i.test(message)) return 'No room with that code. Check it and try again.';
  if (/already started/i.test(message)) return 'That match has already started.';
  if (/locked|full/i.test(message)) return 'That room is full.';
  if (/failed to fetch|network|ECONNREFUSED|websocket/i.test(message)) return `Can't reach the game server at ${BACKEND_URL}.`;
  return message || 'Something went wrong while connecting.';
}

export async function connect(mode: 'create' | 'join', displayName: string, code = '') {
  publish({ ...EMPTY, status: 'connecting' });
  const client = new Client(BACKEND_URL);
  let joined: Room;
  try {
    joined = mode === 'create'
      ? await client.create(ROOM_NAME, { displayName })
      : await client.joinById(code.trim().toUpperCase(), { displayName });
  } catch (error) {
    publish({ ...EMPTY, error: friendly(error) });
    return;
  }
  matchSelfId = '';
  chat = [];
  positions.reset();
  livePlayers = [];
  listen(client, joined);
}

/** Makes a joined room the current one and follows its state and messages. */
function listen(client: Client, joined: Room) {
  room = joined;
  joined.onStateChange(receiveState);
  joined.onMessage('match_identity', (message: { playerId?: unknown }) => {
    if (room !== joined || typeof message?.playerId !== 'string' || !message.playerId) return;
    matchSelfId = message.playerId;
    positions.reset();
    refresh();
  });
  joined.onMessage('chat', (message: { playerId?: unknown; message?: unknown }) => {
    if (typeof message?.playerId !== 'string' || typeof message?.message !== 'string') return;
    chat = [...chat, { key: chatKey++, playerId: message.playerId, message: message.message, round: snapshot.round }];
    refresh();
  });
  joined.onMessage('caught', () => caught());
  joined.onError((_code, message) => publish({ ...snapshot, error: message ?? 'The server reported an error.' }));
  joined.onLeave(async () => {
    if (room !== joined) return; // we left on purpose
    // A dropped connection mid-match: the server keeps our seat for 30 seconds, so try to take it back.
    for (let attempt = 0; attempt < 6 && snapshot.phase !== 'lobby' && room === joined; attempt++) {
      try {
        const back = await client.reconnect(joined.reconnectionToken);
        if (room === joined) listen(client, back);
        else back.leave();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
    if (room !== joined) return;
    room = null;
    publish({ ...snapshot, status: 'disconnected', error: 'Lost the connection to the game server.' });
  });
  receiveState();
}

export function leave() {
  const leaving = room;
  room = null;
  matchSelfId = '';
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

/** Positions and phase straight from the server state, for the game view's frame loop. */
export function live(): { players: LivePlayer[]; signal: 'green' | 'red' | null; pattern: string; broken: string; stage: string; phase: string; miniGame: string; phaseEndsAt: number; round: number; selfId: string } {
  return {
    players: room ? positions.read(livePlayers, snapshot.selfId, performance.now()) : [],
    signal: room ? mapSignal(room.state) : null,
    ...(room ? mapBridge(room.state) : { pattern: '', broken: '' }),
    stage: snapshot.stage,
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
  vote: (targetId: string | null) => room?.send('vote', { targetId }),
  chat: (message: string) => room?.send('chat', { message: message.slice(0, MAX_CHAT_LENGTH) }),
  /** Prompt Podium: the typed answer, and the answer picked as funniest. */
  answer: (text: string) => room?.send('answer', { text }),
  pick: (key: number) => room?.send('pick', { key }),
  /** Glass Bridge: hop onto a panel in the next column (column 7 is the far bank). */
  hop: (col: number, row: number) => room?.send('hop', { col, row }),
};
