/**
 * Reading answers aloud. Tend's natural voice (/api/speak) when it's set up,
 * otherwise the best voice this browser has, a sentence at a time so long
 * answers aren't cut off.
 */

let current: HTMLAudioElement | null = null;
let turn = 0;
let serverVoice: boolean | null = null;
const played = new Map<string, string>();

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
      const audio = new Audio(url);
      current = audio;
      await audio.play();
      serverVoice = true;
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
