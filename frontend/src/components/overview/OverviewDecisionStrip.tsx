import { Link, useNavigate } from "react-router-dom";
import { Target, ArrowRight } from "lucide-react";
import clsx from "clsx";
import type { OverviewDecision } from "../../types/api";
import {
  CATEGORY_FILL, CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_PILL,
} from "../scoring/meta";

interface Props {
  data: OverviewDecision;
  marketId: number;
}

export default function OverviewDecisionStrip({ data, marketId }: Props) {
  const navigate = useNavigate();

  if (data.total === 0) return null;

  const top = data.top.slice(0, 5);

  function openMnn(mnn: string) {
    navigate(
      `/market/${marketId}/dashboard?mnn=${encodeURIComponent(mnn)}`,
    );
  }

  return (
    <section
      aria-label="Скоринг — сводка"
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-5 py-4"
    >
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Скоринг
          </h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {data.total} МНН · прошли фильтр {data.passed}
          </span>
        </div>
        <Link
          to={`/market/${marketId}/scoring`}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          Весь скоринг
          <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
        {/* distribution */}
        <div className="flex flex-col gap-1.5">
          {CATEGORY_ORDER.map((c) => {
            const count = data.categories[c] ?? 0;
            const pct = (count / data.total) * 100;
            return (
              <div
                key={c}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={clsx("w-2 h-2 rounded-full", CATEGORY_FILL[c])}
                  aria-hidden
                />
                <span className="text-slate-600 dark:text-slate-300 flex-1 min-w-0 truncate">
                  {CATEGORY_LABEL[c]}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums w-10 text-right">
                  {count}
                </span>
                <span className="text-slate-400 dark:text-slate-500 tabular-nums w-10 text-right text-[11px]">
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* top by score */}
        {top.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target size={12} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                Лучшие по скорингу
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {top.map((item) => (
                <button
                  key={item.mnn}
                  onClick={() => openMnn(item.mnn)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md border text-xs font-medium max-w-[240px] hover:shadow-sm transition-shadow",
                    CATEGORY_PILL[item.category],
                  )}
                  title={item.mnn}
                >
                  <span className="truncate">{item.mnn}</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-white/70 dark:bg-black/30 text-[10px] font-bold tabular-nums">
                    {item.total.toFixed(0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
