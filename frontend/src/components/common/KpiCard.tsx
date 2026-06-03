import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

interface Props {
  label: string;
  value: string;
  change?: number | null;
  changeLabel?: string;
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
  icon: Icon,
  gradient,
}: Props) {
  const isUp = change != null && change > 0;
  const isDown = change != null && change < 0;

  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div
        className={clsx(
          "absolute inset-0 opacity-[0.04]",
          gradient,
        )}
      />
      <div className="relative p-5">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            {label}
          </span>
          <div
            className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              gradient,
            )}
          >
            <Icon size={18} className="text-white" />
          </div>
        </div>
        <p className="text-2xl font-bold text-slate-800 mb-1">{value}</p>
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
  );
}
