import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Tend reasons with Claude, reached either directly (ANTHROPIC_API_KEY) or
 * through OpenRouter (OPENROUTER_API_KEY). If both are set, Anthropic wins.
 */
export function aiProvider(): "anthropic" | "openrouter" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return null;
}

export function aiConfigured(): boolean {
  return aiProvider() !== null;
}

/** The model id in the chosen provider's own naming. Override with TEND_MODEL. */
export function modelId(): string {
  if (process.env.TEND_MODEL) return process.env.TEND_MODEL;
  return aiProvider() === "openrouter" ? "anthropic/claude-sonnet-5.5" : "claude-sonnet-5-5";
}

/** The model Tend reasons with. */
export function model() {
  if (aiProvider() === "openrouter") {
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
      appName: "Tend",
      appUrl: process.env.APP_URL || "http://localhost:3000",
    });
    return openrouter(modelId());
  }
  return anthropic(modelId());
}
