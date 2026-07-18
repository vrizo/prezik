import { writeFileSync } from "node:fs";
import { requireEnv } from "./env.js";
import { probeDurationMs, speedUpAudio } from "./ffmpeg.js";

// Direct OpenAI TTS call. Chosen over the Vercel AI SDK speech helper because a
// single documented POST is simpler and the recorder needs no other AI SDK use.
const SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const MODEL = "gpt-4o-mini-tts";
const INSTRUCTIONS =
  "Energetic product-demo narrator. Fast-paced, upbeat and dynamic, with confident momentum. Speak briskly — noticeably quicker than normal conversation — while staying crisp and clear.";
// gpt-4o-mini-tts ignores the API's `speed` parameter, and instruction-driven
// pacing alone is not reliable, so every clip is additionally time-compressed
// with ffmpeg atempo (pitch-preserving). 1.1 = 10% faster.
const SPEECH_TEMPO = 1.1;

// Synthesize one narration line to an mp3 and return its measured duration (ms).
export async function synthesizeSpeech(text: string, voice: string, outPath: string): Promise<number> {
  const key = requireEnv("OPENAI_API_KEY"); // re-checks live in case .env appeared mid-session
  const res = await fetch(SPEECH_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      voice,
      input: text,
      instructions: INSTRUCTIONS,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  await speedUpAudio(outPath, SPEECH_TEMPO);
  return probeDurationMs(outPath);
}
