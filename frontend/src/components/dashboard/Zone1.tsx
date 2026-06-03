import {
  DollarSign,
  Package,
  Users,
  Tag,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import KpiCard from "../common/KpiCard";
import type { KpiZone1 } from "../../types/api";

function fmtNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function fmtCurrency(v: number): string {
  return `$${fmtNum(v)}`;
}

const statusColors: Record<string, string> = {
  Growing: "bg-emerald-100 text-emerald-700",
  Declining: "bg-red-100 text-red-700",
  Stable: "bg-blue-100 text-blue-700",
  "Price-driven": "bg-amber-100 text-amber-700",
  "Price pressure": "bg-orange-100 text-orange-700",
  "N/A": "bg-slate-100 text-slate-500",
};

const statusLabels: Record<string, string> = {
  Growing: "Растущий",
  Declining: "Падающий",
  Stable: "Стабильный",
  "Price-driven": "Ценовой рост",
  "Price pressure": "Ценовое давление",
  "N/A": "Нет данных",
};

export default function Zone1({ data }: { data: KpiZone1 }) {
  const chartData = data.trend.years.map((year, i) => ({
    year,
    "USD продажи": data.trend.usd[i],
    "UN продажи": data.trend.un[i],
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">
          Ключевые показатели
        </h3>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[data.market_status] ?? statusColors["N/A"]}`}
        >
          {statusLabels[data.market_status] ?? data.market_status}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Продажи USD"
          value={fmtCurrency(data.usd_last_year)}
          change={data.usd_growth}
          changeLabel="г/г"
          icon={DollarSign}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
        />
        <KpiCard
          label="Продажи UN"
          value={fmtNum(data.un_last_year)}
          change={data.un_growth}
          changeLabel="г/г"
          icon={Package}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
        <KpiCard
          label="ASP"
          value={
            data.asp_last_year != null
              ? `$${data.asp_last_year.toFixed(2)}`
              : "—"
          }
          change={data.asp_growth}
          changeLabel="г/г"
          icon={Tag}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
        />
        <KpiCard
          label="Конкуренты"
          value={String(data.active_competitors)}
          icon={Users}
          gradient="bg-gradient-to-br from-purple-500 to-pink-600"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h4 className="text-sm font-semibold text-slate-700 mb-4">
          Динамика продаж
        </h4>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12, fill: "#64748b" }}
            />
            <YAxis
              yAxisId="usd"
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickFormatter={(v: number) => fmtNum(v)}
            />
            <YAxis
              yAxisId="un"
              orientation="right"
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickFormatter={(v: number) => fmtNum(v)}
            />
            <Tooltip
              formatter={(value, name) => [
                String(name).includes("USD")
                  ? fmtCurrency(Number(value))
                  : fmtNum(Number(value)),
                name,
              ]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
            />
            <Line
              yAxisId="usd"
              type="monotone"
              dataKey="USD продажи"
              stroke="#4f46e5"
              strokeWidth={2.5}
              dot={{ fill: "#4f46e5", r: 5 }}
              activeDot={{ r: 7 }}
            />
            <Line
              yAxisId="un"
              type="monotone"
              dataKey="UN продажи"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ fill: "#10b981", r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
