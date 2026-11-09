import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { configuredOrigin } from "../origin";

/**
 * Tend's AI model, reached directly (ANTHROPIC_API_KEY) or through OpenRouter
 * (OPENROUTER_API_KEY, any model it offers). If both are set, Anthropic wins.
 * Defaults to Claude Sonnet 5.5; TEND_MODEL picks another.
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
      appUrl: configuredOrigin() || "http://localhost:3000",
    });
    return openrouter(modelId());
  }
  return anthropic(modelId());
}
