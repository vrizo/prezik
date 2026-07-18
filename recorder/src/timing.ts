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
