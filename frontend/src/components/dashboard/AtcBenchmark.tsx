import { Layers, TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";
import type { AtcBenchmark as Data } from "../../types/api";

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const s = (v * 100).toFixed(1);
  return v >= 0 ? `+${s}%` : `${s}%`;
}
function fmtNum(v: number | null): string {
  if (v == null) return "—";
  return Math.round(v).toString();
}

export default function AtcBenchmark({ data }: { data: Data }) {
  return (
    <section className="bg-gradient-to-br from-indigo-50/60 to-purple-50/40 dark:from-indigo-950/40 dark:to-purple-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Layers size={18} className="text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Бенчмарк по терапевтическому классу
          </h3>
          <span className="px-2 py-0.5 text-xs font-bold bg-indigo-600 dark:bg-indigo-500 text-white rounded uppercase tracking-wide">
            {data.atc3}
          </span>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-300">
          МНН в классе: <span className="font-semibold">{data.mnn_count}</span>
          {data.our.rank_by_usd != null && (
            <>
              {" · "}
              позиция нашего МНН:{" "}
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                #{data.our.rank_by_usd}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BulletMetric
          label="USD Y3"
          ours={data.our.usd}
          median={data.class_stats.usd_median}
          p75={data.class_stats.usd_p75}
          max={data.class_stats.usd_max}
          fmt={fmtUsd}
          higherIsBetter
        />
        <BulletMetric
          label="Рост USD"
          ours={data.our.growth}
          median={data.class_stats.growth_median}
          fmt={fmtPct}
          symmetric
          showGrowthIcon
          higherIsBetter
        />
        <BulletMetric
          label="HHI"
          ours={data.our.hhi}
          median={data.class_stats.hhi_median}
          fmt={fmtNum}
          max={10000}
          higherIsBetter={false}
        />
        <BulletMetric
          label="Активных конкурентов"
          ours={data.our.competitors}
          median={data.class_stats.competitors_median}
          fmt={fmtNum}
          higherIsBetter
        />
      </div>

      {data.top_peers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-900">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Топ-5 МНН класса по USD
          </p>
          <div className="flex flex-wrap gap-2">
            {data.top_peers.map((p, idx) => (
              <span
                key={p.mnn}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs",
                  idx === 0
                    ? "bg-indigo-600 dark:bg-indigo-500 text-white font-semibold"
                    : "bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900 text-slate-700 dark:text-slate-200",
                )}
              >
                <span className="opacity-70">#{idx + 1}</span>
                <span>{p.mnn}</span>
                <span className="opacity-70">{fmtUsd(p.usd)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

interface BulletProps {
  label: string;
  ours: number | null;
  median: number | null;
  p75?: number | null;
  max?: number | null;
  fmt: (v: number | null) => string;
  higherIsBetter: boolean;
  /** For growth: scale symmetric around 0 rather than 0 → max. */
  symmetric?: boolean;
  showGrowthIcon?: boolean;
}

function BulletMetric({
  label, ours, median, p75, max, fmt, higherIsBetter, symmetric, showGrowthIcon,
}: BulletProps) {
  const better =
    ours != null && median != null
      ? higherIsBetter
        ? ours > median
        : ours < median
      : null;

  const bar = computeScale({ ours, median, p75, max, symmetric });

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-indigo-100 dark:border-indigo-900">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
          {label}
        </p>
        {better != null && (
          <span
            className={clsx(
              "text-[10px] font-semibold uppercase tracking-wide",
              better ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
            )}
          >
            {better ? "лучше медианы" : "хуже медианы"}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          {fmt(ours)}
        </span>
        {showGrowthIcon && ours != null && (
          ours >= 0 ? (
            <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TrendingDown size={14} className="text-red-600 dark:text-red-400" />
          )
        )}
      </div>

      {bar ? (
        <>
          <div
            className="relative h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-visible"
            role="img"
            aria-label={`Наш: ${fmt(ours)}, медиана: ${fmt(median)}${p75 != null ? `, p75: ${fmt(p75)}` : ""}`}
          >
            {/* median → p75 shaded range */}
            {bar.p50Pct != null && bar.p75Pct != null && (
              <div
                className="absolute top-0 h-full bg-indigo-200/60 dark:bg-indigo-900/60"
                style={{
                  left: `${Math.min(bar.p50Pct, bar.p75Pct)}%`,
                  width: `${Math.abs(bar.p75Pct - bar.p50Pct)}%`,
                }}
                aria-hidden
              />
            )}
            {/* median tick */}
            {bar.p50Pct != null && (
              <div
                className="absolute -top-0.5 h-3 w-0.5 bg-indigo-500 dark:bg-indigo-400"
                style={{ left: `${bar.p50Pct}%` }}
                title={`медиана ${fmt(median)}`}
                aria-hidden
              />
            )}
            {/* our marker */}
            {bar.ourPct != null && (
              <div
                className={clsx(
                  "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 shadow",
                  better === null
                    ? "bg-slate-500 dark:bg-slate-400"
                    : better
                      ? "bg-emerald-500 dark:bg-emerald-400"
                      : "bg-red-500 dark:bg-red-400",
                )}
                style={{
                  left: `${bar.ourPct}%`,
                  transform: "translate(-50%, -50%)",
                }}
                title={`наш ${fmt(ours)}`}
                aria-hidden
              />
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
            <span>{fmt(bar.minValue)}</span>
            <span>
              медиана <span className="text-slate-600 dark:text-slate-300 font-medium">{fmt(median)}</span>
            </span>
            <span>{fmt(bar.maxValue)}</span>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Недостаточно данных для сравнения</p>
      )}
    </div>
  );
}

interface Scale {
  minValue: number | null;
  maxValue: number | null;
  ourPct: number | null;
  p50Pct: number | null;
  p75Pct: number | null;
}

/** Convert values to 0-100 percentage positions on a common scale. */
function computeScale({
  ours, median, p75, max, symmetric,
}: {
  ours: number | null;
  median: number | null;
  p75?: number | null;
  max?: number | null;
  symmetric?: boolean;
}): Scale | null {
  if (ours == null && median == null) return null;

  let lo: number;
  let hi: number;

  if (symmetric) {
    // For growth-like metrics: symmetric around 0.
    const magnitude = Math.max(
      Math.abs(ours ?? 0),
      Math.abs(median ?? 0),
      0.10,
    );
    lo = -magnitude;
    hi = magnitude;
  } else {
    lo = 0;
    hi =
      max ??
      Math.max(
        (ours ?? 0),
        (median ?? 0) * 2,
        (p75 ?? 0) * 1.2,
        1,
      );
  }

  const span = hi - lo || 1;
  const pct = (v: number | null | undefined) =>
    v == null ? null : Math.min(100, Math.max(0, ((v - lo) / span) * 100));

  return {
    minValue: lo,
    maxValue: hi,
    ourPct: pct(ours),
    p50Pct: pct(median),
    p75Pct: pct(p75 ?? undefined),
  };
}
