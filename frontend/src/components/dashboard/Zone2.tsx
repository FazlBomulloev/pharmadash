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
import type { Zone2Data, FormConcentration } from "../../types/api";

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

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtUn(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function concentrationLabel(hhi: number | null): {
  text: string;
  color: string;
} {
  if (hhi == null) return { text: "Нет данных", color: "text-slate-400" };
  if (hhi < 1500)
    return { text: "Низкая", color: "text-emerald-600" };
  if (hhi < 2500)
    return { text: "Умеренная", color: "text-amber-600" };
  return { text: "Высокая", color: "text-red-600" };
}

export default function Zone2({ data }: { data: Zone2Data }) {
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

        {/* Regulatory */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Регуляторика
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

            {data.pc_stats ? (
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
            ) : (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <DollarSign size={20} className="text-slate-300" />
                <div>
                  <p className="text-xs text-slate-500">Предельная цена</p>
                  <p className="text-sm font-medium text-slate-400">Нет данных</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Concentration by form */}
      <ConcentrationByForm items={data.concentration_by_form ?? []} />

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
                      {fmtUsd(c.usd_last_year)}
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
          <CountriesPie countries={data.countries} />
        )}
      </div>
    </div>
  );
}

function CountriesPie({
  countries,
}: {
  countries: Zone2Data["countries"];
}) {
  const top = countries.slice(0, 8);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-4">
        Страны производства
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <CountryPieChart
          data={top}
          mode="usd"
          title="По продажам, USD"
        />
        <CountryPieChart
          data={top}
          mode="un"
          title="По продажам, UN"
        />
      </div>
    </div>
  );
}

function CountryPieChart({
  data,
  mode,
  title,
}: {
  data: Zone2Data["countries"];
  mode: "usd" | "un";
  title: string;
}) {
  const dataKey = mode === "usd" ? "share" : "un_share";
  const valueKey = mode === "usd" ? "usd" : "un";
  const fmtAbsolute = mode === "usd" ? fmtUsd : fmtUn;

  return (
    <div>
      <p className="text-xs font-medium text-slate-500 text-center mb-1">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={75}
            dataKey={dataKey}
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
            {data.map((_, idx) => (
              <Cell
                key={idx}
                fill={PIE_COLORS[idx % PIE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, props) => {
              const pct = fmtPct(Number(value));
              const raw = Number(
                (props.payload as Record<string, number>)?.[valueKey] ?? 0,
              );
              return [`${pct} (${fmtAbsolute(raw)})`, props.payload?.name];
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
  );
}

function ConcentrationByForm({
  items,
}: {
  items: FormConcentration[];
}) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-700">
          Концентрация рынка по формам
        </h4>
        <span className="text-xs text-slate-400">
          расчёт по всему МНН, без учёта фильтров
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="text-left py-2 px-3 font-medium">Форма</th>
              <th className="text-right py-2 px-3 font-medium">USD</th>
              <th className="text-right py-2 px-3 font-medium">Доля МНН</th>
              <th className="text-right py-2 px-3 font-medium">HHI</th>
              <th className="text-right py-2 px-3 font-medium">Лидер</th>
              <th className="text-right py-2 px-3 font-medium">Топ-3</th>
              <th className="text-right py-2 px-3 font-medium">
                Активн. конк.
              </th>
              <th className="text-left py-2 px-3 font-medium">Уровень</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => {
              const c = concentrationLabel(f.hhi);
              return (
                <tr
                  key={f.name}
                  className="border-b border-slate-100 hover:bg-slate-50/50"
                >
                  <td className="py-2.5 px-3 font-medium text-slate-700">
                    {f.name}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {fmtUsd(f.usd_total)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-500">
                    {fmtPct(f.share)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {Math.round(f.hhi)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {fmtPct(f.leader_share)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {fmtPct(f.top3_share)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {f.active_competitors}
                    <span className="text-xs text-slate-400 ml-1">
                      / {f.producer_count}
                    </span>
                  </td>
                  <td className={clsx("py-2.5 px-3 font-medium", c.color)}>
                    {c.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
