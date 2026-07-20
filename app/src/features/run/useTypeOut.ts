import { useEffect, useRef, useState } from "react";

// Slows the base per-chunk delay; higher feels more deliberate.
const TYPE_MODERATOR = 2;

// Types `target` out in small random chunks, ChatGPT style. `target` grows
// over time (the Director streams reasoning in ~1s server chunks); typing
// continues from wherever it is toward the latest target instead of
// restarting. Returns the visible slice and whether it is still catching up.
//
// Hidden tabs throttle timers, so rather than animate into a long backlog we
// snap straight to the full text while the tab is hidden; when it becomes
// visible again only newly-arrived text animates.
export function useTypeOut(target: string): { text: string; typing: boolean } {
  const [shown, setShown] = useState(0);
  const indexRef = useRef(0);
  const targetRef = useRef(target);
  const timeoutRef = useRef<number | null>(null);
  targetRef.current = target;

  // A shrinking target (a new run resetting the row) can leave the cursor past
  // the end; clamp it during render so the returned slice stays valid.
  if (indexRef.current > target.length) indexRef.current = target.length;

  useEffect(() => {
    const clear = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
    const tick = () => {
      timeoutRef.current = null;
      const full = targetRef.current;
      if (document.hidden) {
        indexRef.current = full.length;
        setShown(full.length);
        return;
      }
      if (indexRef.current < full.length) {
        const chunkSize = 1 + Math.floor(Math.random() * 6);
        indexRef.current = Math.min(full.length, indexRef.current + chunkSize);
        setShown(indexRef.current);
        const delay = (6 + Math.random() * 10) * TYPE_MODERATOR;
        timeoutRef.current = window.setTimeout(tick, delay);
      }
    };
    if (timeoutRef.current === null && indexRef.current < target.length) tick();
    return clear;
  }, [target]);

  return { text: target.slice(0, Math.min(shown, target.length)), typing: shown < target.length };
}
