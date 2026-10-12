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

export const pairKey = (item: { mnn: string; lf: string }) =>
  `${item.mnn}|${item.lf}`;

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
      return item.form_score == null ? "нет данных" : item.lf;
    case "channel":
      return item.hospital_share == null
        ? "нет данных"
        : `${fmtPct(item.hospital_share)} госпиталь`;
    case "class_barrier":
      return item.cls ?? "класс не указан";
  }
}

const FACTOR_TEXT: Record<ScoringCriterion, { driver: string; risk: string }> = {
  volume: {
    driver: "Крупный объём продаж в своём классе",
    risk: "Небольшой объём продаж в своём классе",
  },
  import_share: {
    driver: "Высокая доля импорта — есть что замещать",
    risk: "Рынок уже занят локальными производителями",
  },
  cagr_usd: {
    driver: "Продажи в USD растут быстрее рынка",
    risk: "Продажи в USD растут слабее рынка",
  },
  competition: {
    driver: "Умеренное число производителей",
    risk: "Много производителей",
  },
  price: {
    driver: "Высокая цена упаковки",
    risk: "Низкая цена упаковки",
  },
  demand: {
    driver: "Спрос в упаковках растёт быстрее рынка",
    risk: "Спрос в упаковках слабее рынка",
  },
  hhi: {
    driver: "Рынок не поделён между лидерами",
    risk: "Рынок сконцентрирован у лидеров",
  },
  form: {
    driver: "Простая в производстве форма",
    risk: "Сложная в производстве форма",
  },
  channel: {
    driver: "Продажи в основном через розницу",
    risk: "Высокая доля госпитального канала",
  },
  class_barrier: {
    driver: "Низкий барьер входа в класс",
    risk: "Высокий барьер входа в класс",
  },
};

const FACTOR_MIN_IMPACT = 0.5;

export interface Factor {
  key: ScoringCriterion;
  text: string;
  value: string;
  impact: number;
}

export function driversAndRisks(
  item: ScoringItem,
  weights: Record<ScoringCriterion, number>,
  neutral = 0.5,
  limit = 3,
): { drivers: Factor[]; risks: Factor[] } {
  const weightSum = CRITERIA.reduce((s, c) => s + weights[c.key], 0) || 1;
  const factors = CRITERIA.map((c) => {
    const impact =
      ((item.scores[c.key] - neutral) * weights[c.key]) / weightSum * 100;
    return {
      key: c.key,
      text: impact >= 0 ? FACTOR_TEXT[c.key].driver : FACTOR_TEXT[c.key].risk,
      value: criterionValue(item, c.key),
      impact,
    };
  });
  return {
    drivers: factors
      .filter((f) => f.impact >= FACTOR_MIN_IMPACT)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, limit),
    risks: factors
      .filter((f) => f.impact <= -FACTOR_MIN_IMPACT)
      .sort((a, b) => a.impact - b.impact)
      .slice(0, limit),
  };
}

export function contributions(
  item: ScoringItem, weights: Record<ScoringCriterion, number>,
) {
  const weightSum = CRITERIA.reduce((s, c) => s + weights[c.key], 0) || 1;
  const rows = CRITERIA.map((c) => ({
    ...c,
    score: item.scores[c.key],
    weight: weights[c.key],
    contribution: (item.scores[c.key] * weights[c.key]) / weightSum * 100,
    ceiling: (weights[c.key] / weightSum) * 100,
  }));
  return { rows, raw: rows.reduce((s, r) => s + r.contribution, 0) };
}
