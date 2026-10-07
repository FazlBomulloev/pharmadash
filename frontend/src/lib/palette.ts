import type { ScoringCategory } from "../types/api";

export function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return h;
}

const ATC_HUES = [268, 355, 155, 300, 45, 230, 100, 20, 195, 130];
const atcHueCache = new Map<string, number>();

export function atcHue(cls: string | null | undefined): number {
  const key = (cls ?? "").trim().toUpperCase();
  let hue = atcHueCache.get(key);
  if (hue == null) {
    hue = ATC_HUES[hashHue(key) % ATC_HUES.length];
    atcHueCache.set(key, hue);
  }
  return hue;
}

export const atcColor = (cls: string | null | undefined) =>
  `oklch(0.56 0.15 ${atcHue(cls)})`;

export function tintChip(hue: number) {
  return {
    background: `oklch(0.95 0.035 ${hue})`,
    color: `oklch(0.38 0.1 ${hue})`,
  };
}

const COUNTRIES: Record<string, [code: string, hue: number]> = {
  "РОССИЯ": ["RU", 20],
  "КАЗАХСТАН": ["KZ", 195],
  "ГЕРМАНИЯ": ["DE", 268],
  "ФРАНЦИЯ": ["FR", 300],
  "ШВЕЙЦАРИЯ": ["CH", 355],
  "СЛОВЕНИЯ": ["SI", 155],
  "США": ["US", 230],
  "ВЕНГРИЯ": ["HU", 130],
  "ТУРЦИЯ": ["TR", 20],
  "ИНДИЯ": ["IN", 60],
  "ИЗРАИЛЬ": ["IL", 230],
  "АНГЛИЯ": ["GB", 250],
  "ВЕЛИКОБРИТАНИЯ": ["GB", 250],
  "БЕЛЬГИЯ": ["BE", 85],
  "ЯПОНИЯ": ["JP", 10],
  "ИТАЛИЯ": ["IT", 145],
  "ДАНИЯ": ["DK", 5],
  "ХОРВАТИЯ": ["HR", 215],
  "БОЛГАРИЯ": ["BG", 165],
  "ЧЕХИЯ": ["CZ", 240],
  "ПОЛЬША": ["PL", 340],
  "РУМЫНИЯ": ["RO", 70],
  "ИРЛАНДИЯ": ["IE", 140],
  "ЛАТВИЯ": ["LV", 350],
  "ТАЙВАНЬ": ["TW", 280],
  "БЕЛАРУСЬ": ["BY", 120],
  "АВСТРИЯ": ["AT", 15],
  "КИТАЙ": ["CN", 30],
  "ИСПАНИЯ": ["ES", 50],
  "НИДЕРЛАНДЫ": ["NL", 35],
  "ШВЕЦИЯ": ["SE", 225],
  "КАНАДА": ["CA", 25],
  "КОРЕЯ": ["KR", 255],
  "ФИНЛЯНДИЯ": ["FI", 235],
  "ГРЕЦИЯ": ["GR", 220],
  "ПОРТУГАЛИЯ": ["PT", 150],
  "СЕРБИЯ": ["RS", 345],
  "УКРАИНА": ["UA", 90],
  "АРМЕНИЯ": ["AM", 40],
  "УЗБЕКИСТАН": ["UZ", 185],
};

const HOME_HUE = 195;

export interface CountryMeta {
  code: string;
  hue: number;
}

export function countryMeta(
  name: string | null | undefined, isHome = false,
): CountryMeta {
  const key = (name ?? "").trim().toUpperCase();
  const known = COUNTRIES[key];
  const code = known ? known[0] : (key.slice(0, 2) || "—");
  if (isHome) return { code, hue: HOME_HUE };
  return { code, hue: known ? known[1] : hashHue(key) };
}

export const countryBar = (hue: number) => `oklch(0.56 0.14 ${hue})`;

export function countryChip(hue: number) {
  return {
    background: `oklch(0.93 0.05 ${hue})`,
    color: `oklch(0.36 0.11 ${hue})`,
  };
}

const PHARMACY_HUES = [262, 155, 45, 320, 195, 20];

export function pharmacyHue(index: number): number {
  return PHARMACY_HUES[Math.max(0, index) % PHARMACY_HUES.length];
}

export const CATEGORY_COLOR: Record<
  ScoringCategory, { bg: string; fg: string; tint: string; ink: string }
> = {
  priority: {
    bg: "oklch(0.58 0.15 155)", fg: "#fff",
    tint: "oklch(0.95 0.045 155)", ink: "oklch(0.36 0.1 155)",
  },
  watch: {
    bg: "oklch(0.78 0.15 78)", fg: "oklch(0.3 0.07 70)",
    tint: "oklch(0.95 0.06 85)", ink: "oklch(0.42 0.09 70)",
  },
  miss: {
    bg: "#e2e3e7", fg: "#3d4048",
    tint: "#f0f0ec", ink: "#3d4048",
  },
  stop: {
    bg: "oklch(0.6 0.19 25)", fg: "#fff",
    tint: "oklch(0.95 0.035 25)", ink: "oklch(0.45 0.14 25)",
  },
};

export function heatIndigo(value: number, max = 25) {
  const t = Math.min(Math.max(value, 0) / max, 1);
  const l = 0.97 - 0.52 * t;
  const c = 0.02 + 0.14 * t;
  return {
    background: `oklch(${l.toFixed(3)} ${c.toFixed(3)} 268)`,
    color: l < 0.66 ? "#fff" : "oklch(0.3 0.1 268)",
  };
}

export function scoreTone(v: number) {
  if (v >= 0.75) {
    return {
      background: "oklch(0.94 0.06 155)", color: "oklch(0.36 0.1 155)",
      bar: "oklch(0.62 0.15 155)",
    };
  }
  if (v >= 0.5) {
    return {
      background: "oklch(0.95 0.06 85)", color: "oklch(0.42 0.09 70)",
      bar: "oklch(0.78 0.15 78)",
    };
  }
  return {
    background: "oklch(0.95 0.035 25)", color: "oklch(0.45 0.14 25)",
    bar: "oklch(0.62 0.19 25)",
  };
}

export const POS = "oklch(0.52 0.13 155)";
export const NEG = "oklch(0.55 0.18 25)";
export const POS_BAR = "oklch(0.62 0.15 155)";
export const NEG_BAR = "oklch(0.62 0.19 25)";
export const MUTED = "#8b8f97";

export function growthTone(v: number | null | undefined): string {
  if (v == null || v === 0) return MUTED;
  return v > 0 ? POS : NEG;
}

export function hhiLevel(hhi: number | null | undefined) {
  if (hhi == null) return null;
  if (hhi < 1500) {
    return {
      label: "Низкая", word: "низкая концентрация",
      background: "oklch(0.94 0.05 155)", color: "oklch(0.38 0.11 155)",
    };
  }
  if (hhi < 2500) {
    return {
      label: "Умеренная", word: "умеренная концентрация",
      background: "oklch(0.95 0.06 85)", color: "oklch(0.42 0.09 70)",
    };
  }
  return {
    label: "Высокая", word: "высокая концентрация",
    background: "oklch(0.95 0.035 25)", color: "oklch(0.45 0.14 25)",
  };
}
