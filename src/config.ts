import "dotenv/config";

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: positiveInt(process.env.PORT, 2567),
  ai: {
    baseUrl: process.env.AI_BASE_URL ?? process.env.AMD_TOKENLAB_BASE_URL ?? "",
    apiKey: process.env.AI_API_KEY ?? process.env.AMD_TOKENLAB_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "",
  },
};
