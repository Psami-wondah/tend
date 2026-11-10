/**
 * Reading answers aloud. Tend's natural voice (/api/speak) when it's set up,
 * otherwise the best voice this browser has, a sentence at a time so long
 * answers aren't cut off.
 *
 * An iPhone only lets a page play sound it starts from a tap, and Tend's
 * answer arrives seconds after the tap, once the AI has read the request. So
 * one audio player is unlocked by the person's first tap on the page (with a
 * moment of silence) and reused for every answer after that.
 */

let current: HTMLAudioElement | null = null;
let player: HTMLAudioElement | null = null;
let unlocked = false;
let turn = 0;
let serverVoice: boolean | null = null;
const played = new Map<string, string>();

/** 20ms of silence as a WAV: enough for iOS to count the player as started by a tap. */
function silence(): string {
  const n = 160;
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (at: number, s: string) => [...s].forEach((c, i) => b.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  b.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true);
  b.setUint32(28, 16000, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  str(36, "data");
  b.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b.buffer], { type: "audio/wav" }));
}

const TAPS = ["touchend", "pointerup", "click", "keydown"] as const;

function unlock() {
  if (unlocked || typeof Audio === "undefined") return;
  player ??= new Audio();
  // Don't cut off an answer that's already playing.
  if (current === player && !player.paused) return;
  player.src = silence();
  player
    .play()
    .then(() => {
      unlocked = true;
      for (const t of TAPS) window.removeEventListener(t, unlock, true);
    })
    .catch(() => undefined);
}

if (typeof window !== "undefined") {
  for (const t of TAPS) window.addEventListener(t, unlock, { capture: true, passive: true });
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && (typeof Audio !== "undefined" || "speechSynthesis" in window);
}

export function stopSpeaking() {
  turn++;
  current?.pause();
  current = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export async function speak(text: string) {
  stopSpeaking();
  const mine = turn;
  if (serverVoice !== false) {
    try {
      let url = played.get(text);
      if (!url) {
        const res = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        if (res.status === 503) serverVoice = false;
        if (!res.ok) throw new Error(`speak ${res.status}`);
        url = URL.createObjectURL(await res.blob());
        played.set(text, url);
      }
      if (mine !== turn) return;
      const audio = (player ??= new Audio());
      audio.src = url;
      current = audio;
      await audio.play();
      serverVoice = true;
      unlocked = true;
      return;
    } catch {
      if (mine !== turn) return;
    }
  }
  browserSpeak(text);
}

function bestVoice(): SpeechSynthesisVoice | undefined {
  const lang = (navigator.language || "en-US").toLowerCase();
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced|siri/i.test(v.name) ? 8 : 0) + (/google/i.test(v.name) ? 4 : 0) + (v.lang.toLowerCase() === lang ? 2 : 0) + (v.localService ? 0 : 1);
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)))
    .sort((a, b) => score(b) - score(a))[0];
}

function browserSpeak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const voice = bestVoice();
  for (const sentence of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    const u = new SpeechSynthesisUtterance(sentence.trim());
    if (voice) u.voice = voice;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }
}
