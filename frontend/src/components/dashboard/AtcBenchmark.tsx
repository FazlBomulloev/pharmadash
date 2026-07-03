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

export default function AtcBenchmark({ data }: { data: Data }) {
  return (
    <section className="bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Layers size={18} className="text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-700">
            Бенчмарк по терапевтическому классу
          </h3>
          <span className="px-2 py-0.5 text-xs font-bold bg-indigo-600 text-white rounded uppercase tracking-wide">
            {data.atc3}
          </span>
        </div>
        <div className="text-xs text-slate-600">
          МНН в классе: <span className="font-semibold">{data.mnn_count}</span>
          {data.our.rank_by_usd != null && (
            <>
              {" · "}
              позиция нашего МНН:{" "}
              <span className="font-semibold text-indigo-700">
                #{data.our.rank_by_usd}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric
          label="USD Y3"
          ours={fmtUsd(data.our.usd)}
          median={fmtUsd(data.class_stats.usd_median)}
          p75={fmtUsd(data.class_stats.usd_p75)}
          above={
            data.our.usd != null &&
            data.class_stats.usd_median != null
              ? data.our.usd > data.class_stats.usd_median
              : null
          }
        />
        <Metric
          label="Рост USD"
          ours={fmtPct(data.our.growth)}
          median={fmtPct(data.class_stats.growth_median)}
          above={
            data.our.growth != null && data.class_stats.growth_median != null
              ? data.our.growth > data.class_stats.growth_median
              : null
          }
          ourIcon={data.our.growth}
        />
        <Metric
          label="HHI"
          ours={data.our.hhi != null ? Math.round(data.our.hhi).toString() : "—"}
          median={
            data.class_stats.hhi_median != null
              ? Math.round(data.class_stats.hhi_median).toString()
              : "—"
          }
          // Низкий HHI лучше — инвертируем
          above={
            data.our.hhi != null && data.class_stats.hhi_median != null
              ? data.our.hhi < data.class_stats.hhi_median
              : null
          }
          aboveLabel="ниже"
          belowLabel="выше"
        />
        <Metric
          label="Конкурентов"
          ours={data.our.competitors.toString()}
          median={
            data.class_stats.competitors_median != null
              ? data.class_stats.competitors_median.toFixed(0)
              : "—"
          }
        />
      </div>

      {data.top_peers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-indigo-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Топ-5 МНН класса по USD
          </p>
          <div className="flex flex-wrap gap-2">
            {data.top_peers.map((p, idx) => (
              <span
                key={p.mnn}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs",
                  idx === 0
                    ? "bg-indigo-600 text-white font-semibold"
                    : "bg-white border border-indigo-100 text-slate-700",
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

function Metric({
  label, ours, median, p75, above, aboveLabel = "выше", belowLabel = "ниже",
  ourIcon,
}: {
  label: string;
  ours: string;
  median: string;
  p75?: string;
  above?: boolean | null;
  aboveLabel?: string;
  belowLabel?: string;
  ourIcon?: number | null;
}) {
  return (
    <div className="bg-white rounded-lg p-3 border border-indigo-100">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-xl font-bold text-slate-800">{ours}</span>
        {ourIcon != null && (
          ourIcon >= 0 ? (
            <TrendingUp size={14} className="text-emerald-600" />
          ) : (
            <TrendingDown size={14} className="text-red-600" />
          )
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-1">
        медиана: <span className="font-medium text-slate-700">{median}</span>
        {p75 && (
          <>
            {" · "}p75: <span className="font-medium text-slate-700">{p75}</span>
          </>
        )}
      </p>
      {above != null && (
        <p
          className={clsx(
            "text-[10px] mt-0.5 font-semibold uppercase tracking-wide",
            above ? "text-emerald-600" : "text-red-600",
          )}
        >
          {above ? `${aboveLabel} медианы` : `${belowLabel} медианы`}
        </p>
      )}
    </div>
  );
}
