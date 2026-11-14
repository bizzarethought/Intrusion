// The rules that can be written as plain functions, so they can be tested
// without a running room. See docs/decisions.md for the reasoning.

/** Vote-outs per match: log base 2 of the number of humans, rounded up, at least 2. */
export function voteBudget(humans: number): number {
  return Math.max(2, Math.ceil(Math.log2(Math.max(1, humans))));
}

/**
 * Who a vote removes: the player with the most votes. Nobody is removed on a
 * tie for first, or when every vote was a skip (null).
 */
export function votedOut(votes: Iterable<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const target of votes) if (target) counts.set(target, (counts.get(target) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) return null;
  return ranked[0][0];
}

/** Points for finishing a mini-game in a given place (0 = first). */
export function placementPoints(place: number): number {
  return [100, 80, 65, 50, 40, 30, 20][place] ?? 10;
}

/** Red Light, Green Light field, in metres. Mirrors RLGL in client/src/game/levels.ts (pixels there). */
export const RLGL_FIELD = {
  spawnX: -3.0, // where players line up, behind the left roses
  startX: -2.74, // the rose watches from here...
  finishX: 2.43, // ...to here
  laneTop: -0.35,
  laneBottom: 2.05,
  // Nobody can leave the picture.
  minX: -3.55,
  maxX: 3.55,
  minZ: -1.4,
  maxZ: 2.4,
};
