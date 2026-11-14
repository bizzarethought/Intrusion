import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../protocol/roomClient';

/** The current game state. Re-renders only when something on screen changed. */
export const useGameRoom = () => useSyncExternalStore(subscribe, getSnapshot);
