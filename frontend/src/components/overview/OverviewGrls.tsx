import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";
import {
  ShieldCheck, Users, AlertTriangle, Globe2,
} from "lucide-react";
import clsx from "clsx";
import type { OverviewGrls as GrlsData } from "../../types/api";

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export default function OverviewGrls({ data }: { data: GrlsData }) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        ГРЛС
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat
          icon={ShieldCheck}
          label="Активных РУ"
          value={data.active_count.toString()}
          color="indigo"
        />
        <Stat
          icon={Users}
          label="Регистрантов"
          value={data.registrants_count.toString()}
          color="emerald"
        />
        <Stat
          icon={Globe2}
          label="Иностранные"
          value={fmtPct(data.foreign_share)}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {data.registrations_by_year.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              Регистрации РУ по годам
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.registrations_by_year}
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
                <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Окно истечения РУ
          </h4>
          <ExpiryRow
            label="В ближайший год"
            value={data.expiring_1y}
            total={data.active_count}
            color="bg-red-500"
          />
          <ExpiryRow
            label="В ближайшие 2 года"
            value={data.expiring_2y}
            total={data.active_count}
            color="bg-amber-500"
          />
          <ExpiryRow
            label="В ближайшие 3 года"
            value={data.expiring_3y}
            total={data.active_count}
            color="bg-emerald-500"
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon: Icon, label, value, color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  color: "indigo" | "emerald" | "purple" | "slate";
}) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
    slate: "bg-slate-50 text-slate-500",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div
        className={clsx(
          "inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2",
          colors[color],
        )}
      >
        <Icon size={16} />
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function ExpiryRow({
  label, value, total, color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-700">
          {value} <span className="text-slate-400">/ {total}</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
