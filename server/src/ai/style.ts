// How the AI player is made to write like the people around it, in chat and in typed answers.
// A language model leans tidy, polite and fast; real players are none of those.

/** How long a line takes to type at 70 words a minute, give or take 5 (a word is five characters). */
export const typingMs = (line: string, random: () => number = Math.random): number => (line.length * 12_000) / (65 + random() * 10);

/** What a model says when it steps out of the game. Showing it would give the AI away. */
export const breaksCharacter = (line: string): boolean =>
  /\b(as an ai|i(?:'| a)?m an ai|language model|ai assistant|i can(?:'|no)?t (?:help|assist|comply)|i(?:'| a)?m (?:sorry, but|unable to))\b/i.test(line);

/** Brings a line down to the room's level. `others` is what the humans around it wrote. */
export function matchStyle(line: string, others: string[]): string {
  // Nobody here starts with a capital or ends with a full stop unless the humans do.
  if (!others.some((text) => /^[A-Z][a-z]/.test(text))) line = line.toLowerCase();
  if (!others.some((text) => /[a-z]\.$/i.test(text))) line = line.replace(/\.+$/, "");
  return line;
}
