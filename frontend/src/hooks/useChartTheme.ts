import { useEffect, useState } from "react";

/** Palette shared across Recharts primitives, resolved for the active theme. */
export interface ChartTheme {
  isDark: boolean;
  grid: string;
  axis: string;
  axisTick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  labelText: string;
  series: {
    indigo: string;
    emerald: string;
    amber: string;
    red: string;
    violet: string;
    sky: string;
    slate: string;
    rose: string;
    teal: string;
    orange: string;
  };
}

const LIGHT: ChartTheme = {
  isDark: false,
  grid: "#e2e8f0",
  axis: "#cbd5e1",
  axisTick: "#64748b",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e2e8f0",
  tooltipText: "#0f172a",
  labelText: "#334155",
  series: {
    indigo: "#4f46e5",
    emerald: "#10b981",
    amber: "#f59e0b",
    red: "#ef4444",
    violet: "#8b5cf6",
    sky: "#0ea5e9",
    slate: "#94a3b8",
    rose: "#f43f5e",
    teal: "#14b8a6",
    orange: "#f97316",
  },
};

const DARK: ChartTheme = {
  isDark: true,
  grid: "#334155",
  axis: "#475569",
  axisTick: "#94a3b8",
  tooltipBg: "#0f172a",
  tooltipBorder: "#334155",
  tooltipText: "#e2e8f0",
  labelText: "#cbd5e1",
  series: {
    // 1 shade lighter than light-mode series for legibility on dark bg.
    indigo: "#818cf8",
    emerald: "#34d399",
    amber: "#fbbf24",
    red: "#f87171",
    violet: "#a78bfa",
    sky: "#38bdf8",
    slate: "#cbd5e1",
    rose: "#fb7185",
    teal: "#2dd4bf",
    orange: "#fb923c",
  },
};

function currentIsDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Returns a Recharts-friendly palette that flips with the active theme.
 * Subscribes to:
 *   - MutationObserver on <html class> (so the toggle applies instantly)
 *   - matchMedia (system pref changes when preference is "system")
 */
export function useChartTheme(): ChartTheme {
  const [isDark, setIsDark] = useState<boolean>(() => currentIsDark());

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const sync = () => setIsDark(currentIsDark());

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", sync);

    // In case something else changed the class between initial state and subscription.
    sync();

    return () => {
      observer.disconnect();
      mq?.removeEventListener?.("change", sync);
    };
  }, []);

  return isDark ? DARK : LIGHT;
}
