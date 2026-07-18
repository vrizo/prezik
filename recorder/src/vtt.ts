// WebVTT builder. Pure and unit-tested in test/vtt.test.ts.

export interface VttSegment {
  startMs: number; // measured wall-clock offset of the segment in the video
  audioMs: number; // spoken duration of this segment's narration
  narration: string;
}

// Split into sentences, keeping terminal punctuation. Falls back to the whole
// string when there are no sentence breaks.
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  if (!parts) return [text.trim()].filter(Boolean);
  return parts.map((s) => s.trim()).filter(Boolean);
}

// HH:MM:SS.mmm timestamp for a millisecond offset.
export function formatTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(millis, 3)}`;
}

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

// One cue per sentence when a segment has several (time split proportional to
// sentence length), otherwise one cue for the whole segment.
export function buildCues(segments: VttSegment[]): Cue[] {
  const cues: Cue[] = [];
  for (const seg of segments) {
    const narration = seg.narration.trim();
    if (!narration) continue;
    const sentences = splitSentences(narration);
    if (sentences.length <= 1) {
      cues.push({ startMs: seg.startMs, endMs: seg.startMs + seg.audioMs, text: narration });
      continue;
    }
    const totalChars = sentences.reduce((a, s) => a + s.length, 0) || 1;
    let t = seg.startMs;
    for (const sentence of sentences) {
      const dur = Math.round(seg.audioMs * (sentence.length / totalChars));
      cues.push({ startMs: t, endMs: t + dur, text: sentence });
      t += dur;
    }
  }
  return cues;
}

export function buildVtt(segments: VttSegment[]): string {
  const lines: string[] = ["WEBVTT", ""];
  for (const cue of buildCues(segments)) {
    lines.push(`${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`);
    lines.push(cue.text, "");
  }
  return lines.join("\n");
}

// SubRip file for ffmpeg's subtitles filter (burn-in). Same cues as the VTT,
// with SRT's comma millisecond separator and 1-based cue numbering.
export function buildSrt(segments: VttSegment[]): string {
  const lines: string[] = [];
  buildCues(segments).forEach((cue, i) => {
    lines.push(String(i + 1));
    lines.push(`${formatTimestamp(cue.startMs).replace(".", ",")} --> ${formatTimestamp(cue.endMs).replace(".", ",")}`);
    lines.push(cue.text, "");
  });
  return lines.join("\n");
}
