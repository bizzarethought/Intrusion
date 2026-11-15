import { randomInt } from "node:crypto";

const ALIASES = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Jamie", "Taylor", "Quinn", "Avery", "Robin", "Drew", "Skyler", "Cameron", "Reese", "Rowan", "Parker", "Finley", "Sage", "Emerson", "Blair", "Dakota", "Elliot", "Harper", "Jules", "Kendall", "Logan", "Marley", "Remy", "Shiloh", "Toby", "Wren"];

export function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Exclude lobby names so nobody accidentally keeps a recognizable identity. */
export function matchAliases(lobbyNames: string[], count: number): string[] {
  const taken = new Set(lobbyNames.map(name => name.toLowerCase()));
  const aliases = shuffled(ALIASES.filter(name => !taken.has(name.toLowerCase())));
  if (aliases.length < count) throw new Error("Not enough anonymous match aliases");
  return aliases.slice(0, count);
}
