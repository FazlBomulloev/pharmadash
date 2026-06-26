import { useMemo } from "react";
import { X, Filter } from "lucide-react";

interface Props {
  availableForms: string[];
  availableDoses: string[];
  formsDosesMap: Record<string, string[]>;
  dosesFormsMap: Record<string, string[]>;
  selectedLf: string | null;
  selectedDose: string | null;
  onChange: (lf: string | null, dose: string | null) => void;
}

export default function DashboardFilters({
  availableForms,
  availableDoses,
  formsDosesMap,
  dosesFormsMap,
  selectedLf,
  selectedDose,
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
    // если новая форма не содержит выбранную дозу — сбросить дозу
    const nextDose =
      lf && selectedDose && !formsDosesMap[lf]?.includes(selectedDose)
        ? null
        : selectedDose;
    onChange(lf, nextDose);
  };

  const handleDoseChange = (value: string) => {
    const dose = value || null;
    const nextLf =
      dose && selectedLf && !dosesFormsMap[dose]?.includes(selectedLf)
        ? null
        : selectedLf;
    onChange(nextLf, dose);
  };

  const hasActive = selectedLf || selectedDose;

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

        {hasActive && (
          <button
            onClick={() => onChange(null, null)}
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
