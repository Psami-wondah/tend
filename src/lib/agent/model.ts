import { anthropic } from "@ai-sdk/anthropic";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** The model Tend reasons with. Override with TEND_MODEL. */
export function model() {
  return anthropic(process.env.TEND_MODEL || "claude-sonnet-5-5");
}
