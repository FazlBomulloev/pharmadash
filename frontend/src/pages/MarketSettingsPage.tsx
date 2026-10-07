import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, X } from "lucide-react";
import {
  getMarketSettings, previewMarketSettings, updateMarketSettings,
} from "../api/client";
import type {
  MarketSettingsResponse, ScoringCriterion, ScoringSettings, StopReason,
} from "../types/api";
import { useDebounce } from "../hooks/useDebounce";
import { useFetch } from "../hooks/useFetch";
import { fmtInt, fmtPct, titleCase } from "../lib/format";
import { CATEGORY_COLOR } from "../lib/palette";
import { Page } from "../components/layout/Layout";
import { CRITERIA } from "../components/scoring/meta";
import { Autocomplete } from "../components/ui/Autocomplete";
import { Card, PageHeader } from "../components/ui/Card";
import { ErrorNote, Loading } from "../components/ui/states";
import { apiErrorText } from "../lib/apiError";

const CRITERION_HUES = [268, 195, 155, 300, 45, 230, 355, 100, 20, 130];
const WEIGHT_MAX = 30;
const SLIDER_ACCENT = "oklch(0.5 0.16 268)";

const STOPS: {
  key: keyof ScoringSettings["stop"];
  reason: StopReason;
  label: string;
  prefix: string;
  min: number;
}[] = [
  { key: "min_sales_usd", reason: "min_sales", label: "Мин. продажи за последний год", prefix: "$", min: 0 },
  { key: "max_price_usd", reason: "max_price", label: "Макс. цена упаковки", prefix: "$", min: 0.01 },
  { key: "max_producers", reason: "max_producers", label: "Макс. число производителей", prefix: "шт.", min: 1 },
];

const ZONES = [
  { key: "priority" as const, label: "Приоритет" },
  { key: "watch" as const, label: "Смотреть" },
  { key: "miss" as const, label: "Мимо" },
];

function countChanges(form: ScoringSettings, base: ScoringSettings): number {
  let n = 0;
  CRITERIA.forEach((c) => {
    if (form.weights[c.key] !== base.weights[c.key]) n += 1;
  });
  STOPS.forEach((s) => {
    if (form.stop[s.key] !== base.stop[s.key]) n += 1;
  });
  if (form.thresholds.watch !== base.thresholds.watch) n += 1;
  if (form.thresholds.priority !== base.thresholds.priority) n += 1;
  if (form.home_countries.join("|") !== base.home_countries.join("|")) n += 1;
  return n;
}

function isValid(form: ScoringSettings): boolean {
  const weightSum = CRITERIA.reduce((s, c) => s + form.weights[c.key], 0);
  return (
    weightSum > 0
    && STOPS.every((s) => Number.isFinite(form.stop[s.key]) && form.stop[s.key] >= s.min)
    && Number.isInteger(form.stop.max_producers)
  );
}

export default function MarketSettingsPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = parseInt(marketId ?? "0", 10);
  const loaded = useFetch<MarketSettingsResponse>(
    () => getMarketSettings(id), [id], "Не удалось загрузить настройки рынка",
  );

  if (!loaded.data) {
    return (
      <Page maxWidth={940}>
        {loaded.error
          ? <ErrorNote>{loaded.error}</ErrorNote>
          : <Loading className="h-64" />}
      </Page>
    );
  }
  return (
    <Editor
      key={JSON.stringify(loaded.data.settings)}
      id={id}
      meta={loaded.data}
      onSaved={loaded.setData}
    />
  );
}

function Editor({
  id, meta, onSaved,
}: {
  id: number;
  meta: MarketSettingsResponse;
  onSaved: (meta: MarketSettingsResponse) => void;
}) {
  const [form, setForm] = useState<ScoringSettings>(
    () => structuredClone(meta.settings),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [toast, setToast] = useState(false);

  const changed = countChanges(form, meta.settings);
  const valid = isValid(form);
  const differsFromDefaults = countChanges(form, meta.defaults) > 0;

  const draft = useDebounce(form, 400);
  const draftValid = isValid(draft);
  const preview = useFetch(
    (signal) => draftValid
      ? previewMarketSettings(id, draft, signal)
      : Promise.resolve(null),
    [id, draft, draftValid],
    "Не удалось пересчитать предпросмотр",
  );
  const counts = preview.data;
  const stale = preview.loading || draft !== form;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const patch = (next: Partial<ScoringSettings>) => {
    setForm((prev) => ({ ...prev, ...next }));
    setSaveError("");
  };

  function setWeight(key: ScoringCriterion, value: number) {
    patch({ weights: { ...form.weights, [key]: value } });
  }

  function setWatch(value: number) {
    patch({
      thresholds: {
        watch: value,
        priority: Math.max(form.thresholds.priority, value),
      },
    });
  }
  function setPriority(value: number) {
    patch({
      thresholds: {
        priority: value,
        watch: Math.min(form.thresholds.watch, value),
      },
    });
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await updateMarketSettings(id, form);
      setToast(true);
      onSaved(res);
      setForm(structuredClone(res.settings));
    } catch (e) {
      setSaveError(apiErrorText(e, "Не удалось сохранить настройки"));
    } finally {
      setSaving(false);
    }
  }

  const weightSum = CRITERIA.reduce((s, c) => s + form.weights[c.key], 0);
  const { watch, priority } = form.thresholds;

  return (
    <Page maxWidth={940}>
      <PageHeader
        title="Настройки рынка"
        subtitle="Параметры скоринга. После сохранения скоринг пересчитывается целиком."
      >
        {differsFromDefaults && (
          <button
            type="button"
            onClick={() => setForm(structuredClone(meta.defaults))}
            className="border-0 bg-transparent p-0 text-[13px] font-medium text-muted-2 hover:text-fg"
          >
            По умолчанию
          </button>
        )}
        <Link to={`/market/${id}/scoring`} className="text-[13px] font-medium">
          К скорингу →
        </Link>
      </PageHeader>

      <Card index={0} className="flex flex-col gap-1.5 px-6!">
        <div className="flex flex-wrap items-baseline justify-between gap-3 pb-2.5">
          <span className="text-[17px] font-semibold tracking-[-0.01em]">
            Веса критериев
          </span>
          <span className="text-[13px] text-muted-2">
            Итог нормируется на сумму весов · сейчас{" "}
            <b className="text-fg">{weightSum}</b>
          </span>
        </div>
        <div className="mb-3 flex h-7 gap-0.5 overflow-hidden rounded-[9px] bg-track">
          {CRITERIA.map((c, i) => {
            const value = form.weights[c.key];
            const share = weightSum > 0 ? value / weightSum : 0;
            if (value <= 0) return null;
            return (
              <span
                key={c.key}
                title={`${c.label} · ${fmtPct(share)}`}
                className="flex items-center justify-center overflow-hidden text-[11px] font-bold text-white"
                style={{
                  flex: `${value} 1 0%`,
                  background: `oklch(0.58 0.14 ${CRITERION_HUES[i]})`,
                  transition: "flex .2s",
                }}
              >
                {share >= 0.08 ? c.short : ""}
              </span>
            );
          })}
        </div>
        {CRITERIA.map((c, i) => {
          const hue = CRITERION_HUES[i];
          const value = form.weights[c.key];
          const color = `oklch(0.58 0.14 ${hue})`;
          return (
            <div
              key={c.key}
              className="grid grid-cols-[minmax(130px,180px)_minmax(0,1fr)_40px_56px] items-center gap-4 border-t border-[#f5f5f2] py-2"
            >
              <span className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: color }}
                />
                {c.label}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(WEIGHT_MAX, value)}
                step={1}
                value={value}
                aria-label={`Вес критерия «${c.label}»`}
                onChange={(e) => setWeight(c.key, e.target.valueAsNumber)}
                className="w-full"
                style={{ accentColor: color }}
              />
              <span className="text-right text-[15px] font-semibold">
                {value}
              </span>
              <span
                className="justify-self-end rounded-md px-[7px] py-[3px] text-xs font-bold"
                style={{
                  background: `oklch(0.95 0.035 ${hue})`,
                  color: `oklch(0.38 0.1 ${hue})`,
                }}
              >
                {fmtPct(weightSum > 0 ? value / weightSum : 0)}
              </span>
            </div>
          );
        })}
        {weightSum <= 0 && (
          <span className="pt-1 text-[13px] text-neg">
            Сумма весов должна быть больше нуля
          </span>
        )}
      </Card>

      <Card index={1} className="flex flex-col gap-5 px-6!">
        <SectionHead
          title="Пороги категорий"
          note="По итоговому баллу 0–100. Стоп-фильтр применяется отдельно."
        />
        <div className="flex h-[52px] gap-[3px] overflow-hidden rounded-xl">
          <Zone flex={watch} label="Мимо" range={`0–${Math.max(watch - 1, 0)}`} tone={CATEGORY_COLOR.miss} />
          <Zone
            flex={priority - watch}
            label="Смотреть"
            range={`${watch}–${Math.max(priority - 1, watch)}`}
            tone={CATEGORY_COLOR.watch}
          />
          <Zone flex={100 - priority} label="Приоритет" range={`${priority}–100`} tone={CATEGORY_COLOR.priority} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
          <ThresholdSlider label="«Смотреть» от" value={watch} onChange={setWatch} />
          <ThresholdSlider label="«Приоритет» от" value={priority} onChange={setPriority} />
        </div>
        <div
          className="flex flex-wrap gap-2.5 transition-opacity duration-200"
          style={{ opacity: stale ? 0.5 : 1 }}
        >
          {ZONES.map((z) => (
            <div
              key={z.key}
              className="flex min-w-[130px] flex-col gap-0.5 rounded-xl px-4 py-3"
              style={{ background: CATEGORY_COLOR[z.key].tint }}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="size-2 rounded-[2px]"
                  style={{ background: CATEGORY_COLOR[z.key].bg }}
                />
                {z.label}
              </span>
              <span className="text-2xl font-semibold tracking-[-0.02em]">
                {counts ? fmtInt(counts.zones[z.key]) : "—"}{" "}
                <span className="text-[13px] font-medium text-muted-2">МНН</span>
              </span>
            </div>
          ))}
        </div>
        {preview.error && (
          <span className="text-[13px] text-neg">{preview.error}</span>
        )}
      </Card>

      <Card index={2} className="flex flex-col gap-[18px] px-6!">
        <SectionHead
          title="Стоп-фильтры"
          note="МНН получает «Стоп», если выполнено хотя бы одно условие. На балл и ранг не влияет."
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {STOPS.map((s) => {
            const value = form.stop[s.key];
            const bad = !Number.isFinite(value) || value < s.min
              || (s.key === "max_producers" && !Number.isInteger(value));
            return (
              <label
                key={s.key}
                className="flex flex-col gap-2.5 rounded-inner bg-[oklch(0.975_0.015_25)] p-4"
              >
                <span className="text-[13px] font-medium text-fg-2">
                  {s.label}
                </span>
                <span
                  className="flex h-[42px] items-center gap-1.5 rounded-ctl border bg-white px-3 focus-within:border-accent"
                  style={{
                    borderColor: bad ? "oklch(0.6 0.19 25)" : "oklch(0.9 0.03 25)",
                  }}
                >
                  <span className="text-sm text-[#9a9ea6]">{s.prefix}</span>
                  <input
                    type="number"
                    min={s.min}
                    step={s.key === "max_producers" ? 1 : "any"}
                    value={Number.isFinite(value) ? value : ""}
                    onChange={(e) =>
                      patch({
                        stop: { ...form.stop, [s.key]: e.target.valueAsNumber },
                      })}
                    className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium outline-none"
                  />
                </span>
                <span
                  className="self-start rounded-full bg-cat-stop px-[9px] py-[3px] text-xs font-semibold text-white transition-opacity duration-200"
                  style={{ opacity: stale ? 0.5 : 1 }}
                >
                  отсекает {counts ? fmtInt(counts.stop[s.reason]) : "—"} МНН
                </span>
              </label>
            );
          })}
        </div>
      </Card>

      <Card index={3} className="flex flex-col gap-3.5 px-6!">
        <SectionHead
          title="Отечественный рынок"
          note="Производство в этих странах считается локальным, остальное — импортом."
        />
        <HomeCountries
          value={form.home_countries}
          options={meta.country_options}
          onChange={(home_countries) => patch({ home_countries })}
        />
      </Card>

      {changed > 0 && (
        <div className="anim-toast fixed bottom-5 left-1/2 z-30 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-1 rounded-inner bg-ink py-2.5 pl-[18px] pr-2.5 text-sm text-white shadow-[0_12px_32px_rgba(16,24,40,.25)]">
          <span className="whitespace-nowrap">
            {saveError || `Изменено параметров: ${changed}`}
          </span>
          <button
            type="button"
            onClick={() => setForm(structuredClone(meta.settings))}
            className="border-0 bg-transparent px-2 py-1.5 text-sm text-[#c7c9ce] hover:text-white"
          >
            Отменить
          </button>
          <button
            type="button"
            onClick={() => setForm(structuredClone(meta.defaults))}
            className="border-0 bg-transparent px-2 py-1.5 text-sm text-[#c7c9ce] hover:text-white"
          >
            По умолчанию
          </button>
          <button
            type="button"
            disabled={!valid || saving}
            onClick={save}
            className="tr-soft whitespace-nowrap rounded-[9px] border-0 bg-white px-3.5 py-2 text-sm font-semibold text-fg hover:bg-[#ececec] disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить и пересчитать"}
          </button>
        </div>
      )}
      {toast && changed === 0 && (
        <div
          role="status"
          className="anim-toast fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-inner px-[18px] py-3 text-sm font-medium shadow-[0_8px_24px_rgba(16,24,40,.12)]"
          style={{
            background: "oklch(0.95 0.05 155)", color: "oklch(0.34 0.1 155)",
          }}
        >
          <Check size={16} /> Сохранено, скоринг пересчитан
        </div>
      )}
    </Page>
  );
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[17px] font-semibold tracking-[-0.01em]">
        {title}
      </span>
      <span className="text-[13px] text-muted-2">{note}</span>
    </div>
  );
}

function Zone({
  flex, label, range, tone,
}: {
  flex: number;
  label: string;
  range: string;
  tone: { bg: string; fg: string };
}) {
  if (flex <= 0) return null;
  return (
    <div
      className="flex flex-col justify-center overflow-hidden whitespace-nowrap px-3.5"
      style={{
        flex: `${flex} 1 0%`, background: tone.bg, color: tone.fg,
        transition: "flex .2s",
      }}
    >
      <span className="text-[11px] font-semibold">{label}</span>
      <span className="text-[15px] font-bold">{range}</span>
    </div>
  );
}

function ThresholdSlider({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex justify-between text-sm">
        <span>{label}</span>
        <b>{value}</b>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="w-full"
        style={{ accentColor: SLIDER_ACCENT }}
      />
    </label>
  );
}

function HomeCountries({
  value, options, onChange,
}: {
  value: string[];
  options: { value: string; count: number }[];
  onChange: (countries: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const taken = useMemo(
    () => new Set(value.map((c) => c.trim().toUpperCase())), [value],
  );
  const suggestions = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return options.filter(
      (o) => !taken.has(o.value.toUpperCase())
        && o.value.toUpperCase().includes(needle),
    );
  }, [options, taken, query]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((country) => (
        <span
          key={country}
          className="flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-[13px] font-semibold"
          style={{
            background: "oklch(0.93 0.05 195)", color: "oklch(0.32 0.09 195)",
          }}
        >
          {titleCase(country)}
          <button
            type="button"
            aria-label={`Убрать ${titleCase(country)}`}
            onClick={() => onChange(value.filter((c) => c !== country))}
            className="flex size-5 items-center justify-center rounded-full border-0 bg-[oklch(1_0_0/0.7)] text-muted hover:bg-white"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <Autocomplete
        query={query}
        onQuery={setQuery}
        items={suggestions}
        itemKey={(o) => o.value}
        onPick={(o) => {
          onChange([...value, o.value]);
          setQuery("");
        }}
        header="Страны производителей из БДП рынка"
        emptyText="Нет такой страны в БДП"
        menuClassName="min-w-[240px] max-h-[260px]!"
        renderItem={(o) => (
          <span className="flex justify-between gap-3 whitespace-nowrap text-fg">
            <span>{titleCase(o.value)}</span>
            <span className="text-[#9a9ea6]">{fmtInt(o.count)}</span>
          </span>
        )}
      >
        {(input) => (
          <input
            {...input}
            aria-label="Добавить страну"
            placeholder="+ добавить страну"
            className="h-8 w-[200px] rounded-full border border-dashed border-[#d6d6d1] bg-transparent px-3 text-[13px] outline-none placeholder:text-muted-2 focus:border-accent"
          />
        )}
      </Autocomplete>
    </div>
  );
}
