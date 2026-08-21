import {
  FileCheck,
  ShieldCheck,
  Users,
  DollarSign,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";
import type { GrlsExtra, PcStats } from "../../types/api";

interface Props {
  grlsText: string;
  activeCount: number;
  registrants: number;
  extra: GrlsExtra | null;
  pcFlag: boolean;
  pcStats: PcStats | null;
}

export default function RegulatoryTimeline({
  grlsText, activeCount, registrants, extra, pcFlag, pcStats,
}: Props) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-1.5">
        <FileCheck size={14} className="text-indigo-500 dark:text-indigo-400" />
        Регуляторный ландшафт
      </h4>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatTile
          icon={ShieldCheck}
          label="Активных РУ"
          value={activeCount > 0 ? String(activeCount) : "—"}
          hint={grlsText === "Не определено" ? grlsText : undefined}
        />
        <StatTile
          icon={Users}
          label="Регистрантов"
          value={registrants > 0 ? String(registrants) : "—"}
        />
        <StatTile
          icon={CalendarClock}
          label="Возраст рынка"
          value={
            extra?.market_age != null
              ? `${extra.market_age} ${plur(extra.market_age)}`
              : "—"
          }
          hint={
            extra?.oldest_reg_year
              ? `первая РУ: ${extra.oldest_reg_year}`
              : undefined
          }
        />
        <StatTile
          icon={DollarSign}
          label="Предельная цена"
          value={
            pcStats
              ? `${pcStats.min.toFixed(0)}–${pcStats.max.toFixed(0)} ₽`
              : "—"
          }
          hint={
            pcStats ? `${pcStats.count} записей в РС` : "нет данных"
          }
          tone={pcFlag ? "amber" : "neutral"}
        />
      </div>

      {extra && (extra.registrations_by_year.length > 0 || activeCount > 0) && (
        <TimelineAxis
          extra={extra}
          activeCount={activeCount}
        />
      )}
    </div>
  );
}

function plur(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "года";
  return "лет";
}

function StatTile({
  icon: Icon, label, value, hint, tone = "neutral",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "amber";
}) {
  return (
    <div className={clsx(
      "rounded-lg p-3",
      tone === "amber" ? "bg-amber-50 dark:bg-amber-950/40" : "bg-slate-50 dark:bg-slate-800/60",
    )}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
        <Icon size={12} />
        {label}
      </div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─────────────── Timeline axis ───────────────

function TimelineAxis({
  extra, activeCount,
}: {
  extra: GrlsExtra;
  activeCount: number;
}) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const oldestYear = extra.oldest_reg_year ?? currentYear - 3;
  const endYear = currentYear + 3;
  const range = endYear - oldestYear || 1;

  const pct = (year: number) =>
    Math.min(100, Math.max(0, ((year - oldestYear) / range) * 100));

  const todayPct = pct(currentYear);
  const maxRegCount = Math.max(
    1,
    ...extra.registrations_by_year.map((r) => r.count),
  );

  // 3 expiring buckets, positioned at +1y, +2y, +3y from today
  const expiring = [
    { label: "≤ 1 г.", value: extra.expiring_1y, year: currentYear + 1, color: "bg-red-500", ring: "ring-red-200" },
    { label: "≤ 2 г.", value: extra.expiring_2y - extra.expiring_1y, year: currentYear + 2, color: "bg-amber-500", ring: "ring-amber-200" },
    { label: "≤ 3 г.", value: extra.expiring_3y - extra.expiring_2y, year: currentYear + 3, color: "bg-emerald-500", ring: "ring-emerald-200" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
          <AlertTriangle size={11} className="text-amber-500 dark:text-amber-400" />
          Жизненный цикл РУ
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          {oldestYear} → сегодня → {endYear}
        </p>
      </div>

      <div className="relative pt-8 pb-6" style={{ minHeight: "110px" }}>
        {/* Expiring markers above the axis */}
        {expiring.map((e, i) => {
          if (e.value <= 0) return null;
          return (
            <div
              key={i}
              className="absolute -translate-x-1/2"
              style={{ left: `${pct(e.year)}%`, top: "8px" }}
            >
              <div className="flex flex-col items-center">
                <span
                  className={clsx(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold text-white tabular-nums shadow-sm",
                    e.color,
                  )}
                >
                  {e.value}
                </span>
                <div className={clsx("w-px h-2 mt-0.5", e.color)} />
              </div>
            </div>
          );
        })}

        {/* Axis line */}
        <div className="absolute left-0 right-0 top-[46px] h-px bg-slate-300 dark:bg-slate-600" />

        {/* Today marker */}
        <div
          className="absolute -translate-x-1/2 top-[38px] flex flex-col items-center"
          style={{ left: `${todayPct}%` }}
        >
          <span className="text-[9px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400">
            сегодня
          </span>
          <div className="w-px h-4 bg-indigo-500 dark:bg-indigo-400" />
          <div className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400 ring-2 ring-white dark:ring-slate-900 shadow" />
        </div>

        {/* Registration bars below the axis */}
        {extra.registrations_by_year.map((r) => {
          const h = Math.max(3, (r.count / maxRegCount) * 32);
          return (
            <div
              key={r.year}
              className="absolute -translate-x-1/2"
              style={{ left: `${pct(r.year)}%`, top: "50px" }}
              title={`${r.year}: ${r.count} регистраций`}
            >
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className="w-1.5 bg-indigo-500 dark:bg-indigo-400 rounded-b-sm"
                  style={{ height: `${h}px` }}
                />
              </div>
            </div>
          );
        })}

        {/* Year labels at the bottom */}
        <div className="absolute left-0 right-0 bottom-0 text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
          <span className="absolute -translate-x-1/2" style={{ left: "0%" }}>
            {oldestYear}
          </span>
          <span
            className="absolute -translate-x-1/2 text-indigo-600 dark:text-indigo-400 font-semibold"
            style={{ left: `${todayPct}%` }}
          >
            {currentYear}
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: "100%" }}>
            {endYear}
          </span>
        </div>
      </div>

      {activeCount > 0 && (extra.expiring_1y + extra.expiring_2y + extra.expiring_3y) > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2">
          {[
            { label: "истекают в 1г", value: extra.expiring_1y, color: "bg-red-500" },
            { label: "в 2 года", value: extra.expiring_2y, color: "bg-amber-500" },
            { label: "в 3 года", value: extra.expiring_3y, color: "bg-emerald-500" },
          ].map((r, i) => {
            const p = activeCount > 0 ? (r.value / activeCount) * 100 : 0;
            return (
              <div key={i}>
                <div className="flex items-baseline justify-between text-[10px]">
                  <span className="text-slate-500 dark:text-slate-400">{r.label}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                    {r.value}
                    <span className="text-slate-400 dark:text-slate-500 ml-0.5">/{activeCount}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full", r.color)}
                    style={{ width: `${Math.min(100, p)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
