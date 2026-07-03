import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";
import { DollarSign, FileText, Building2 } from "lucide-react";
import type { OverviewPc as PcData } from "../../types/api";

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtUsd(v: number, decimals = 2): string {
  return `$${v.toFixed(decimals)}`;
}

export default function OverviewPc({ data }: { data: PcData }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Предельные цены
        </h3>
        <span className="text-xs text-slate-400">
          цены конвертированы в USD по курсу рынка
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">
            <Building2 size={14} />
            Записей всего
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-1">
            {data.indexation_by_year.reduce((s, r) => s + r.count, 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            строк в реестре РС
          </p>
        </div>
      </div>

      {data.unit_price_usd_stats && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">
              Цена за единицу (USD)
            </h4>
            <span className="text-xs text-slate-400">
              n = {data.unit_price_usd_stats.count}
            </span>
          </div>
          <BoxPlot stats={data.unit_price_usd_stats} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.indexation_by_year.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              Свежесть индексации (по году вступления в силу)
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={data.indexation_by_year}
                margin={{ top: 5, right: 5, bottom: 20, left: 0 }}
              >
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.top_owners.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              Топ-10 владельцев РС
            </h4>
            <table className="w-full text-sm">
              <tbody>
                {data.top_owners.map((o) => (
                  <tr
                    key={o.name}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="py-1.5 text-slate-700 truncate max-w-[260px]">
                      {o.name}
                    </td>
                    <td className="py-1.5 text-right font-medium">
                      {o.count}
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">
        <Icon size={14} />
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-800 mt-1">{fmtPct(pct)}</p>
      <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
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
        <div className="absolute inset-x-0 top-1/2 h-px bg-slate-300" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-6 bg-indigo-200 border border-indigo-400 rounded-sm"
          style={{
            left: `${toPct(stats.p25)}%`,
            width: `${toPct(stats.p75) - toPct(stats.p25)}%`,
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-6 bg-indigo-700"
          style={{ left: `${toPct(stats.median)}%` }}
        />
      </div>
      <div className="grid grid-cols-5 gap-2 text-center text-xs">
        <div>
          <p className="text-slate-400">min</p>
          <p className="font-semibold text-slate-700">{fmtUsd(stats.min)}</p>
        </div>
        <div>
          <p className="text-slate-400">p25</p>
          <p className="font-semibold text-slate-700">{fmtUsd(stats.p25)}</p>
        </div>
        <div>
          <p className="text-indigo-500">медиана</p>
          <p className="font-bold text-indigo-700">{fmtUsd(stats.median)}</p>
        </div>
        <div>
          <p className="text-slate-400">p75</p>
          <p className="font-semibold text-slate-700">{fmtUsd(stats.p75)}</p>
        </div>
        <div>
          <p className="text-slate-400">max</p>
          <p className="font-semibold text-slate-700">{fmtUsd(stats.max)}</p>
        </div>
      </div>
    </div>
  );
}
