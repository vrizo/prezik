// Pure scene-timing math. Unit-tested in test/timing.test.ts.

// Silent fallback duration per scene/intro/outro when TTS is disabled.
export const SILENT_SEGMENT_MS = 4000;

// Gap held after a scene's narration audio ends before moving on.
export const SCENE_TAIL_MS = 400;

// A scene's wall time must cover its narration plus a small tail. Given how long
// the scene's actions already took, return how much longer to wait (never < 0).
export function remainingWaitMs(narrationMs: number, elapsedMs: number, tailMs = SCENE_TAIL_MS): number {
  return Math.max(0, narrationMs + tailMs - elapsedMs);
}

// Target start offsets (ms into the narration) for a scene's visual beats
// (highlight/zoom/zoomOut). Beats are spread evenly across the narration so the
// visual the narrator is describing appears while they talk about it, instead of
// all firing at the start and leaving the video frozen. Two guarantees: the
// first beat is at 0, and no beat is closer than minSpacingMs to the previous
// one (each highlight/zoom stays on screen at least ~minSpacingMs before the
// next). Returns an empty list for count 0.
export function beatStartOffsets(narrationMs: number, count: number, minSpacingMs = 1000): number[] {
  const offsets: number[] = [];
  for (let k = 0; k < count; k++) {
    const even = count > 0 ? Math.round((k * narrationMs) / count) : 0;
    const lowerBound = k > 0 ? offsets[k - 1] + minSpacingMs : 0;
    offsets.push(Math.max(even, lowerBound));
  }
  return offsets;
}

// Cumulative start offsets for a sequence of segment durations. Not used by the
// recorder at runtime (it measures real wall-clock offsets), but exercised in
// tests as the reference for the offset model.
export function cumulativeOffsets(durationsMs: number[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const d of durationsMs) {
    offsets.push(acc);
    acc += d;
  }
  return offsets;
}
