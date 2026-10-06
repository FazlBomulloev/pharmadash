import type {
  ScoringCategory,
  ScoringCriterion,
  StopReason,
} from "../../types/api";

export const CATEGORY_ORDER: ScoringCategory[] = [
  "priority", "watch", "miss", "stop",
];

export const CATEGORY_LABEL: Record<ScoringCategory, string> = {
  priority: "Приоритет",
  watch: "Смотреть",
  miss: "Мимо",
  stop: "Стоп",
};

export const CATEGORY_PILL: Record<ScoringCategory, string> = {
  priority: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
  watch: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  miss: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700",
  stop: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
};

export const CATEGORY_FILL: Record<ScoringCategory, string> = {
  priority: "bg-emerald-500",
  watch: "bg-amber-500",
  miss: "bg-slate-400",
  stop: "bg-red-500",
};

export const CATEGORY_HEX: Record<ScoringCategory, string> = {
  priority: "#10b981",
  watch: "#f59e0b",
  miss: "#94a3b8",
  stop: "#ef4444",
};

export const CRITERIA: {
  key: ScoringCriterion;
  label: string;
  short: string;
}[] = [
  { key: "volume", label: "Объём", short: "Объём" },
  { key: "import_share", label: "Импорт", short: "Имп." },
  { key: "cagr_usd", label: "CAGR $", short: "CAGR $" },
  { key: "competition", label: "Конкуренция", short: "Конк." },
  { key: "price", label: "Цена", short: "Цена" },
  { key: "demand", label: "Качество спроса", short: "Спрос" },
  { key: "hhi", label: "HHI", short: "HHI" },
  { key: "form", label: "Сложность формы", short: "Форма" },
  { key: "channel", label: "Канал", short: "Канал" },
  { key: "class_barrier", label: "Барьер класса", short: "Класс" },
];

export const STOP_REASON_LABEL: Record<StopReason, string> = {
  min_sales: "Малый объём продаж",
  max_price: "Высокая цена упаковки",
  max_producers: "Много производителей",
};

export function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return `$${v.toFixed(v >= 100 ? 0 : 2)}`;
}

export function fmtPct(v: number | null, digits = 0): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(v: number | null): string {
  if (v == null) return "—";
  const pct = v * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function fmtScore(v: number): string {
  return v.toFixed(2);
}

/** Цвет ячейки балла 0…1: чем выше, тем зеленее. */
export function scoreTone(v: number): string {
  if (v >= 0.75) return "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40";
  if (v >= 0.4) return "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30";
  return "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30";
}
