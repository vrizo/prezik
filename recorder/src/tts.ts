import { writeFileSync } from "node:fs";
import { requireEnv } from "./env.js";
import { probeDurationMs } from "./ffmpeg.js";

// Direct OpenAI TTS call. Chosen over the Vercel AI SDK speech helper because a
// single documented POST is simpler and the recorder needs no other AI SDK use.
const SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const MODEL = "gpt-4o-mini-tts";
const INSTRUCTIONS = "Warm, friendly product-demo narrator. Conversational, clear, unhurried.";

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
  return probeDurationMs(outPath);
}
