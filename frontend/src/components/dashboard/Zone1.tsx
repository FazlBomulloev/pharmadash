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
} from "recharts";
import KpiCard from "../common/KpiCard";
import ScopeChip from "../common/ScopeChip";
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
    usd: data.trend.usd[i],
    un: data.trend.un[i],
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          Ключевые показатели
          <ScopeChip scope="mnn" />
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
          label="Активные конкуренты"
          value={String(data.active_competitors)}
          hint={
            data.total_producers
              ? `значимых из ${data.total_producers} всего`
              : undefined
          }
          tooltip={
            <>
              <span className="block font-semibold mb-1 text-white">
                Как отбираются активные
              </span>
              <span className="block text-slate-300">
                Производитель попадает в «активные», если его продажи в{" "}
                последнем году ≥ порога.
              </span>
              <span className="block mt-2 font-mono text-[11px] text-emerald-300">
                порог = max($10&nbsp;000, 0.1% рынка)
              </span>
              {data.competitor_threshold_usd != null && (
                <span className="block mt-1.5 text-slate-400 text-[11px]">
                  Сейчас:{" "}
                  <span className="text-white font-medium">
                    $
                    {Math.round(
                      data.competitor_threshold_usd,
                    ).toLocaleString("ru-RU")}
                  </span>
                </span>
              )}
            </>
          }
          icon={Users}
          gradient="bg-gradient-to-br from-purple-500 to-pink-600"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendMini
          title="Динамика USD"
          data={chartData}
          dataKey="usd"
          color="#4f46e5"
          tickFmt={fmtCurrency}
        />
        <TrendMini
          title="Динамика UN"
          data={chartData}
          dataKey="un"
          color="#10b981"
          tickFmt={fmtNum}
        />
      </div>
    </div>
  );
}

function TrendMini({
  title, data, dataKey, color, tickFmt,
}: {
  title: string;
  data: { year: string; usd: number; un: number }[];
  dataKey: "usd" | "un";
  color: string;
  tickFmt: (v: number) => string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h4 className="text-sm font-semibold text-slate-700 mb-4">{title}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 12, fill: "#64748b" }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickFormatter={tickFmt}
            width={54}
          />
          <Tooltip
            formatter={(v) => tickFmt(Number(v))}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2.5}
            dot={{ fill: color, r: 5 }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
