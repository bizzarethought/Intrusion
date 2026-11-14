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
};

const EMPTY: WorldHud = { objective: '', distance: 0, bearing: null, signal: null, result: '', scored: false };
let current = EMPTY;
let currentKey = JSON.stringify(EMPTY);
const listeners = new Set<() => void>();

export function setWorldHud(next: WorldHud) {
  const key = JSON.stringify(next);
  if (key === currentKey) return;
  currentKey = key;
  current = next;
  listeners.forEach((listener) => listener());
}
export const clearWorldHud = () => setWorldHud(EMPTY);

export const useWorldHud = () =>
  useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => current);
