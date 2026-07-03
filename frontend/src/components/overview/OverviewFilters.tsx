import { Filter, X } from "lucide-react";
import clsx from "clsx";
import type {
  OverviewFilters as FiltersData,
  OverviewQuery,
} from "../../types/api";

interface Props {
  filters: FiltersData;
  value: OverviewQuery;
  onChange: (next: OverviewQuery) => void;
}

const SECTOR_OPTIONS: { value: "all" | "ret" | "hos"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "ret", label: "Розница" },
  { value: "hos", label: "Госпиталь" },
];

const JNVLP_OPTIONS: {
  value: "all" | "only" | "exclude"; label: string;
}[] = [
  { value: "all", label: "Все" },
  { value: "only", label: "Только ЖНВЛП" },
  { value: "exclude", label: "Без ЖНВЛП" },
];

export default function OverviewFilters({
  filters, value, onChange,
}: Props) {
  const hasActive =
    (value.sector && value.sector !== "all") ||
    !!value.atc3 ||
    (value.jnvlp && value.jnvlp !== "all");

  function reset() {
    onChange({ sector: "all", atc3: null, jnvlp: "all" });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
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

        {filters.options.has_jnvlp_data && (
          <SegControl
            label="ЖНВЛП"
            options={JNVLP_OPTIONS}
            value={value.jnvlp ?? "all"}
            onChange={(v) => onChange({ ...value, jnvlp: v })}
          />
        )}

        {hasActive && (
          <button
            onClick={reset}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
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
      <span className="text-xs text-slate-500">{label}:</span>
      <div className="flex bg-slate-100 rounded-lg p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              value === o.value
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {o.label}
          </button>
        ))}
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
      <span className="text-xs text-slate-500">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs font-medium bg-slate-100 border-0 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
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
