import { Filter, X, CalendarDays } from "lucide-react";
import clsx from "clsx";
import type {
  OverviewFilters as FiltersData,
  OverviewQuery,
} from "../../types/api";

interface Props {
  filters: FiltersData;
  value: OverviewQuery;
  availableYears?: number[];
  onChange: (next: OverviewQuery) => void;
}

const SECTOR_OPTIONS: { value: "all" | "ret" | "hos"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "ret", label: "Розница" },
  { value: "hos", label: "Госпиталь" },
];

export default function OverviewFilters({
  filters, value, availableYears = [], onChange,
}: Props) {
  const latestYear =
    availableYears.length > 0
      ? availableYears[availableYears.length - 1]
      : null;
  const yearIsDefault =
    value.year == null || value.year === latestYear;

  const hasActive =
    (value.sector && value.sector !== "all") ||
    !!value.atc3 ||
    !yearIsDefault;

  function reset() {
    onChange({ sector: "all", atc3: null, year: null });
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Filter size={14} />
          Фильтры
        </div>

        <SegControl
          label="Сектор"
          options={SECTOR_OPTIONS}
          value={value.sector ?? "all"}
          onChange={(v) => onChange({ ...value, sector: v })}
        />

        <Select
          label="Класс ATC"
          value={value.atc3 ?? ""}
          onChange={(v) => onChange({ ...value, atc3: v || null })}
          options={[
            { value: "", label: "Все классы" },
            ...filters.options.atc3.map((o) => ({
              value: o.atc,
              label: `${o.atc} — ${(o.share * 100).toFixed(1)}%`,
            })),
          ]}
        />

        {availableYears.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <CalendarDays size={12} />
              Год:
            </span>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5" role="group" aria-label="Год">
              {availableYears.map((y) => {
                const active = (value.year ?? latestYear) === y;
                return (
                  <button
                    key={y}
                    onClick={() =>
                      onChange({
                        ...value,
                        year: y === latestYear ? null : y,
                      })
                    }
                    aria-pressed={active}
                    className={clsx(
                      "px-3 py-1 text-xs font-medium rounded-md transition-all tabular-nums",
                      active
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {hasActive && (
          <button
            onClick={reset}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            <X size={12} />
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}

function SegControl<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}:</span>
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5" role="group" aria-label={label}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={clsx(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                active
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs font-medium bg-slate-100 dark:bg-slate-800 dark:text-slate-200 border-0 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
