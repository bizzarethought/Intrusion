import { useSyncExternalStore } from 'react';

// What the game view tells the HUD: the current objective, the Red Light Green
// Light signal and the player's own result.

export type WorldHud = {
  objective: string;
  signal: 'green' | 'red' | null;
  /** Short personal feedback, e.g. "Caught moving!" or "+72 points". */
  result: string;
  /** Pick a Side: the bank the local player is standing on ('' while on the stones). */
  side: '' | 'a' | 'b';
};

const EMPTY: WorldHud = { objective: '', signal: null, result: '', side: '' };
let current = EMPTY;
const listeners = new Set<() => void>();

export function setWorldHud(next: WorldHud) {
  if (next.objective === current.objective && next.signal === current.signal && next.result === current.result && next.side === current.side) return;
  current = next;
  listeners.forEach((listener) => listener());
}
export const clearWorldHud = () => setWorldHud(EMPTY);

export const useWorldHud = () =>
  useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => current);
