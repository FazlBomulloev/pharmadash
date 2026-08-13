import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";
import clsx from "clsx";
import type { OverviewVolume as VolumeData } from "../../types/api";
import ScopeChip from "../common/ScopeChip";
import SplitBar from "../common/SplitBar";

function fmtUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtUn(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
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

export default function OverviewVolume({ data }: { data: VolumeData }) {
  const trend = data.years_labels.map((y, idx) => ({
    year: y,
    usd: [data.usd_y1, data.usd_y2, data.usd_y3][idx] ?? 0,
    un: [data.un_y1, data.un_y2, data.un_y3][idx] ?? 0,
  }));

  const retHos = [
    { name: "Розница", value: data.ret_share ?? 0, color: "bg-indigo-500" },
    { name: "Госпиталь", value: data.hos_share ?? 0, color: "bg-violet-400" },
  ];
  const bgG = [
    { name: "Брендированные (БГ)", value: data.bg_share ?? 0, color: "bg-emerald-500" },
    { name: "Дженерики (Г)", value: data.g_share ?? 0, color: "bg-amber-500" },
  ];

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        Объём рынка
        <ScopeChip scope="market" />
      </h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={DollarSign}
          label="Объём USD"
          primary={fmtUsd(data.usd_y3)}
          growth={data.usd_growth}
          subtitle={
            data.usd_cagr_2y != null
              ? `CAGR 2y: ${signed(data.usd_cagr_2y)}`
              : undefined
          }
        />
        <Kpi
          icon={Package}
          label="Объём UN"
          primary={fmtUn(data.un_y3)}
          growth={data.un_growth}
          subtitle={
            data.un_cagr_2y != null
              ? `CAGR 2y: ${signed(data.un_cagr_2y)}`
              : undefined
          }
        />
        <Kpi
          icon={DollarSign}
          label="ASP"
          primary={
            data.asp_y3 != null
              ? `$${data.asp_y3.toFixed(2)}`
              : "—"
          }
          growth={data.asp_growth}
        />
        <Kpi
          icon={DollarSign}
          label="Доля RET / HOS"
          primary={`${fmtPct(data.ret_share)} / ${fmtPct(data.hos_share)}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <TrendMini
            title="Динамика USD"
            data={trend}
            dataKey="usd"
            color="#4f46e5"
            tickFmt={fmtUsd}
          />
          <TrendMini
            title="Динамика UN"
            data={trend}
            dataKey="un"
            color="#10b981"
            tickFmt={fmtUn}
          />
        </div>

        <div className="space-y-4">
          <SplitBar title="RET vs HOS" segments={retHos} />
          {(data.bg_share != null || data.g_share != null) && (
            <SplitBar title="БГ vs Г (по USD)" segments={bgG} />
          )}
        </div>
      </div>
    </section>
  );
}

function Kpi({
  icon: Icon, label, primary, growth, subtitle,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  primary: string;
  growth?: number | null;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold">
        <Icon size={14} />
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-800 mt-1">{primary}</p>
      <div className="flex items-center gap-3 mt-1">
        {growth !== undefined && growth !== null && (
          <span
            className={clsx(
              "flex items-center gap-1 text-xs font-medium",
              growth >= 0 ? "text-emerald-600" : "text-red-600",
            )}
          >
            {growth >= 0 ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {signed(growth)}
          </span>
        )}
        {subtitle && (
          <span className="text-[11px] text-slate-400">{subtitle}</span>
        )}
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-3">{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
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
            strokeWidth={2}
            dot={{ r: 4, fill: color }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

