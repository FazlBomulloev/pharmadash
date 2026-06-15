import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Shield,
  FileCheck,
  DollarSign,
} from "lucide-react";
import clsx from "clsx";
import type { Zone2Data } from "../../types/api";

const PIE_COLORS = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#6366f1",
];

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function concentrationLabel(hhi: number | null): {
  text: string;
  color: string;
} {
  if (hhi == null) return { text: "Нет данных", color: "text-slate-400" };
  if (hhi < 1500)
    return { text: "Низкая концентрация", color: "text-emerald-600" };
  if (hhi < 2500)
    return { text: "Умеренная концентрация", color: "text-amber-600" };
  return { text: "Высокая концентрация", color: "text-red-600" };
}

export default function Zone2({ data }: { data: Zone2Data }) {
  const concentration = concentrationLabel(data.hhi);

  const sectorData = [
    { name: "Розница (RET)", value: data.ret_share ?? 0 },
    { name: "Госпитальный (HOS)", value: data.hos_share ?? 0 },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-800">
        Структура рынка
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sector Split */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Доля секторов
          </h4>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={sectorData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                dataKey="value"
                stroke="none"
              >
                <Cell fill="#4f46e5" />
                <Cell fill="#10b981" />
              </Pie>
              <Tooltip
                formatter={(value) => fmtPct(Number(value))}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-xs mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              RET {fmtPct(data.ret_share)}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              HOS {fmtPct(data.hos_share)}
            </div>
          </div>
        </div>

        {/* Concentration */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Концентрация
          </h4>
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-800">
                {data.hhi != null ? Math.round(data.hhi) : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Индекс HHI
              </p>
              <p className={`text-sm font-medium mt-2 ${concentration.color}`}>
                {concentration.text}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Лидер</span>
                <span className="font-medium text-slate-700">
                  {fmtPct(data.leader_share)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Топ-3</span>
                <span className="font-medium text-slate-700">
                  {fmtPct(data.top3_share)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Regulatory */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Регуляторика
          </h4>
          <div className="space-y-3">
            <div className={clsx(
              "flex items-center gap-3 p-3 rounded-lg",
              data.jnvlp_flag ? "bg-red-50" : "bg-emerald-50",
            )}>
              <Shield size={20} className={
                data.jnvlp_flag ? "text-red-500" : "text-emerald-500"
              } />
              <div>
                <p className="text-xs text-slate-500">ЖНВЛП</p>
                <p className="text-sm font-medium text-slate-700">{data.znvlp}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <FileCheck size={20} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">ГРЛС</p>
                <p className="text-sm font-medium text-slate-700">{data.grls}</p>
              </div>
            </div>

            {data.pc_stats && (
              <div className={clsx(
                "flex items-center gap-3 p-3 rounded-lg",
                data.pc_flag ? "bg-amber-50" : "bg-slate-50",
              )}>
                <DollarSign size={20} className={
                  data.pc_flag ? "text-amber-600" : "text-slate-400"
                } />
                <div>
                  <p className="text-xs text-slate-500">Предельная цена</p>
                  <p className="text-sm font-medium text-slate-700">
                    {data.pc_stats.min.toFixed(0)} – {data.pc_stats.max.toFixed(0)} &#8381;
                    <span className="text-xs text-slate-400 ml-1">
                      ({data.pc_stats.count} записей)
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Competitors */}
      {data.top_competitors.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Топ-10 конкурентов
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">
                    #
                  </th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">
                    Производитель
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    USD
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    Доля
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    ASP
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    USD рост
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    UN рост
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.top_competitors.map((c, i) => (
                  <tr
                    key={c.corporation}
                    className="border-b border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="py-2.5 px-3 text-slate-400">
                      {i + 1}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                        {c.corporation}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {fmtNum(c.usd_last_year)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{
                              width: `${Math.min(c.share * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right">
                          {fmtPct(c.share)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {c.asp != null ? `$${c.asp.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <GrowthBadge value={c.usd_growth} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <GrowthBadge value={c.un_growth} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Forms & Countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.forms.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">
              Лекарственные формы
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.forms.slice(0, 8)}
                layout="vertical"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(v: number) => fmtPct(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  formatter={(value) => fmtPct(Number(value))}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="share"
                  fill="#6366f1"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.countries.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">
              Страны производства
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.countries.slice(0, 8)}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="share"
                  nameKey="name"
                  stroke="none"
                  label={(props) => {
                    const s = Number(props.value ?? 0);
                    return s > 0.05
                      ? `${props.name} ${(s * 100).toFixed(0)}%`
                      : "";
                  }}
                  labelLine={false}
                >
                  {data.countries.slice(0, 8).map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={PIE_COLORS[idx % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => fmtPct(Number(value))}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const isUp = value > 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isUp ? "text-emerald-600" : "text-red-600",
      )}
    >
      {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {(value * 100).toFixed(1)}%
    </span>
  );
}
