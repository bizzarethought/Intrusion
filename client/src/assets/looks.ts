import { VARIANTS, type VariantId } from './manifest';

// Client-side appearances: every player sees a different look for everyone
// (design decision 6), so "I'm the green one" means nothing across the room.
// The mapping is shuffled by this client's own session id and stays fixed all match.

let deck: VariantId[] = [];
let deckOwner = '';
const seen: string[] = [];

function shuffled(seedText: string): VariantId[] {
  let seed = 7;
  for (const char of seedText) seed = (seed * 31 + char.charCodeAt(0)) % 2147483647;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const list = VARIANTS.map((v) => v.id);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** The sprite/robot variant this client shows for a player. */
export function variantFor(playerId: string, selfId: string): VariantId {
  if (deckOwner !== selfId) {
    deck = shuffled(selfId);
    deckOwner = selfId;
    seen.length = 0;
  }
  let index = seen.indexOf(playerId);
  if (index < 0) index = seen.push(playerId) - 1;
  return deck[index % deck.length];
}
