import "dotenv/config";

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: positiveInt(process.env.PORT, 2567),
  /** Optional: a fixed order of mini-games (comma-separated ids), for demos and tests. Without it they rotate, shuffled. */
  miniGames: (process.env.MINI_GAMES ?? "").split(",").map((id) => id.trim()).filter(Boolean),
  ai: {
    baseUrl: process.env.AI_BASE_URL ?? process.env.AMD_TOKENLAB_BASE_URL ?? "",
    apiKey: process.env.AI_API_KEY ?? process.env.AMD_TOKENLAB_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "",
  },
};
