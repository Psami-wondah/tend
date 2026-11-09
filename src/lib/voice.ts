import { createHash } from "node:crypto";

/**
 * Spoken answers in a natural voice, for the person at the centre.
 *
 * Runs on OpenRouter's speech endpoint with the same key as the AI model, so
 * there is nothing else to sign up for. The model and voice are settings
 * (TEND_VOICE_MODEL, TEND_VOICE); TEND_VOICE=off falls back to the browser's
 * own voice. Answers repeat a lot ("Paid. ..."), so audio is cached by text.
 */

const DEFAULT_MODEL = "microsoft/mai-voice-2.1";
const DEFAULT_VOICE = "en-US-Harper:MAI-Voice-2.1";
const MAX_CACHED = 200;
const cache = new Map<string, { audio: Buffer; type: string }>();

export function voiceConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY) && process.env.TEND_VOICE !== "off";
}

export function voiceModel(): string {
  return process.env.TEND_VOICE_MODEL || DEFAULT_MODEL;
}

export function voiceName(): string {
  return process.env.TEND_VOICE || (voiceModel() === DEFAULT_MODEL ? DEFAULT_VOICE : "");
}

/** A friendly name for the Setup page: "Harper (Microsoft MAI Voice 2.1)". */
export function voiceLabel(): string {
  const voice = voiceName().split(":")[0].replace(/^[a-z]{2}-[A-Z]{2}-/, "");
  return voice ? `${voice[0].toUpperCase()}${voice.slice(1)} (${voiceModel()})` : voiceModel();
}

// Some providers only return raw 16-bit PCM; browsers play it once it has a WAV header.
function wav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const PCM_ONLY = /^(google|heygen)\//;

export async function speech(text: string): Promise<{ audio: Buffer; type: string }> {
  const model = voiceModel();
  const voice = voiceName();
  const key = createHash("sha256").update(`${model}\n${voice}\n${text}`).digest("hex");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const pcm = PCM_ONLY.test(model);
  const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: text,
      ...(voice ? { voice } : {}),
      response_format: pcm ? "pcm" : "mp3",
      // Honoured by the models that take delivery notes; ignored by the rest.
      instructions: "Warm, calm and unhurried, like a trusted friend explaining something to an older person. Clear and gentle.",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Speech failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const raw = Buffer.from(await res.arrayBuffer());
  const rate = Number(/rate=(\d+)/.exec(res.headers.get("content-type") ?? "")?.[1] ?? 24000);
  const out = pcm ? { audio: wav(raw, rate), type: "audio/wav" } : { audio: raw, type: "audio/mpeg" };

  cache.set(key, out);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return out;
}
