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
  gradient: string;
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
  gradient,
}: Props) {
  const isUp = change != null && change > 0;
  const isDown = change != null && change < 0;

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300">
        <div
          className={clsx("absolute inset-0 opacity-[0.04]", gradient)}
        />
        <div className="relative p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
                {label}
              </span>
              {tooltip && (
                <span className="relative inline-flex group/tt">
                  <Info
                    size={12}
                    className="text-slate-400 hover:text-indigo-500 cursor-help flex-shrink-0 transition-colors"
                  />
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 z-50 opacity-0 translate-y-1 group-hover/tt:opacity-100 group-hover/tt:translate-y-0 transition-all duration-150 ease-out"
                  >
                    <span className="block bg-slate-900 text-white text-xs leading-relaxed rounded-lg shadow-xl ring-1 ring-white/10 px-3 py-2 text-left font-normal normal-case tracking-normal">
                      {tooltip}
                    </span>
                    <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-900" />
                  </span>
                </span>
              )}
            </div>
            <div
              className={clsx(
                "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                gradient,
              )}
            >
              <Icon size={18} className="text-white" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mb-1">{value}</p>
          {hint && (
            <p className="text-xs text-slate-500 mb-1">{hint}</p>
          )}
          {change != null && (
            <div className="flex items-center gap-1.5">
              {isUp && <TrendingUp size={14} className="text-emerald-500" />}
              {isDown && <TrendingDown size={14} className="text-red-500" />}
              {!isUp && !isDown && (
                <Minus size={14} className="text-slate-400" />
              )}
              <span
                className={clsx(
                  "text-sm font-medium",
                  isUp && "text-emerald-600",
                  isDown && "text-red-600",
                  !isUp && !isDown && "text-slate-500",
                )}
              >
                {formatPct(change)}
              </span>
              {changeLabel && (
                <span className="text-xs text-slate-400 ml-1">
                  {changeLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
