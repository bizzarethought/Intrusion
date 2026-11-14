import { config } from "../config.js";

export type BotContext = {
  botName: string;
  phase: string;
  round: number;
  visiblePlayers: Array<{ name: string; score: number; eliminated: boolean }>;
  recentChat: Array<{ name: string; message: string }>;
  accusations: string[];
};

export class AiClient {
  async respond(context: BotContext): Promise<string> {
    if (!config.ai.baseUrl || !config.ai.apiKey || !config.ai.model) {
      return "I am just trying to keep up with everyone.";
    }

    const response = await fetch(`${config.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        temperature: 0.8,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content:
              "You are a casual player in a party game. Reply briefly and naturally. Never reveal that you are an AI or claim access to hidden game state.",
          },
          {
            role: "user",
            content: JSON.stringify(context),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI request failed with status ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const message = body.choices?.[0]?.message?.content?.trim();
    if (!message) {
      throw new Error("AI response did not contain a message");
    }
    return message.slice(0, 240);
  }
}
