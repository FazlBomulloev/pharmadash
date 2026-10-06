import { ChevronDown, ShieldAlert, Users } from "lucide-react";
import clsx from "clsx";
import type { Zone3Data, KpiZone1 } from "../../types/api";
import {
  CATEGORY_FILL, CATEGORY_LABEL, CATEGORY_PILL,
} from "../scoring/meta";

interface Props {
  mnn: string;
  zone1: KpiZone1;
  zone3: Zone3Data;
}

export default function MnnScoreHeader({
  mnn, zone1, zone3,
}: Props) {
  const item = zone3.item;

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* MNN + class */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[420px]"
              title={mnn}
            >
              {mnn}
            </span>
            {item?.cls && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded uppercase">
                {item.cls}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Users size={11} />
              {zone1.active_competitors} акт. конк.
            </span>
            {item && <span>{item.direction}</span>}
          </div>
        </div>

        {item && (
          <>
            {/* score bullet */}
            <div className="w-56">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                  Скоринг · ранг {item.rank} из {zone3.selection_size}
                </span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {item.total.toFixed(0)}
                  <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500"> / 100</span>
                </span>
              </div>
              <div className="relative h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={clsx("h-full rounded-full transition-all", CATEGORY_FILL[item.category])}
                  style={{ width: `${Math.min(100, Math.max(0, item.total))}%` }}
                />
              </div>
            </div>

            {/* category pill */}
            <div
              className={clsx(
                "px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5",
                CATEGORY_PILL[item.category],
              )}
            >
              <span className={clsx("w-2 h-2 rounded-full", CATEGORY_FILL[item.category])} aria-hidden />
              {CATEGORY_LABEL[item.category]}
            </div>

            {/* stop-filter shortcut */}
            {!item.passed && (
              <button
                onClick={() => scrollTo("mnn-zone3-details")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
              >
                <ShieldAlert size={12} />
                Стоп-фильтр: {item.stop_reasons.length}
                <ChevronDown size={12} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
