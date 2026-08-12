import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import clsx from "clsx";
import type { OverviewPortfolio as PortfolioData } from "../../types/api";
import DrillDownRow from "../common/DrillDownRow";
import { ProducerDetailsLoader } from "../common/ProducerDetails";
import { CountryDetailsLoader } from "../common/CountryDetails";

const PIE_COLORS = [
  "#4f46e5", "#7c3aed", "#a78bfa", "#06b6d4",
  "#10b981", "#fbbf24", "#f97316", "#ef4444",
];

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function signed(v: number | null): string {
  if (v == null) return "—";
  const s = (v * 100).toFixed(1);
  return v >= 0 ? `+${s}%` : `${s}%`;
}

export default function OverviewPortfolio({
  data, marketId,
}: {
  data: PortfolioData;
  marketId: number;
}) {
  const navigate = useNavigate();
  const [expandedProducer, setExpandedProducer] = useState<string | null>(null);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        Структура портфеля
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">
              Топ-10 МНН
            </h4>
            <span className="text-xs text-slate-400">
              клик — открыть дашборд
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left py-1.5 font-medium">МНН</th>
                <th className="text-right py-1.5 font-medium">USD</th>
                <th className="text-right py-1.5 font-medium">Доля</th>
                <th className="text-right py-1.5 font-medium">Y/Y</th>
              </tr>
            </thead>
            <tbody>
              {data.top_mnn.map((m) => (
                <tr
                  key={m.mnn}
                  onClick={() =>
                    navigate(
                      `/market/${marketId}/dashboard?mnn=${encodeURIComponent(m.mnn)}`,
                    )
                  }
                  className="border-b border-slate-50 hover:bg-indigo-50/30 cursor-pointer"
                >
                  <td className="py-1.5 font-medium text-slate-700">
                    <span className="truncate max-w-[220px] block">{m.mnn}</span>
                  </td>
                  <td className="py-1.5 text-right">{fmtUsd(m.usd)}</td>
                  <td className="py-1.5 text-right text-slate-500">
                    {fmtPct(m.share)}
                  </td>
                  <td className="py-1.5 text-right">
                    <Growth value={m.growth} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">
              Топ-10 производителей
            </h4>
            <div className="text-xs text-slate-500">
              HHI:{" "}
              <span className="font-semibold text-slate-700">
                {data.hhi != null ? Math.round(data.hhi) : "—"}
              </span>{" "}
              · Top-3:{" "}
              <span className="font-semibold text-slate-700">
                {fmtPct(data.top3_share)}
              </span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="w-6"></th>
                <th className="text-left py-1.5 font-medium">Производитель</th>
                <th className="text-left py-1.5 font-medium">Страна</th>
                <th className="text-right py-1.5 font-medium">USD</th>
                <th className="text-right py-1.5 font-medium">Доля</th>
                <th className="text-right py-1.5 font-medium">Y/Y</th>
              </tr>
            </thead>
            <tbody>
              {data.top_producers.map((p) => (
                <DrillDownRow
                  key={p.name}
                  expanded={expandedProducer === p.name}
                  onToggle={() =>
                    setExpandedProducer((prev) =>
                      prev === p.name ? null : p.name,
                    )
                  }
                  colSpan={6}
                  columns={
                    <>
                      <td className="py-1.5 font-medium text-slate-700 truncate max-w-[220px]">
                        {p.name}
                      </td>
                      <td className="py-1.5 text-slate-600 text-xs truncate max-w-[120px]">
                        {p.country ?? "—"}
                      </td>
                      <td className="py-1.5 text-right">{fmtUsd(p.usd)}</td>
                      <td className="py-1.5 text-right text-slate-500">
                        {fmtPct(p.share)}
                      </td>
                      <td className="py-1.5 text-right">
                        <Growth value={p.growth} />
                      </td>
                    </>
                  }
                >
                  <ProducerDetailsLoader
                    marketId={marketId}
                    name={p.name}
                    scope="market"
                  />
                </DrillDownRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.atc_distribution.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              Распределение по классам ATC
            </h4>
            <ResponsiveContainer width="100%" height={Math.max(260, data.atc_distribution.length * 22)}>
              <BarChart
                data={data.atc_distribution}
                layout="vertical"
                margin={{ left: 20 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={fmtUsd}
                />
                <YAxis
                  type="category"
                  dataKey="atc"
                  tick={{ fontSize: 10 }}
                  width={140}
                  interval={0}
                />
                <Tooltip
                  formatter={(v) => fmtUsd(Number(v))}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="usd" fill="#4f46e5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.countries.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              Страны производства (по USD)
            </h4>
            <div className="flex items-center gap-4 flex-wrap">
              <ResponsiveContainer width="100%" height={220} minWidth={200}>
                <PieChart>
                  <Pie
                    data={data.countries}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={85}
                    dataKey="share"
                    nameKey="name"
                    stroke="none"
                    label={({ value }) => {
                      const v = Number(value ?? 0);
                      return v >= 0.05 ? `${(v * 100).toFixed(0)}%` : "";
                    }}
                    labelLine={false}
                  >
                    {data.countries.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={PIE_COLORS[idx % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, _n, p) => {
                      const raw = (p.payload as { usd?: number })?.usd ?? 0;
                      return [
                        `${fmtPct(Number(v))} (${fmtUsd(raw)})`,
                        p.payload?.name,
                      ];
                    }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100">
                    <th className="w-6"></th>
                    <th className="text-left py-1.5 font-medium">Страна</th>
                    <th className="text-right py-1.5 font-medium">USD</th>
                    <th className="text-right py-1.5 font-medium">Доля USD</th>
                    <th className="text-right py-1.5 font-medium">Доля UN</th>
                  </tr>
                </thead>
                <tbody>
                  {data.countries.map((c, idx) => (
                    <DrillDownRow
                      key={c.name}
                      expanded={expandedCountry === c.name}
                      onToggle={() =>
                        setExpandedCountry((prev) =>
                          prev === c.name ? null : c.name,
                        )
                      }
                      colSpan={5}
                      columns={
                        <>
                          <td className="py-1.5 font-medium text-slate-700">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-2 h-2 rounded flex-shrink-0"
                                style={{
                                  background:
                                    PIE_COLORS[idx % PIE_COLORS.length],
                                }}
                              />
                              <span className="truncate">{c.name}</span>
                            </div>
                          </td>
                          <td className="py-1.5 text-right">{fmtUsd(c.usd)}</td>
                          <td className="py-1.5 text-right text-slate-500">
                            {fmtPct(c.share)}
                          </td>
                          <td className="py-1.5 text-right text-slate-500">
                            {fmtPct(c.un_share)}
                          </td>
                        </>
                      }
                    >
                      <CountryDetailsLoader
                        marketId={marketId}
                        name={c.name}
                        scope="market"
                      />
                    </DrillDownRow>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Growth({ value }: { value: number | null }) {
  if (value == null)
    return <span className="text-slate-300">—</span>;
  const isUp = value >= 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isUp ? "text-emerald-600" : "text-red-600",
      )}
    >
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {signed(value)}
    </span>
  );
}

// Re-export for navigation arrow icon
export { ArrowRight };
