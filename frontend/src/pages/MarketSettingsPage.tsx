import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, ListOrdered, Loader2, RotateCcw, Save } from "lucide-react";
import axios from "axios";
import { getMarketSettings, updateMarketSettings } from "../api/client";
import type {
  MarketSettingsResponse, ScoringCriterion, ScoringSettings,
} from "../types/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { CRITERIA } from "../components/scoring/meta";

function apiErrorText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const detail = e.response?.data?.detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d: { msg?: string }) =>
          (d.msg ?? "").replace(/^Value error, /, ""))
        .filter(Boolean)
        .join("; ");
    }
    if (typeof detail === "string") return detail;
  }
  return "Не удалось сохранить настройки";
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") {
    return Object.values(value).some(hasInvalidNumber);
  }
  return false;
}

export default function MarketSettingsPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = parseInt(marketId ?? "0", 10);

  const [meta, setMeta] = useState<MarketSettingsResponse | null>(null);
  const [form, setForm] = useState<ScoringSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMarketSettings(id)
      .then((res) => {
        if (cancelled) return;
        setMeta(res);
        setForm(structuredClone(res.settings));
      })
      .catch(() => {
        if (!cancelled) setLoadError("Не удалось загрузить настройки рынка");
      });
    return () => { cancelled = true; };
  }, [id]);

  const dirty = useMemo(
    () => !!meta && !!form
      && JSON.stringify(form) !== JSON.stringify(meta.settings),
    [meta, form],
  );

  if (loadError) {
    return (
      <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm">
        {loadError}
      </div>
    );
  }
  if (!meta || !form) return <LoadingSpinner className="h-64" size="lg" />;

  function patch(next: Partial<ScoringSettings>) {
    setForm((f) => (f ? { ...f, ...next } : f));
    setSavedAt(null);
  }

  async function save() {
    if (!form) return;
    if (hasInvalidNumber(form)) {
      setSaveError("Заполните все числовые поля");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const res = await updateMarketSettings(id, form);
      setMeta(res);
      setForm(structuredClone(res.settings));
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError(apiErrorText(e));
    } finally {
      setSaving(false);
    }
  }

  const weightSum = CRITERIA.reduce(
    (s, c) => s + (Number.isFinite(form.weights[c.key]) ? form.weights[c.key] : 0),
    0,
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            Настройки рынка
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Параметры и стоп-фильтры скоринга. После сохранения скоринг
            пересчитывается целиком.
          </p>
        </div>
        <Link
          to={`/market/${id}/scoring`}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ListOrdered size={14} />
          К скорингу
        </Link>
      </div>

      <Section
        title="Веса критериев"
        hint={`Итог нормируется на сумму весов. Сейчас сумма: ${weightSum}`}
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {CRITERIA.map((c) => (
            <NumberField
              key={c.key}
              label={c.label}
              value={form.weights[c.key]}
              min={0}
              onChange={(v) =>
                patch({
                  weights: {
                    ...form.weights,
                    [c.key as ScoringCriterion]: v,
                  },
                })
              }
            />
          ))}
        </div>
      </Section>

      <Section
        title="Стоп-фильтры"
        hint="МНН получает категорию «Стоп», если выполнено хотя бы одно условие. На балл и ранг не влияют."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NumberField
            label="Мин. объём продаж за последний год, $"
            value={form.stop.min_sales_usd}
            min={0}
            onChange={(v) => patch({ stop: { ...form.stop, min_sales_usd: v } })}
          />
          <NumberField
            label="Макс. цена упаковки, $"
            value={form.stop.max_price_usd}
            min={0}
            onChange={(v) => patch({ stop: { ...form.stop, max_price_usd: v } })}
          />
          <NumberField
            label="Макс. число производителей"
            value={form.stop.max_producers}
            min={1}
            step={1}
            onChange={(v) => patch({ stop: { ...form.stop, max_producers: v } })}
          />
        </div>
      </Section>

      <Section title="Пороги категорий">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NumberField
            label="Порог «Приоритет», ИТОГ ≥"
            value={form.thresholds.priority}
            min={0}
            max={100}
            onChange={(v) =>
              patch({ thresholds: { ...form.thresholds, priority: v } })}
          />
          <NumberField
            label="Порог «Смотреть», ИТОГ ≥"
            value={form.thresholds.watch}
            min={0}
            max={100}
            onChange={(v) =>
              patch({ thresholds: { ...form.thresholds, watch: v } })}
          />
        </div>
      </Section>

      <Section
        title="Отечественный рынок"
        hint="Производство в этих странах считается локальным, всё остальное — импорт. Через запятую."
      >
        <input
          type="text"
          value={form.home_countries.join(", ")}
          onChange={(e) =>
            patch({
              home_countries: e.target.value
                .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
            })}
          aria-label="Страны отечественного рынка"
          className={INPUT_CLASS}
        />
      </Section>

      {/* Панель сохранения */}
      <div className="sticky bottom-4 z-30 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg">
        <div className="px-5 py-3 flex items-center justify-end gap-3 flex-wrap">
          {saveError && (
            <span className="text-sm text-red-600 dark:text-red-400 mr-auto">
              {saveError}
            </span>
          )}
          {savedAt && !dirty && !saveError && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 mr-auto inline-flex items-center gap-1.5">
              <Check size={14} />
              Сохранено, скоринг пересчитан
            </span>
          )}
          <button
            onClick={() => {
              setForm(structuredClone(meta.defaults));
              setSavedAt(null);
              setSaveError("");
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw size={14} />
            Значения по умолчанию
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-400 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "w-full px-3 py-1.5 text-sm bg-white dark:bg-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 tabular-nums";
const LABEL_CLASS =
  "block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1";

function Section({
  title, hint, children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const head = (
    <>
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {title}
      </span>
      {hint && (
        <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
          {hint}
        </span>
      )}
    </>
  );
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <h3 className="mb-4">{head}</h3>
      {children}
    </section>
  );
}

function NumberField({
  label, value, min, max, step, onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className={LABEL_CLASS}>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step ?? "any"}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={INPUT_CLASS}
      />
    </label>
  );
}
