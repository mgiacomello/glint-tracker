import OpenAI from "openai";

/** Groq client (OpenAI-compatible API, free tier). Server-only. */
let _client: OpenAI | null = null;

export function getAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return _client;
}

export const hasAIEnv = Boolean(process.env.GROQ_API_KEY);

/** Groq-hosted Llama 3.3 70B — strong at Italian + instruction following (text-only). */
export const MODEL = "llama-3.3-70b-versatile";
