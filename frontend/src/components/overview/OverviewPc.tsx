import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";
import { DollarSign, FileText, Building2, Gauge } from "lucide-react";
import clsx from "clsx";
import type { OverviewPc as PcData } from "../../types/api";
import ScopeChip from "../common/ScopeChip";
import { useChartTheme } from "../../hooks/useChartTheme";

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtUsd(v: number, decimals = 2): string {
  return `$${v.toFixed(decimals)}`;
}

export default function OverviewPc({ data }: { data: PcData }) {
  const chart = useChartTheme();
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          Предельные цены
          <ScopeChip scope="market" />
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          цены конвертированы в USD по курсу рынка
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CoverageCard
          icon={FileText}
          label="Покрытие МНН"
          pct={data.mnn_coverage_pct}
          hint="доля МНН рынка под РС"
        />
        <CoverageCard
          icon={DollarSign}
          label="Покрытие денег"
          pct={data.money_coverage_pct}
          hint="доля USD рынка под РС"
        />
        <CeilingUtilization
          util={data.ceiling_utilization}
          marketAsp={data.market_asp_usd}
          pcMedian={data.unit_price_usd_stats?.median ?? null}
        />
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
            <Building2 size={14} />
            Записей всего
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
            {data.indexation_by_year.reduce((s, r) => s + r.count, 0)}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            строк в реестре РС
          </p>
        </div>
      </div>

      {data.unit_price_usd_stats && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Цена за единицу (USD)
            </h4>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              n = {data.unit_price_usd_stats.count}
            </span>
          </div>
          <BoxPlot stats={data.unit_price_usd_stats} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.indexation_by_year.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              Свежесть индексации (по году вступления в силу)
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={data.indexation_by_year}
                margin={{ top: 5, right: 5, bottom: 20, left: 0 }}
              >
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: chart.axisTick }}
                  stroke={chart.axis}
                  interval="preserveStartEnd"
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 10, fill: chart.axisTick }} stroke={chart.axis} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: `1px solid ${chart.tooltipBorder}`,
                    backgroundColor: chart.tooltipBg,
                    color: chart.tooltipText,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: chart.tooltipText }}
                  itemStyle={{ color: chart.tooltipText }}
                />
                <Bar dataKey="count" fill={chart.series.violet} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.top_owners.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Топ-10 владельцев РС
              </h4>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                свежесть = обновлено ≤ 12 мес
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <th className="text-left py-1.5 font-medium">Владелец</th>
                  <th className="text-right py-1.5 font-medium">Записей</th>
                  <th className="text-right py-1.5 font-medium">Свежих</th>
                </tr>
              </thead>
              <tbody>
                {data.top_owners.map((o) => (
                  <tr
                    key={o.name}
                    className="border-b border-slate-50 dark:border-slate-800 last:border-0"
                  >
                    <td className="py-1.5 text-slate-700 dark:text-slate-200 truncate max-w-[220px]">
                      {o.name}
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums text-slate-800 dark:text-slate-100">
                      {o.count}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      <span className="text-slate-500 dark:text-slate-400">{o.fresh_count}</span>
                      {o.fresh_share != null && (
                        <span className={clsx(
                          "ml-1.5 text-[11px] font-semibold",
                          o.fresh_share >= 0.5 ? "text-emerald-600 dark:text-emerald-400"
                            : o.fresh_share >= 0.2 ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400",
                        )}>
                          {(o.fresh_share * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function CoverageCard({
  icon: Icon, label, pct, hint,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  pct: number | null;
  hint: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
        <Icon size={14} />
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">{fmtPct(pct)}</p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{hint}</p>
    </div>
  );
}

function CeilingUtilization({
  util, marketAsp, pcMedian,
}: {
  util: number | null;
  marketAsp: number | null;
  pcMedian: number | null;
}) {
  const utilPct = util == null ? null : util * 100;
  // Меньше 100% = есть запас под потолком (хорошо для BD-входа)
  const headroom = utilPct == null ? null : 100 - utilPct;
  const tone =
    headroom == null
      ? "text-slate-400 dark:text-slate-500"
      : headroom >= 30
        ? "text-emerald-600 dark:text-emerald-400"
        : headroom >= 10
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
        <Gauge size={14} />
        Запас под потолком
      </div>
      <p className={clsx("text-2xl font-bold mt-1 tabular-nums", tone)}>
        {headroom == null ? "—" : `${headroom.toFixed(0)}%`}
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
        {util == null
          ? "нет данных о ПЦ/шт"
          : `рынок ${fmtUsd(marketAsp ?? 0)} / потолок ${fmtUsd(pcMedian ?? 0)}`}
      </p>
    </div>
  );
}

function BoxPlot({
  stats,
}: {
  stats: { min: number; p25: number; median: number; p75: number; max: number };
}) {
  const range = stats.max - stats.min || 1;
  const toPct = (v: number) => ((v - stats.min) / range) * 100;

  return (
    <div className="space-y-3">
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-px bg-slate-300 dark:bg-slate-600" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-6 bg-indigo-200 dark:bg-indigo-900/60 border border-indigo-400 dark:border-indigo-700 rounded-sm"
          style={{
            left: `${toPct(stats.p25)}%`,
            width: `${toPct(stats.p75) - toPct(stats.p25)}%`,
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-6 bg-indigo-700 dark:bg-indigo-300"
          style={{ left: `${toPct(stats.median)}%` }}
        />
      </div>
      <div className="grid grid-cols-5 gap-2 text-center text-xs">
        <div>
          <p className="text-slate-400 dark:text-slate-500">min</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{fmtUsd(stats.min)}</p>
        </div>
        <div>
          <p className="text-slate-400 dark:text-slate-500">p25</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{fmtUsd(stats.p25)}</p>
        </div>
        <div>
          <p className="text-indigo-500 dark:text-indigo-400">медиана</p>
          <p className="font-bold text-indigo-700 dark:text-indigo-300">{fmtUsd(stats.median)}</p>
        </div>
        <div>
          <p className="text-slate-400 dark:text-slate-500">p75</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{fmtUsd(stats.p75)}</p>
        </div>
        <div>
          <p className="text-slate-400 dark:text-slate-500">max</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{fmtUsd(stats.max)}</p>
        </div>
      </div>
    </div>
  );
}
