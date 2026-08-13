import { AlertTriangle, ChevronDown, Users } from "lucide-react";
import clsx from "clsx";
import type { Zone3Data, KpiZone1, Zone2Data, AtcBenchmark } from "../../types/api";

const COLOR_BG: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700 border-emerald-300",
  yellow: "bg-amber-100 text-amber-700 border-amber-300",
  orange: "bg-orange-100 text-orange-700 border-orange-300",
  red: "bg-red-100 text-red-700 border-red-300",
};
const COLOR_FILL: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};
const COLOR_LABEL: Record<string, string> = {
  "Highly Attractive": "Очень привлекателен",
  Attractive: "Привлекателен",
  "Conditionally Attractive": "Условно привлекателен",
  Unattractive: "Непривлекателен",
};

interface Props {
  mnn: string;
  zone1: KpiZone1;
  zone2: Zone2Data;
  zone3: Zone3Data;
  atcBenchmark: AtcBenchmark[];
}

export default function MnnScoreHeader({
  mnn, zone1, zone2, zone3, atcBenchmark,
}: Props) {
  const atc3 = atcBenchmark[0]?.atc3;
  const flagsCount = zone3.red_flags.length;
  const score = zone3.total_score;
  const color = zone3.recommendation_color;

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* MNN + ATC */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="text-base font-semibold text-slate-800 truncate max-w-[420px]"
              title={mnn}
            >
              {mnn}
            </span>
            {atc3 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-slate-100 text-slate-600 rounded uppercase">
                {atc3}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Users size={11} />
              {zone1.active_competitors} акт. конк.
            </span>
            {zone2.grls_active_count > 0 && (
              <span>{zone2.grls_active_count} активных РУ</span>
            )}
          </div>
        </div>

        {/* score bullet */}
        <div className="w-56">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Attractiveness
            </span>
            <span className="text-sm font-bold text-slate-800 tabular-nums">
              {score.toFixed(0)}
              <span className="text-[11px] font-normal text-slate-400"> / 100</span>
            </span>
          </div>
          <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={clsx("h-full rounded-full transition-all", COLOR_FILL[color] ?? "bg-slate-400")}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>

        {/* recommendation pill */}
        <div
          className={clsx(
            "px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5",
            COLOR_BG[color] ?? "bg-slate-100 text-slate-600 border-slate-200",
          )}
        >
          <span className={clsx("w-2 h-2 rounded-full", COLOR_FILL[color])} aria-hidden />
          {COLOR_LABEL[zone3.recommendation] ?? zone3.recommendation}
        </div>

        {/* flags shortcut */}
        {flagsCount > 0 && (
          <button
            onClick={() => scrollTo("mnn-zone3-details")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
          >
            <AlertTriangle size={12} />
            {flagsCount} {declineFlags(flagsCount)}
            <ChevronDown size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function declineFlags(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "красный флаг";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
    return "красных флага";
  return "красных флагов";
}
