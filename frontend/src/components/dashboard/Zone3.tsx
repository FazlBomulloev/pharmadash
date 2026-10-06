import { ShieldAlert } from "lucide-react";
import clsx from "clsx";
import type {
  ScoringCriterion, ScoringItem, StopReason, Zone3Data,
} from "../../types/api";
import ScopeChip from "../common/ScopeChip";
import {
  CATEGORY_FILL, CATEGORY_LABEL, CATEGORY_PILL, CRITERIA,
  STOP_REASON_LABEL, fmtPct, fmtPrice, fmtScore, fmtSignedPct, fmtUsd,
} from "../scoring/meta";

/** Шкала ИТОГА 0–100 с отметками порогов категорий из настроек рынка. */
function ScoreBullet({
  item, watch, priority,
}: {
  item: ScoringItem;
  watch: number;
  priority: number;
}) {
  const clamped = Math.min(100, Math.max(0, item.total));
  const ticks = [watch, priority];

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-4xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          {item.total.toFixed(1)}
          <span className="text-lg font-normal text-slate-400 dark:text-slate-500 ml-1">
            / 100
          </span>
        </span>
      </div>
      <div className="relative h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full w-px bg-white/80 dark:bg-slate-950/60"
            style={{ left: `${t}%` }}
            aria-hidden
          />
        ))}
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-700 ease-out",
            CATEGORY_FILL[item.category],
          )}
          style={{ width: `${clamped}%` }}
        />
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-slate-100 rounded-full ring-2 ring-slate-800 dark:ring-slate-200 shadow-md transition-all duration-700"
          style={{ left: `${clamped}%` }}
          aria-hidden
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
        {[0, watch, priority, 100].map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2"
            style={{ left: `${t}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function metricText(item: ScoringItem, key: ScoringCriterion): string {
  switch (key) {
    case "volume":
      return `${fmtUsd(item.sales[2])} · в классе ${item.cls ?? "—"}`;
    case "import_share": return fmtPct(item.import_share);
    case "cagr_usd": return fmtSignedPct(item.cagr_usd);
    case "competition": return `${item.producers} произв.`;
    case "price": return `${fmtPrice(item.price)} за уп.`;
    case "demand": return `${fmtSignedPct(item.cagr_units)} уп.`;
    case "hhi": return item.hhi != null ? String(Math.round(item.hhi)) : "—";
    case "form":
      return item.form_score != null ? fmtScore(item.form_score) : "—";
    case "channel": return `${fmtPct(item.hospital_share)} госпиталь`;
    case "class_barrier": return item.cls ?? "—";
  }
}

function stopDetail(
  reason: StopReason, item: ScoringItem, stop: Zone3Data["stop"],
): string {
  switch (reason) {
    case "min_sales":
      return `продажи ${fmtUsd(item.sales[2])} < ${fmtUsd(stop.min_sales_usd)}`;
    case "max_price":
      return `цена ${fmtPrice(item.price)} > ${fmtPrice(stop.max_price_usd)}`;
    case "max_producers":
      return `${item.producers} > ${stop.max_producers}`;
  }
}

export default function Zone3({ data }: { data: Zone3Data }) {
  const item = data.item;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        Скоринг
        <ScopeChip scope="mnn" />
      </h3>

      {!item ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 text-sm text-slate-500 dark:text-slate-400">
          Для выбранной формы и дозировки у этого МНН нет продаж — скоринг не рассчитан.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6">
          {/* ИТОГ, ранг, категория */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
            <ScoreBullet
              item={item}
              watch={data.thresholds.watch}
              priority={data.thresholds.priority}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={clsx(
                  "px-3 py-1.5 rounded-lg border text-sm font-semibold",
                  CATEGORY_PILL[item.category],
                )}
              >
                {CATEGORY_LABEL[item.category]}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                Ранг <span className="font-semibold text-slate-800 dark:text-slate-100">{item.rank}</span> из {data.selection_size.toLocaleString("ru-RU")}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {item.direction}
              {item.cls && <> · класс {item.cls}</>}
            </p>
            {!item.passed && (
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300 mb-1.5">
                  <ShieldAlert size={14} />
                  Стоп-фильтр
                </div>
                <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
                  {item.stop_reasons.map((r) => (
                    <li key={r}>
                      {STOP_REASON_LABEL[r]}: {stopDetail(r, item, data.stop)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 10 критериев */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <CriteriaTable item={item} weights={data.weights} />
          </div>
        </div>
      )}
    </div>
  );
}

function CriteriaTable({
  item, weights,
}: {
  item: ScoringItem;
  weights: Zone3Data["weights"];
}) {
  const weightSum = CRITERIA.reduce((s, c) => s + weights[c.key], 0);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
          <th className="pb-2 font-medium">Критерий</th>
          <th className="pb-2 font-medium">Значение</th>
          <th className="pb-2 font-medium w-[30%]">Балл</th>
          <th className="pb-2 font-medium text-right">Вес</th>
          <th className="pb-2 font-medium text-right">Вклад</th>
        </tr>
      </thead>
      <tbody>
        {CRITERIA.map((c) => {
          const score = item.scores[c.key];
          const contribution =
            weightSum > 0 ? (score * weights[c.key]) / weightSum * 100 : 0;
          return (
            <tr
              key={c.key}
              className="border-b border-slate-100 dark:border-slate-800 last:border-b-0"
            >
              <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">
                {c.label}
              </td>
              <td className="py-2 pr-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {metricText(item, c.key)}
              </td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
                      style={{ width: `${Math.min(1, Math.max(0, score)) * 100}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    {fmtScore(score)}
                  </span>
                </div>
              </td>
              <td className="py-2 text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {weights[c.key]}
              </td>
              <td className="py-2 text-right text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                {contribution.toFixed(1)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="text-xs text-slate-500 dark:text-slate-400">
          <td colSpan={4} className="pt-3">
            Сумма вкладов до нормировки по выборке (ИТОГ = положение между худшим и лучшим МНН)
          </td>
          <td className="pt-3 text-right font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            {item.raw.toFixed(1)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
