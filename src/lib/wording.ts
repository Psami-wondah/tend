/**
 * What Tend writes when it reads a request (the summary, why it looks like a
 * scam) is meant for both the person and their circle, so the AI is told to
 * leave out "you" and "your". This is the safety net for the circle's screens
 * and alerts when it slips, or for older payments: "your grandson" becomes
 * "Walter's grandson" and "asking you for $650" becomes "asking Walter for $650".
 * A "you" that's the subject of a sentence is left alone, since swapping in a
 * name there would break the grammar ("Walter owe").
 */

const OBJECT_YOU =
  /\b(ask|asks|asked|asking|bill|bills|billed|billing|call|calls|called|calling|charge|charges|charged|charging|email|emails|emailed|emailing|pressure|pressures|pressured|pressuring|rush|rushes|rushed|rushing|send|sends|sent|sending|tell|tells|told|telling|text|texts|texted|texting|threaten|threatens|threatened|threatening|warn|warns|warned|warning|to|for|with|from|at|about|on|of)\s+you\b(?!'| are| were| have| had| will| would| can| could| should| must| do| did| owe| need| want)/gi;

export function forCircle(text: string, person: string): string {
  if (!text || !person) return text;
  return text
    .replace(/\b(Y|y)our\b/g, `${person}'s`)
    .replace(OBJECT_YOU, (_, word: string) => `${word} ${person}`);
}

/** The same, for a payment's summary. */
export function circleSummary<T extends { summary: string }>(intent: T, person: string): T {
  return { ...intent, summary: forCircle(intent.summary, person) };
}
