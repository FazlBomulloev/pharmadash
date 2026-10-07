/** Поля БДП для маппинга колонок файла и автоподбор колонок по названию. */

export interface BdpField {
  key: string;
  label: string;
  required: boolean;
}

export function bdpFields(years: number[]): BdpField[] {
  const y = (i: number) => years[i] ?? `год ${i + 1}`;
  return [
    { key: "mnn", label: "МНН", required: true },
    { key: "tm", label: "Торговое наименование", required: true },
    { key: "producer", label: "Производитель", required: true },
    { key: "country_mfr", label: "Страна производства", required: false },
    { key: "lf_avp", label: "Лекарственная форма", required: true },
    { key: "strength", label: "Дозировка", required: false },
    { key: "atc", label: "Класс ATC", required: false },
    { key: "bg_g", label: "Бренд / генерик", required: false },
    { key: "region", label: "Регион", required: true },
    { key: "sector", label: "Сектор (RET/HOS)", required: true },
    { key: "usd_y1", label: `Продажи USD, ${y(0)}`, required: true },
    { key: "usd_y2", label: `Продажи USD, ${y(1)}`, required: true },
    { key: "usd_y3", label: `Продажи USD, ${y(2)}`, required: true },
    { key: "un_y1", label: `Упаковки, ${y(0)}`, required: true },
    { key: "un_y2", label: `Упаковки, ${y(1)}`, required: true },
    { key: "un_y3", label: `Упаковки, ${y(2)}`, required: true },
  ];
}

const TEXT_PATTERNS: Record<string, RegExp> = {
  mnn: /^(мнн|inn|mnn|molecule|молекула)/,
  tm: /(^тм$|^tm$|торгов|trade|brand name|бренд$|^brand$)/,
  producer: /(производител|manufacturer|producer|корпорац|corporation|^mfr)/,
  country_mfr: /(стран|country)/,
  lf_avp: /(^лф|лекарственн.*форм|^форма|dosage form|^form|nfc)/,
  strength: /(дозировк|strength|^доза|dose)/,
  atc: /(atc|атх|^класс|class)/,
  bg_g: /(бг\s*\/?\s*г|bg\s*\/?\s*g|бренд.*генерик|brand.*generic|оригинал)/,
  region: /(регион|region|область)/,
  sector: /(сектор|sector|канал|channel|сегмент)/,
};

const USD = /(usd|\$|долл|руб|rub|value|сумм|стоимост)/;
const UNITS = /(^un\b|\bun\b|упак|шт|unit|pack|натур|количеств)/;

/** Подбирает колонку для каждого поля по её названию; занятые не повторяет. */
export function autoMap(
  columns: string[], years: number[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const used = new Set<string>();
  const take = (field: string, test: (name: string) => boolean) => {
    const found = columns.find(
      (c) => !used.has(c) && test(c.trim().toLowerCase()),
    );
    if (found) {
      result[field] = found;
      used.add(found);
    }
  };

  // Годовые колонки — первыми: «USD 2024» не должно уйти в текстовое поле.
  years.slice(0, 3).forEach((year, i) => {
    const hasYear = (name: string) => name.includes(String(year));
    take(`usd_y${i + 1}`, (name) => hasYear(name) && USD.test(name));
    take(`un_y${i + 1}`, (name) => hasYear(name) && UNITS.test(name));
  });
  Object.entries(TEXT_PATTERNS).forEach(([field, pattern]) => {
    take(field, (name) => pattern.test(name));
  });
  return result;
}
