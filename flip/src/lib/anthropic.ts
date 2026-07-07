import Anthropic from "@anthropic-ai/sdk";

/** Lazily-constructed Anthropic client (server-only). */
let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export const hasAnthropicEnv = Boolean(process.env.ANTHROPIC_API_KEY);

/** Model tiers — keep cost low: heavy reasoning on Sonnet, light tasks on Haiku. */
export const MODELS = {
  /** Main document analysis (quality/cost balance). */
  analysis: "claude-sonnet-5",
  /** Deepest reasoning when explicitly needed. */
  deep: "claude-opus-4-8",
  /** Light/cheap tasks: deadlines, titles, comparisons. */
  light: "claude-haiku-4-5-20251001",
} as const;
