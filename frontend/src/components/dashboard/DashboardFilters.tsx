import { useMemo } from "react";
import { X, Filter, CalendarDays } from "lucide-react";
import clsx from "clsx";

interface Props {
  availableForms: string[];
  availableDoses: string[];
  formsDosesMap: Record<string, string[]>;
  dosesFormsMap: Record<string, string[]>;
  selectedLf: string | null;
  selectedDose: string | null;
  availableYears: number[];
  selectedYear: number | null;
  onChange: (
    lf: string | null,
    dose: string | null,
    year: number | null,
  ) => void;
}

export default function DashboardFilters({
  availableForms,
  availableDoses,
  formsDosesMap,
  dosesFormsMap,
  selectedLf,
  selectedDose,
  availableYears,
  selectedYear,
  onChange,
}: Props) {
  const formsForCurrentDose = useMemo(() => {
    if (!selectedDose) return availableForms;
    return availableForms.filter((f) =>
      dosesFormsMap[selectedDose]?.includes(f),
    );
  }, [availableForms, selectedDose, dosesFormsMap]);

  const dosesForCurrentLf = useMemo(() => {
    if (!selectedLf) return availableDoses;
    return availableDoses.filter((d) =>
      formsDosesMap[selectedLf]?.includes(d),
    );
  }, [availableDoses, selectedLf, formsDosesMap]);

  const handleLfChange = (value: string) => {
    const lf = value || null;
    const nextDose =
      lf && selectedDose && !formsDosesMap[lf]?.includes(selectedDose)
        ? null
        : selectedDose;
    onChange(lf, nextDose, selectedYear);
  };

  const handleDoseChange = (value: string) => {
    const dose = value || null;
    const nextLf =
      dose && selectedLf && !dosesFormsMap[dose]?.includes(selectedLf)
        ? null
        : selectedLf;
    onChange(nextLf, dose, selectedYear);
  };

  const handleYearChange = (year: number | null) => {
    onChange(selectedLf, selectedDose, year);
  };

  const defaultYear =
    availableYears.length > 0
      ? availableYears[availableYears.length - 1]
      : null;
  const yearIsDefault =
    selectedYear === null || selectedYear === defaultYear;

  const hasActive = selectedLf || selectedDose || !yearIsDefault;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <Filter size={14} />
          Фильтры
        </div>

        <FilterSelect
          label="Форма"
          value={selectedLf}
          options={formsForCurrentDose}
          onChange={handleLfChange}
        />

        <FilterSelect
          label="Доза"
          value={selectedDose}
          options={dosesForCurrentLf}
          onChange={handleDoseChange}
        />

        {availableYears.length > 1 && (
          <YearSegControl
            label="Год"
            value={selectedYear ?? defaultYear}
            options={availableYears}
            onChange={handleYearChange}
          />
        )}

        {hasActive && (
          <button
            onClick={() => onChange(null, null, null)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100"
          >
            <X size={12} />
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{label}:</span>
      <select
        className="px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 min-w-[140px]"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Все</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function YearSegControl({
  label, value, options, onChange,
}: {
  label: string;
  value: number | null;
  options: number[];
  onChange: (v: number | null) => void;
}) {
  const latest = options[options.length - 1] ?? null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500 flex items-center gap-1">
        <CalendarDays size={13} />
        {label}:
      </span>
      <div className="flex bg-slate-100 rounded-lg p-0.5" role="group" aria-label={label}>
        {options.map((y) => {
          const active = value === y;
          return (
            <button
              key={y}
              onClick={() =>
                onChange(y === latest ? null : y)
              }
              aria-pressed={active}
              className={clsx(
                "px-3 py-1 text-xs font-medium rounded-md transition-all tabular-nums",
                active
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {y}
            </button>
          );
        })}
      </div>
    </div>
  );
}
