import { useEffect, useState, useCallback } from "react";

export type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = "pharmdash.theme";

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply the preference to <html>:
 *   - sets `data-theme="light"|"dark"` or removes it entirely for system
 *   - toggles the `.dark` class so Tailwind v4's `dark:` variant activates.
 */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
  const isDark = pref === "dark" || (pref === "system" && systemPrefersDark());
  root.classList.toggle("dark", isDark);
}

/**
 * Initialize theme as early as possible (call from main.tsx before render).
 * Also subscribes to prefers-color-scheme changes for the `system` preference.
 */
export function initTheme() {
  const pref = readStored();
  applyTheme(pref);
  if (typeof window === "undefined") return;
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mq) return;
  mq.addEventListener?.("change", () => {
    // Only react if the user hasn't chosen an explicit theme.
    const current = readStored();
    if (current === "system") applyTheme("system");
  });
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() =>
    typeof window === "undefined" ? "system" : readStored(),
  );

  useEffect(() => {
    applyTheme(pref);
    try {
      if (pref === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* ignore */
    }
  }, [pref]);

  const cycle = useCallback(() => {
    setPref((p) => (p === "system" ? "dark" : p === "dark" ? "light" : "system"));
  }, []);

  return { pref, setPref, cycle };
}
