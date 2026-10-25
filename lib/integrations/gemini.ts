import { z } from "zod";
import type { IntegrationEnv } from "./config.ts";
import { providerJson, type ProviderOptions } from "./http.ts";

export const GEMINI_MODEL = "gemini-2.5-flash-lite";
export const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
export const STANDARD_CONFIRMATION =
  "Your Sunroom session is reserved. We look forward to welcoming you!";
export type Confirmation = { message: string; source: "gemini" | "fallback" };
export interface StudioAi {
  confirmation(): Promise<Confirmation>;
}
const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string(),
        content: z.object({
          parts: z.array(
            z.object({
              text: z.string().optional(),
              thought: z.boolean().optional(),
            }),
          ),
        }),
      }),
    )
    .min(1),
});

export function createAi(
  env: IntegrationEnv,
  options: ProviderOptions = {},
): StudioAi {
  return {
    async confirmation() {
      const fallback: Confirmation = {
        message: STANDARD_CONFIRMATION,
        source: "fallback",
      };
      if (!env.GEMINI_API_KEY?.trim()) return fallback;
      try {
        // Fixed prompt: guest names, emails and calendar event details never reach Gemini.
        const response = responseSchema.parse(
          await providerJson(
            options.fetch ?? fetch,
            GEMINI_URL,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": env.GEMINI_API_KEY.trim(),
              },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [
                    {
                      text: "Write one warm booking confirmation for Sunroom, a tanning studio. Use at most two short sentences and 40 words. Say the session is reserved and welcome the guest. Do not invent names, dates, prices, offers, health claims or policies. Plain text only.",
                    },
                  ],
                },
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: "The guest has successfully reserved a studio session. Write their friendly confirmation note.",
                      },
                    ],
                  },
                ],
                generationConfig: { temperature: 0.5, maxOutputTokens: 120 },
              }),
            },
            options.timeoutMs ?? 4000,
          ),
        );
        const candidate = response.candidates[0];
        const message = candidate.content.parts
          .filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (
          candidate.finishReason !== "STOP" ||
          message.length < 10 ||
          message.length > 400 ||
          /https?:\/\/|<[^>]+>/.test(message)
        )
          return fallback;
        return { message, source: "gemini" };
      } catch {
        return fallback;
      }
    },
  };
}
