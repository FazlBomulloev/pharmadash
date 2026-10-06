import { Link, useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from "recharts";
import { ArrowRight, Target } from "lucide-react";
import type { OverviewDecision as DecisionData } from "../../types/api";
import ScopeChip from "../common/ScopeChip";
import { useChartTheme } from "../../hooks/useChartTheme";
import {
  CATEGORY_HEX, CATEGORY_LABEL, CATEGORY_ORDER, fmtUsd,
} from "../scoring/meta";

export default function OverviewDecision({
  data, marketId,
}: {
  data: DecisionData;
  marketId: number;
}) {
  const navigate = useNavigate();
  const chart = useChartTheme();
  const pieData = CATEGORY_ORDER.map((c) => ({
    name: CATEGORY_LABEL[c],
    value: data.categories[c] ?? 0,
    color: CATEGORY_HEX[c],
  }));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          Скоринг МНН
          <ScopeChip scope="market" />
        </h3>
        <Link
          to={`/market/${marketId}/scoring`}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
        >
          Весь скоринг
          <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
            Категории ({data.total} МНН, прошли фильтр {data.passed})
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                dataKey="value"
                nameKey="name"
                stroke="none"
              >
                {pieData.map((d, idx) => (
                  <Cell key={idx} fill={d.color} />
                ))}
              </Pie>
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
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded"
                    style={{ background: d.color }}
                  />
                  {d.name}
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {d.value}
                  <span className="text-slate-400 dark:text-slate-500 ml-1">
                    ({data.total > 0 ? ((d.value / data.total) * 100).toFixed(0) : 0}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
              <Target size={14} />
            </span>
            Лучшие по скорингу среди прошедших фильтр
          </h4>
          {data.top.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ни один МНН выборки не прошёл стоп-фильтр.
            </p>
          ) : (
            <div className="space-y-1">
              {data.top.map((item) => (
                <button
                  key={item.mnn}
                  onClick={() =>
                    navigate(
                      `/market/${marketId}/dashboard?mnn=${encodeURIComponent(item.mnn)}`,
                    )
                  }
                  className="w-full text-left flex items-center gap-3 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
                >
                  <span className="w-8 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                    {item.rank}
                  </span>
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: CATEGORY_HEX[item.category] }}
                  />
                  <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {item.mnn}
                  </span>
                  <span className="hidden md:block w-32 truncate text-xs text-slate-500 dark:text-slate-400">
                    {item.direction}
                  </span>
                  <span className="w-12 text-right text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    {item.total.toFixed(1)}
                  </span>
                  <span className="w-16 text-right text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                    {fmtUsd(item.usd)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
