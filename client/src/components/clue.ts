import type { Player } from '../protocol/types';

/**
 * The sus meter in words. It reads the Turing score upside down and is a clue,
 * never proof: it flags humans sometimes and misses the AI sometimes.
 */
export function clueFor(player: Player): { id: 'fine' | 'hmm' | 'odd'; label: string } {
  const sus = 100 - Math.max(0, Math.min(100, player.turingScore));
  return sus > 66 ? { id: 'odd', label: 'acting odd' } : sus > 40 ? { id: 'hmm', label: 'a little off' } : { id: 'fine', label: 'seems fine' };
}
