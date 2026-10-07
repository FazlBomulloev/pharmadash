import type {
  ScoringCategory,
  ScoringCriterion,
  ScoringItem,
  StopReason,
} from "../../types/api";
import {
  fmtGrowth, fmtInt, fmtPct, fmtPrice, fmtUsd, plural,
} from "../../lib/format";

export const CATEGORY_ORDER: ScoringCategory[] = [
  "priority", "watch", "miss", "stop",
];

export const CATEGORY_LABEL: Record<ScoringCategory, string> = {
  priority: "Приоритет",
  watch: "Смотреть",
  miss: "Мимо",
  stop: "Стоп",
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

/** Сырое значение метрики, из которой получен балл критерия. */
export function criterionValue(item: ScoringItem, key: ScoringCriterion): string {
  switch (key) {
    case "volume":
      return `${fmtUsd(item.sales[2])} продаж`;
    case "import_share":
      return item.import_share == null
        ? "нет данных"
        : `${fmtPct(item.import_share)} импорта`;
    case "cagr_usd":
      return item.cagr_usd == null
        ? "нет данных"
        : `${fmtGrowth(item.cagr_usd)} USD в год`;
    case "competition":
      return `${fmtInt(item.producers)} ${plural(
        item.producers, "производитель", "производителя", "производителей",
      )}`;
    case "price":
      return item.price == null
        ? "нет данных"
        : `${fmtPrice(item.price)} за упаковку`;
    case "demand":
      return item.cagr_units == null
        ? "нет данных"
        : `${fmtGrowth(item.cagr_units)} упаковок в год`;
    case "hhi":
      return item.hhi == null ? "нет данных" : `HHI ${fmtInt(item.hhi)}`;
    case "form":
      return item.form_score == null
        ? "нет данных"
        : "взвешенный балл форм";
    case "channel":
      return item.hospital_share == null
        ? "нет данных"
        : `${fmtPct(item.hospital_share)} госпиталь`;
    case "class_barrier":
      return item.cls ?? "класс не указан";
  }
}

/** Вклад критерия в сырой итог (0…100) и сумма вкладов. */
export function contributions(
  item: ScoringItem, weights: Record<ScoringCriterion, number>,
) {
  const weightSum = CRITERIA.reduce((s, c) => s + weights[c.key], 0) || 1;
  const rows = CRITERIA.map((c) => ({
    ...c,
    score: item.scores[c.key],
    weight: weights[c.key],
    contribution: (item.scores[c.key] * weights[c.key]) / weightSum * 100,
    /** Максимально возможный вклад критерия. */
    ceiling: (weights[c.key] / weightSum) * 100,
  }));
  return { rows, raw: rows.reduce((s, r) => s + r.contribution, 0) };
}
