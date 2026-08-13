import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

interface Props {
  label: string;
  value: string;
  change?: number | null;
  changeLabel?: string;
  hint?: string;
  tooltip?: ReactNode;
  icon: LucideIcon;
  /** Legacy prop, ignored. Kept for API compatibility with existing callers. */
  gradient?: string;
}

function formatPct(v: number): string {
  const s = (v * 100).toFixed(1);
  return v > 0 ? `+${s}%` : `${s}%`;
}

export default function KpiCard({
  label,
  value,
  change,
  changeLabel,
  hint,
  tooltip,
  icon: Icon,
}: Props) {
  const isUp = change != null && change > 0;
  const isDown = change != null && change < 0;

  return (
    <div className="relative rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide truncate">
              {label}
            </span>
            {tooltip && (
              <span className="relative inline-flex group/tt">
                <Info
                  size={12}
                  className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-help flex-shrink-0 transition-colors"
                />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 z-50 opacity-0 translate-y-1 group-hover/tt:opacity-100 group-hover/tt:translate-y-0 transition-all duration-150 ease-out"
                >
                  <span className="block bg-slate-900 dark:bg-slate-800 text-white text-xs leading-relaxed rounded-lg shadow-xl ring-1 ring-white/10 px-3 py-2 text-left font-normal normal-case tracking-normal">
                    {tooltip}
                  </span>
                  <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-900 dark:border-t-slate-800" />
                </span>
              </span>
            )}
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
            <Icon size={18} />
          </div>
        </div>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1 tabular-nums">{value}</p>
        {hint && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{hint}</p>
        )}
        {change != null && (
          <div className="flex items-center gap-1.5">
            {isUp && <TrendingUp size={14} className="text-emerald-500 dark:text-emerald-400" />}
            {isDown && <TrendingDown size={14} className="text-red-500 dark:text-red-400" />}
            {!isUp && !isDown && (
              <Minus size={14} className="text-slate-400 dark:text-slate-500" />
            )}
            <span
              className={clsx(
                "text-sm font-medium tabular-nums",
                isUp && "text-emerald-600 dark:text-emerald-400",
                isDown && "text-red-600 dark:text-red-400",
                !isUp && !isDown && "text-slate-500 dark:text-slate-400",
              )}
            >
              {formatPct(change)}
            </span>
            {changeLabel && (
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                {changeLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
