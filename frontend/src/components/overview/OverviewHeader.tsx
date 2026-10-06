import {
  Calendar, Globe, Pill, Factory, Tag,
} from "lucide-react";
import clsx from "clsx";
import type { OverviewHeader as HeaderData } from "../../types/api";
import type React from "react";

interface Props {
  header: HeaderData;
}

export default function OverviewHeader({ header }: Props) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {header.name}
          </h2>
          <div className="mt-2 flex items-center gap-x-4 gap-y-1.5 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {header.years.join(", ")}
            </span>
            {header.regions.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Globe size={14} />
                {header.regions.length} регион(ов)
              </span>
            )}
            <span className="uppercase tracking-wide text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 dark:text-slate-300">
              {header.language}
            </span>
          </div>
          <div className="mt-3 flex gap-1.5">
            <SourceBadge label="БДП" active={header.has_bdp} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Counter icon={Pill} label="МНН" value={header.mnn_count} />
        <Counter
          icon={Factory}
          label="Производителей"
          value={header.producer_count}
        />
        <Counter icon={Tag} label="ТМ" value={header.tm_count} />
      </div>
    </div>
  );
}

function SourceBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={clsx(
        "px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide",
        active
          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
          : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
      )}
    >
      {label} {active ? "✓" : "—"}
    </span>
  );
}

function Counter({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 flex items-center gap-3">
      <Icon size={20} className="text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
          {value.toLocaleString("ru-RU")}
        </p>
      </div>
    </div>
  );
}
