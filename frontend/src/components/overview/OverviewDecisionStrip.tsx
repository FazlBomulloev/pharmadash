import { useNavigate } from "react-router-dom";
import { Target, ShieldOff, ArrowRight } from "lucide-react";
import clsx from "clsx";
import type { OverviewDecision } from "../../types/api";

const COLOR_BG: Record<string, string> = {
  green: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
  yellow: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  orange: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900",
  red: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
};
const COLOR_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};
const COLOR_LABEL: Record<string, string> = {
  green: "Highly Attractive",
  yellow: "Attractive",
  orange: "Conditional",
  red: "Unattractive",
};

interface Props {
  data: OverviewDecision;
  marketId: number;
}

export default function OverviewDecisionStrip({ data, marketId }: Props) {
  const navigate = useNavigate();

  const buckets = ["green", "yellow", "orange", "red"] as const;
  const total = buckets.reduce(
    (s, c) => s + (data.distribution[c] ?? 0),
    0,
  );
  if (total === 0) return null;

  const topOpp = data.top_opportunities.slice(0, 3);
  const topAvoid = data.top_avoid.slice(0, 2);

  function openMnn(mnn: string) {
    navigate(
      `/market/${marketId}/dashboard?mnn=${encodeURIComponent(mnn)}`,
    );
  }

  function scrollToDetails() {
    document
      .getElementById("overview-decision-details")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      aria-label="Decision Engine — сводка"
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-5 py-4"
    >
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Decision Engine
          </h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {total} МНН
          </span>
        </div>
        <button
          onClick={scrollToDetails}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          Детали
          <ArrowRight size={12} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
        {/* distribution */}
        <div className="flex flex-col gap-1.5">
          {buckets.map((c) => {
            const count = data.distribution[c] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div
                key={c}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={clsx("w-2 h-2 rounded-full", COLOR_DOT[c])}
                  aria-hidden
                />
                <span className="text-slate-600 dark:text-slate-300 flex-1 min-w-0 truncate">
                  {COLOR_LABEL[c]}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums w-8 text-right">
                  {count}
                </span>
                <span className="text-slate-400 dark:text-slate-500 tabular-nums w-10 text-right text-[11px]">
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* opportunities + avoid */}
        <div className="space-y-2.5">
          {topOpp.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Target size={12} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                  Топ возможности
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topOpp.map((item) => (
                  <MnnPill
                    key={item.mnn}
                    mnn={item.mnn}
                    score={item.total_score}
                    color={item.color}
                    onClick={() => openMnn(item.mnn)}
                  />
                ))}
              </div>
            </div>
          )}
          {topAvoid.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldOff size={12} className="text-red-600 dark:text-red-400" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                  Избегать
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topAvoid.map((item) => (
                  <MnnPill
                    key={item.mnn}
                    mnn={item.mnn}
                    score={item.total_score}
                    color={item.color}
                    onClick={() => openMnn(item.mnn)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MnnPill({
  mnn, score, color, onClick,
}: {
  mnn: string;
  score: number;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md border text-xs font-medium max-w-[240px] hover:shadow-sm transition-shadow",
        COLOR_BG[color] ?? "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700",
      )}
      title={mnn}
    >
      <span className="truncate">{mnn}</span>
      <span className="ml-1 px-1.5 py-0.5 rounded bg-white/70 dark:bg-black/30 text-[10px] font-bold tabular-nums">
        {score.toFixed(0)}
      </span>
    </button>
  );
}
