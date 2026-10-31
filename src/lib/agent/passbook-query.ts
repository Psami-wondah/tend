import { generateObject } from "ai";
import { aiConfigured, model } from "./model";
import { PassbookQuerySchema, parsePassbookQuestion, type PassbookQuery } from "../passbook-filter";

/** Server side: Claude when configured, the keyword parser in demo mode. */
export async function interpretPassbookQuestion(question: string, people: string[], today = new Date()): Promise<PassbookQuery & { viaAi: boolean }> {
  if (aiConfigured()) {
    const { object } = await generateObject({
      model: model(),
      schema: PassbookQuerySchema,
      system: `You turn a question about a family care pot's passbook into a filter. Today is ${today.toISOString().slice(0, 10)}. Family members: ${people.join(", ")}. Leave fields empty or null unless the question asks for them.`,
      prompt: question.slice(0, 300),
    });
    return { ...object, viaAi: true };
  }
  return { ...parsePassbookQuestion(question, people, today), viaAi: false };
}
