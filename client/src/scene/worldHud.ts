import { useSyncExternalStore } from 'react';

// What the 3D world tells the HUD: the current objective, where the arena is,
// the Red Light Green Light signal and the player's own result.

export type WorldHud = {
  objective: string;
  /** Metres to the current arena. */
  distance: number;
  /** Screen direction to the arena in radians (0 = up, clockwise), or null when there. */
  bearing: number | null;
  signal: 'green' | 'red' | null;
  /** Short personal feedback, e.g. "Caught moving!" or "+72 points". */
  result: string;
  scored: boolean;
  /** Pick a Side: the bank the local player is standing on ('' while on the stones). */
  side: '' | 'a' | 'b';
};

const EMPTY: WorldHud = { objective: '', distance: 0, bearing: null, signal: null, result: '', scored: false, side: '' };
let current = EMPTY;
const listeners = new Set<() => void>();

export function setWorldHud(next: WorldHud) {
  if (next.objective === current.objective && next.distance === current.distance && next.bearing === current.bearing && next.signal === current.signal && next.result === current.result && next.scored === current.scored && next.side === current.side) return;
  current = next;
  listeners.forEach((listener) => listener());
}
export const clearWorldHud = () => setWorldHud(EMPTY);

export const useWorldHud = () =>
  useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => current);
