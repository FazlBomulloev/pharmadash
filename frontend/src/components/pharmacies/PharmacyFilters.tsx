import { X, Filter } from "lucide-react";
import clsx from "clsx";
import type {
  PharmacyFiltersResponse,
  PharmacyPricesQuery,
} from "../../types/api";

interface Props {
  filters: PharmacyFiltersResponse | null;
  value: PharmacyPricesQuery;
  onChange: (next: PharmacyPricesQuery) => void;
  onApply: () => void;
  onReset: () => void;
}

export default function PharmacyFilters({
  filters, value, onChange, onApply, onReset,
}: Props) {
  const hasActive =
    !!value.source || !!value.mnn || !!value.manufacturer ||
    !!value.country || !!value.form ||
    value.price_min != null || value.price_max != null ||
    !!value.search;

  return (
    <aside className="w-[280px] flex-shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Filter size={16} />
          Фильтры
        </div>
        {hasActive && (
          <button
            onClick={onReset}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1"
          >
            <X size={12} /> Сброс
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Аптека">
          <select
            value={value.source ?? ""}
            onChange={(e) => onChange({ ...value, source: e.target.value || undefined })}
            className="w-full input-base"
          >
            <option value="">Все аптеки</option>
            {filters?.sources.map((s) => (
              <option key={s.slug} value={s.slug}>{s.display_name}</option>
            ))}
          </select>
        </Field>

        <Field label="МНН">
          <select
            value={value.mnn ?? ""}
            onChange={(e) => onChange({ ...value, mnn: e.target.value || undefined })}
            className="w-full input-base"
          >
            <option value="">—</option>
            {filters?.mnns.map((o) => (
              <option key={o.value} value={o.value}>{o.value}</option>
            ))}
          </select>
        </Field>

        <Field label="Производитель">
          <select
            value={value.manufacturer ?? ""}
            onChange={(e) => onChange({ ...value, manufacturer: e.target.value || undefined })}
            className="w-full input-base"
          >
            <option value="">—</option>
            {filters?.manufacturers.map((o) => (
              <option key={o.value} value={o.value}>{o.value}</option>
            ))}
          </select>
        </Field>

        <Field label="Страна">
          <select
            value={value.country ?? ""}
            onChange={(e) => onChange({ ...value, country: e.target.value || undefined })}
            className="w-full input-base"
          >
            <option value="">—</option>
            {filters?.countries.map((o) => (
              <option key={o.value} value={o.value}>{o.value}</option>
            ))}
          </select>
        </Field>

        <Field label="Форма выпуска">
          <select
            value={value.form ?? ""}
            onChange={(e) => onChange({ ...value, form: e.target.value || undefined })}
            className="w-full input-base"
          >
            <option value="">—</option>
            {filters?.forms.map((o) => (
              <option key={o.value} value={o.value}>{o.value}</option>
            ))}
          </select>
        </Field>

        <Field label="Цена, ₽">
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} placeholder="от"
              value={value.price_min ?? ""}
              onChange={(e) => onChange({
                ...value,
                price_min: e.target.value ? Number(e.target.value) : undefined,
              })}
              className="w-full input-base"
            />
            <span className="text-slate-400">—</span>
            <input
              type="number" min={0} placeholder="до"
              value={value.price_max ?? ""}
              onChange={(e) => onChange({
                ...value,
                price_max: e.target.value ? Number(e.target.value) : undefined,
              })}
              className="w-full input-base"
            />
          </div>
        </Field>

        <Field label="Поиск (название/МНН/ТМ)">
          <input
            type="text"
            value={value.search ?? ""}
            onChange={(e) => onChange({ ...value, search: e.target.value || undefined })}
            placeholder="напр. парацетамол"
            className="w-full input-base"
          />
        </Field>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={onApply}
          className={clsx(
            "w-full py-2.5 rounded-lg text-sm font-medium transition-colors",
            "bg-indigo-600 dark:bg-indigo-500 text-white",
            "hover:bg-indigo-700 dark:hover:bg-indigo-400",
          )}
        >
          Применить
        </button>
      </div>

      <style>{`
        .input-base {
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid rgb(203 213 225 / 1);
          font-size: 13px;
          background: white;
          color: rgb(30 41 59);
        }
        .dark .input-base {
          background: rgb(15 23 42);
          border-color: rgb(51 65 85);
          color: rgb(226 232 240);
        }
        .input-base:focus {
          outline: none;
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 2px rgb(99 102 241 / 0.2);
        }
      `}</style>
    </aside>
  );
}

function Field({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </label>
      {children}
    </div>
  );
}
