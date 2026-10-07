import { useEffect, useState } from "react";

const DURATION_MS = 1900;
const SAFETY_MS = 2600;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function shouldSkip(): boolean {
  if (typeof document === "undefined") return true;
  if (document.visibilityState !== "visible") return true;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia?.("print").matches
  );
}

export function useProgress(key: unknown = 0): number {
  const [state, setState] = useState<{ key: unknown; t: number }>(() => ({
    key,
    t: shouldSkip() ? 1 : 0,
  }));

  useEffect(() => {
    const finish = () => setState({ key, t: 1 });
    if (shouldSkip()) {
      const immediate = window.setTimeout(finish, 0);
      return () => window.clearTimeout(immediate);
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const raw = Math.min(Math.max((now - started) / DURATION_MS, 0), 1);
      setState({ key, t: easeInOutCubic(raw) });
      if (raw < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const safety = window.setTimeout(finish, SAFETY_MS);
    const onVisibility = () => {
      if (document.visibilityState !== "visible") finish();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeprint", finish);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(safety);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeprint", finish);
    };
  }, [key]);

  return state.key === key ? state.t : 0;
}
