import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import { ArrowUpRight, RefreshCw, Search, X } from "lucide-react";
import clsx from "clsx";
import {
  getPharmacyFilters, getPharmacyPrices, getPharmacySources,
  getPriceComparison, triggerPharmacyRun,
} from "../api/client";
import type {
  PharmacyFiltersResponse, PharmacyPrice, PharmacySource,
} from "../types/api";
import { useDebounce } from "../hooks/useDebounce";
import { useFetch } from "../hooks/useFetch";
import {
  fmtAgo, fmtInt, fmtPct, fmtRub, plural, titleCase,
} from "../lib/format";
import { pharmacyHue, tintChip } from "../lib/palette";
import { Page } from "../components/layout/Layout";
import { DarkHero, PageHeader } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { SidePanel } from "../components/ui/SidePanel";
import { ErrorNote, Loading } from "../components/ui/states";

const PAGE_SIZE = 100;
const ROW_HEIGHT = 57;
const LOAD_AHEAD = 20;
const GRID =
  "grid grid-cols-[64px_minmax(240px,2fr)_minmax(170px,1.2fr)_130px_110px_110px_40px]";
const HATCH =
  "repeating-linear-gradient(135deg,#f2f2ef 0 6px,#ebebe7 6px 12px)";

interface Filters {
  q: string;
  sources: string[];
  mnn: string;
  manufacturer: string;
  country: string;
  form: string;
  priceMin: string;
  priceMax: string;
}

const EMPTY_FILTERS: Filters = {
  q: "", sources: [], mnn: "", manufacturer: "", country: "", form: "",
  priceMin: "", priceMax: "",
};

interface Sort {
  key: string;
  order: "asc" | "desc";
}

const DEFAULT_SORT: Sort = { key: "scraped_at", order: "desc" };

const COLUMNS: { key: string; label: string; align?: "right" }[] = [
  { key: "name", label: "Название" },
  { key: "manufacturer", label: "Производитель" },
  { key: "source", label: "Источник" },
  { key: "price", label: "Цена", align: "right" },
  { key: "scraped_at", label: "Дата", align: "right" },
];

function toNumber(raw: string): number | undefined {
  const value = parseFloat(raw.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function PharmaciesPage() {
  const sources = useFetch<PharmacySource[]>(
    () => getPharmacySources(), [], "Не удалось загрузить источники",
  );
  const options = useFetch<PharmacyFiltersResponse>(
    () => getPharmacyFilters(), [],
  );
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selected, setSelected] = useState<PharmacyPrice | null>(null);
  const [starting, setStarting] = useState<Set<string>>(new Set());

  const sourceList = useMemo(() => sources.data ?? [], [sources.data]);
  const reloadSources = sources.reload;

  const anyRunning = sourceList.some((s) => s.running);
  useEffect(() => {
    if (!anyRunning) return;
    const timer = window.setInterval(reloadSources, 3000);
    return () => window.clearInterval(timer);
  }, [anyRunning, reloadSources]);

  async function run(slug: string) {
    setStarting((prev) => new Set(prev).add(slug));
    try {
      await triggerPharmacyRun(slug);
    } finally {
      reloadSources();
      setStarting((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
    }
  }

  const meta = useMemo(() => {
    const map: Record<string, { name: string; hue: number }> = {};
    sourceList.forEach((s, i) => {
      map[s.slug] = { name: s.display_name, hue: pharmacyHue(i) };
    });
    return map;
  }, [sourceList]);

  const totalItems = sourceList.reduce((sum, s) => sum + s.items_count, 0);
  const maxItems = Math.max(...sourceList.map((s) => s.items_count), 1);
  const patch = (next: Partial<Filters>) =>
    setFilters((prev) => ({ ...prev, ...next }));
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  function toggleSource(slug: string) {
    patch({
      sources: filters.sources.includes(slug)
        ? filters.sources.filter((s) => s !== slug)
        : [...filters.sources, slug],
    });
  }

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, order: prev.order === "asc" ? "desc" : "asc" }
        : { key, order: key === "price" || key === "scraped_at" ? "desc" : "asc" });
  }

  const selectOptions = (
    list: { value: string; count: number }[] | undefined,
    label: (value: string) => string = (v) => v,
  ) => (list ?? []).map((o) => ({
    value: o.value, label: label(o.value), hint: fmtInt(o.count),
  }));

  return (
    <Page>
      <PageHeader
        title="Цены аптек"
        subtitle={
          <>
            БДЦ · {fmtInt(totalItems)}{" "}
            {plural(totalItems, "позиция", "позиции", "позиций")} из{" "}
            {sourceList.length}{" "}
            {plural(sourceList.length, "источника", "источников", "источников")}
          </>
        }
      />

      {sources.error && <ErrorNote>{sources.error}</ErrorNote>}

      <DarkHero className="items-stretch gap-x-10! gap-y-5! px-7! py-6!">
        <div className="flex flex-[0_1_220px] flex-col justify-center gap-2">
          <span className="text-[13px] text-ink-fg-2">Позиций в базе</span>
          <span className="text-[52px] font-semibold leading-[0.95] tracking-[-0.045em]">
            {fmtInt(totalItems)}
          </span>
          <span className="text-[13px] text-ink-fg-2">
            из {sourceList.length}{" "}
            {plural(sourceList.length, "аптечной сети", "аптечных сетей", "аптечных сетей")}
          </span>
        </div>
        <div className="grid min-w-0 flex-[1_1_520px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
          {sourceList.map((s, i) => (
            <SourceCard
              key={s.slug}
              source={s}
              hue={pharmacyHue(i)}
              fill={s.items_count / maxItems}
              busy={s.running || starting.has(s.slug)}
              onRun={() => run(s.slug)}
            />
          ))}
          {!sources.data && sources.loading && (
            <Loading className="h-28 text-ink-fg-2!" />
          )}
        </div>
      </DarkHero>

      <div className="anim-rise flex flex-wrap items-center gap-2" style={{ animationDelay: "210ms" }}>
        <label className="flex h-9 max-w-[340px] flex-[1_1_260px] items-center gap-2 rounded-[9px] border border-line-strong bg-white px-[11px] focus-within:border-accent">
          <Search size={14} className="shrink-0 text-[#9a9ea6]" />
          <input
            value={filters.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Название, МНН или ТМ"
            aria-label="Поиск по названию, МНН или ТМ"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-faintest"
          />
        </label>
        {sourceList.map((s) => {
          const active = filters.sources.includes(s.slug);
          return (
            <button
              key={s.slug}
              type="button"
              aria-pressed={active}
              onClick={() => toggleSource(s.slug)}
              className={clsx(
                "tr-soft h-9 whitespace-nowrap rounded-[9px] border px-3 text-[13px] font-medium",
                active
                  ? "border-fg bg-fg text-white"
                  : "border-line-strong bg-white text-fg hover:bg-[#fafaf8]",
              )}
            >
              {s.display_name}
            </button>
          );
        })}
        <Select
          label="МНН" allLabel="Все" value={filters.mnn}
          onChange={(mnn) => patch({ mnn })}
          options={selectOptions(options.data?.mnns)}
        />
        <Select
          label="Производитель" allLabel="Все" value={filters.manufacturer}
          onChange={(manufacturer) => patch({ manufacturer })}
          options={selectOptions(options.data?.manufacturers)}
        />
        <Select
          label="Страна" allLabel="Все" value={filters.country}
          onChange={(country) => patch({ country })}
          options={selectOptions(options.data?.countries, titleCase)}
        />
        <Select
          label="Форма" allLabel="Все" value={filters.form}
          onChange={(form) => patch({ form })}
          options={selectOptions(options.data?.forms)}
        />
        <div className="flex h-9 items-center gap-1.5 rounded-[9px] border border-line-strong bg-white px-2.5 text-[13px] text-faint">
          Цена, ₽
          <PriceInput
            label="Цена от" placeholder="от" value={filters.priceMin}
            onChange={(priceMin) => patch({ priceMin })}
          />
          <span>–</span>
          <PriceInput
            label="Цена до" placeholder="до" value={filters.priceMax}
            onChange={(priceMax) => patch({ priceMax })}
          />
        </div>
        {dirty && (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="border-0 bg-transparent text-[13px] font-medium text-accent hover:text-accent-hover"
          >
            Сбросить
          </button>
        )}
      </div>

      <PriceTable
        filters={filters}
        sort={sort}
        onSort={toggleSort}
        meta={meta}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      {selected && (
        <ProductPanel
          key={selected.id}
          item={selected}
          meta={meta}
          onClose={() => setSelected(null)}
        />
      )}
    </Page>
  );
}

function PriceInput({
  label, placeholder, value, onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      inputMode="decimal"
      className="w-14 rounded-md border-0 bg-canvas px-1.5 py-1 text-[13px] text-fg outline-none placeholder:text-faintest"
    />
  );
}

function SourceCard({
  source, hue, fill, busy, onRun,
}: {
  source: PharmacySource;
  hue: number;
  fill: number;
  busy: boolean;
  onRun: () => void;
}) {
  const last = source.last_run;
  const color = `oklch(0.66 0.15 ${hue})`;
  let status: { text: string; tone: string };
  if (busy || last?.status === "running") {
    status = { text: "идёт обновление…", tone: "oklch(0.85 0.1 268)" };
  } else if (last?.status === "error") {
    status = { text: "ошибка", tone: "oklch(0.78 0.15 25)" };
  } else if (last?.status === "success") {
    status = {
      text: fmtAgo(last.finished_at ?? last.started_at),
      tone: "oklch(0.84 0.14 155)",
    };
  } else {
    status = { text: "ещё не запускалось", tone: "oklch(0.84 0.04 268)" };
  }
  const failed = !busy && last?.status === "error";

  return (
    <div
      title={failed ? last?.error ?? "Ошибка обновления" : undefined}
      className="flex flex-col gap-2.5 rounded-inner bg-ink-glass px-4 py-3.5"
      style={{
        boxShadow: failed
          ? "inset 0 0 0 1px oklch(0.7 0.17 25 / 0.6)"
          : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="size-[9px] shrink-0 rounded-[3px]"
            style={{ background: color }}
          />
          <span className="truncate text-sm font-semibold">
            {source.display_name}
          </span>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={onRun}
          title="Обновить"
          aria-label={`Обновить ${source.display_name}`}
          className="tr-soft flex size-7 shrink-0 items-center justify-center rounded-lg border-0 bg-[oklch(1_0_0/0.1)] text-white hover:bg-[oklch(1_0_0/0.18)] disabled:cursor-default"
        >
          <RefreshCw
            size={14}
            style={busy ? { animation: "spin 1s linear infinite" } : undefined}
          />
        </button>
      </div>
      <span className="text-[22px] font-semibold tracking-[-0.02em]">
        {fmtInt(source.items_count)}
      </span>
      <span className="h-[5px] overflow-hidden rounded-[3px] bg-[oklch(1_0_0/0.12)]">
        <span
          className="block h-full rounded-[3px]"
          style={{ width: `${fill * 100}%`, background: color }}
        />
      </span>
      <span
        className="flex items-center gap-1.5 text-xs"
        style={{ color: status.tone }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ background: status.tone }}
        />
        {status.text}
      </span>
    </div>
  );
}

function Thumb({
  url, name, size,
}: {
  url: string | null;
  name: string;
  size: "row" | "panel";
}) {
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const frame = size === "row"
    ? "size-10 rounded-lg text-[9px]"
    : "aspect-[4/3] rounded-inner text-[13px]";
  if (!url || failed) {
    return (
      <div
        className={clsx("flex items-center justify-center text-[#9a9ea6]", frame)}
        style={{ background: HATCH }}
      >
        {size === "row" ? "фото" : "нет фото товара"}
      </div>
    );
  }
  const image = (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-full object-contain"
    />
  );
  if (size === "row") {
    return (
      <div className={clsx("overflow-hidden border border-line bg-white", frame)}>
        {image}
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        title="Открыть фото во весь экран"
        aria-label={`Открыть фото: ${name}`}
        onClick={() => setZoomed(true)}
        className={clsx(
          "tr-soft block w-full cursor-zoom-in overflow-hidden border border-line bg-white p-0 hover:border-accent",
          frame,
        )}
      >
        {image}
      </button>
      {zoomed && (
        <Lightbox url={url} name={name} onClose={() => setZoomed(false)} />
      )}
    </>
  );
}

function Lightbox({
  url, name, onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="anim-overlay fixed inset-0 z-[60] flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-[rgba(16,18,24,.88)] p-6"
    >
      <button
        type="button"
        aria-label="Закрыть"
        autoFocus
        className="tr-soft absolute right-5 top-5 flex size-10 items-center justify-center rounded-ctl border-0 bg-[oklch(1_0_0/0.12)] text-white hover:bg-[oklch(1_0_0/0.22)]"
      >
        <X size={20} />
      </button>
      <img
        src={url}
        alt={name}
        className="min-h-0 max-w-full flex-1 rounded-inner bg-white object-contain"
      />
      <span className="max-w-full truncate text-sm text-white">{name}</span>
    </div>,
    document.body,
  );
}

function SourceChip({
  slug, meta,
}: {
  slug: string;
  meta: Record<string, { name: string; hue: number }>;
}) {
  const hue = meta[slug]?.hue ?? 262;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-[3px] text-xs font-semibold"
      style={tintChip(hue)}
    >
      <span
        className="size-1.5 rounded-[2px]"
        style={{ background: `oklch(0.6 0.15 ${hue})` }}
      />
      {meta[slug]?.name ?? slug}
    </span>
  );
}

function PriceTable({
  filters, sort, onSort, meta, selectedId, onSelect,
}: {
  filters: Filters;
  sort: Sort;
  onSort: (key: string) => void;
  meta: Record<string, { name: string; hue: number }>;
  selectedId: number | null;
  onSelect: (item: PharmacyPrice) => void;
}) {
  const search = useDebounce(filters.q.trim(), 250);
  const priceMin = useDebounce(filters.priceMin, 350);
  const priceMax = useDebounce(filters.priceMax, 350);
  const [items, setItems] = useState<PharmacyPrice[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const source = filters.sources.join(",");
  const { mnn, manufacturer, country, form } = filters;
  const query = useMemo(() => ({
    search, source, mnn, manufacturer, country, form,
    price_min: toNumber(priceMin),
    price_max: toNumber(priceMax),
    sort: sort.key,
    order: sort.order,
  }), [
    search, source, mnn, manufacturer, country, form, priceMin, priceMax,
    sort.key, sort.order,
  ]);

  const [seenQuery, setSeenQuery] = useState(query);
  if (seenQuery !== query) {
    setSeenQuery(query);
    setItems([]);
    setTotal(null);
    setOffset(0);
  }

  useEffect(() => {
    const controller = new AbortController();
    getPharmacyPrices({ ...query, offset, limit: PAGE_SIZE })
      .then((res) => {
        if (controller.signal.aborted) return;
        if (offset === 0) scrollRef.current?.scrollTo({ top: 0 });
        setError("");
        setTotal(res.total);
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Не удалось загрузить цены");
      });
    return () => controller.abort();
  }, [query, offset]);

  const loadingPage = total == null || items.length < Math.min(total, offset + PAGE_SIZE);
  const hasMore = total != null && items.length < total;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const rows = virtualizer.getVirtualItems();
  const lastIndex = rows.length ? rows[rows.length - 1].index : -1;

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);
  useEffect(() => {
    if (hasMore && !loadingPage && lastIndex >= items.length - LOAD_AHEAD) {
      loadMore();
    }
  }, [hasMore, loadingPage, lastIndex, items.length, loadMore]);

  const arrow = (key: string) =>
    sort.key === key ? (sort.order === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="anim-rise flex flex-col overflow-hidden rounded-card bg-surface" style={{ animationDelay: "300ms" }}>
      <div
        ref={scrollRef}
        className="max-h-[calc(var(--screen-h)-300px)] min-h-[360px] overflow-auto"
      >
        <div className="min-w-[880px]">
          <div
            className={`${GRID} sticky top-0 z-[2] border-b border-[#eeeeea] bg-[#fafaf8]`}
          >
            <span />
            {COLUMNS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onSort(c.key)}
                className={clsx(
                  "whitespace-nowrap border-0 bg-transparent p-2.5 text-[11px] font-medium hover:text-fg",
                  c.align === "right" ? "text-right" : "text-left",
                  sort.key === c.key ? "text-fg" : "text-muted-2",
                )}
              >
                {c.label}{arrow(c.key)}
              </button>
            ))}
            <span />
          </div>

          {error && <ErrorNote className="m-4">{error}</ErrorNote>}
          {total == null && !error && <Loading className="h-64" />}
          {total === 0 && (
            <div className="p-12 text-center text-sm text-muted-2">
              Ничего не найдено. Обновите источник или измените фильтры.
            </div>
          )}

          <div
            className="relative"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {rows.map((row) => {
              const p = items[row.index];
              const active = p.id === selectedId;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(p);
                    }
                  }}
                  className={clsx(
                    GRID,
                    "tr-soft absolute inset-x-0 cursor-pointer items-center border-b border-[#f3f3f0] hover:bg-[#f7f7f4]",
                    active ? "bg-accent-tint" : "bg-white",
                  )}
                  style={{ top: row.start, height: ROW_HEIGHT }}
                >
                  <div className="py-2 pl-4">
                    <Thumb url={p.image_url} name={p.name} size="row" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                    <span className="truncate text-sm font-medium" title={p.name}>
                      {p.name}
                    </span>
                    <span className="truncate text-xs text-faint">
                      {[p.mnn, p.form].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                    <span className="truncate text-[13px]">
                      {p.manufacturer ?? "—"}
                    </span>
                    <span className="truncate text-xs text-faint">
                      {p.country ? titleCase(p.country) : ""}
                    </span>
                  </div>
                  <div className="px-2.5 py-2">
                    <SourceChip slug={p.source} meta={meta} />
                  </div>
                  <div className="flex flex-col items-end gap-0.5 px-2.5 py-2">
                    <span className="whitespace-nowrap text-[15px] font-bold tracking-[-0.01em]">
                      {fmtRub(p.price)}
                    </span>
                    {p.price_discount != null && (
                      <span className="whitespace-nowrap text-[11px] font-medium text-pos">
                        со скидкой {fmtRub(p.price_discount)}
                      </span>
                    )}
                  </div>
                  <div className="px-2.5 py-2 text-right text-xs text-faint">
                    {fmtDate(p.scraped_at)}
                  </div>
                  <span className="text-sm text-[#b5b8be]">→</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border-t border-line px-4 py-2.5 text-[13px] text-muted-2">
        {total == null
          ? "Загрузка…"
          : `Показано ${fmtInt(items.length)} из ${fmtInt(total)}`}
      </div>
    </div>
  );
}

function ProductPanel({
  item, meta, onClose,
}: {
  item: PharmacyPrice;
  meta: Record<string, { name: string; hue: number }>;
  onClose: () => void;
}) {
  const compare = useFetch(
    (signal) => getPriceComparison(item.id, signal), [item.id],
    "Не удалось сравнить цены",
  );
  const rows = compare.data ?? [];
  const prices = rows.map((r) => r.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const cheapest = rows.find((r) => r.price === min);

  const fields: [string, string | null][] = [
    ["МНН", item.mnn],
    ["Форма", item.form],
    ["Дозировка", item.dosage],
    ["Фасовка", item.pack_qty],
    ["Производитель", item.manufacturer],
    ["Страна", item.country ? titleCase(item.country) : null],
    ["Аптека", meta[item.source]?.name ?? item.source],
    ["Дата", new Date(item.scraped_at).toLocaleDateString("ru-RU")],
  ];

  return (
    <SidePanel onClose={onClose} width={440} gap={24}>
      <Thumb url={item.image_url} name={item.name} size="panel" />
      <div className="flex flex-col gap-2">
        <span className="text-pretty text-[22px] font-semibold leading-tight tracking-[-0.02em]">
          {item.name}
        </span>
        <span className="flex flex-wrap items-baseline gap-2.5">
          <span className="text-[28px] font-semibold">{fmtRub(item.price)}</span>
          {item.price_discount != null && (
            <span className="text-[13px] font-medium text-pos">
              со скидкой {fmtRub(item.price_discount)}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 rounded-inner bg-subtle p-4">
        <span className="flex justify-between gap-3 text-[13px]">
          <b className="font-semibold">Цена в других аптеках</b>
          {rows.length > 1 && cheapest && (
            <span className="text-right text-muted-2">
              разброс {fmtPct(min > 0 ? (max - min) / min : 0)} · дешевле
              всего — {cheapest.display_name}
            </span>
          )}
        </span>
        {compare.error && (
          <span className="text-[13px] text-neg">{compare.error}</span>
        )}
        {!compare.data && compare.loading && (
          <span className="text-[13px] text-faint">Загрузка…</span>
        )}
        {compare.data && rows.length <= 1 && (
          <span className="text-[13px] text-muted-2">
            Эта торговая марка и дозировка не найдены в других аптеках
          </span>
        )}
        {rows.length > 1 && rows.map((r) => {
          const isMin = r.price === min;
          const hue = meta[r.source]?.hue ?? 262;
          return (
            <div
              key={r.source}
              className="grid grid-cols-[110px_minmax(0,1fr)_84px] items-center gap-2.5 text-[13px]"
            >
              <span
                className={clsx(
                  "flex items-center gap-1.5 truncate",
                  r.is_current ? "font-bold" : "font-normal",
                )}
              >
                <span
                  className="size-[7px] shrink-0 rounded-[2px]"
                  style={{ background: `oklch(0.6 0.15 ${hue})` }}
                />
                {r.display_name}
              </span>
              <span className="h-2 rounded bg-[#e9e9e5]">
                <span
                  className="block h-full rounded"
                  style={{
                    width: `${(r.price / max) * 100}%`,
                    background: isMin
                      ? "oklch(0.62 0.15 155)"
                      : r.is_current
                        ? "oklch(0.52 0.16 268)"
                        : "#c4c7cc",
                  }}
                />
              </span>
              <span
                className="whitespace-nowrap text-right font-semibold"
                style={{ color: isMin ? "oklch(0.52 0.13 155)" : undefined }}
              >
                {fmtRub(r.price)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col">
        {fields.map(([key, value]) => (
          <div
            key={key}
            className="flex justify-between gap-4 border-t border-[#f3f3f0] py-2.5 text-sm"
          >
            <span className="text-muted-2">{key}</span>
            <span className="text-right">{value || "—"}</span>
          </div>
        ))}
      </div>

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="tr-soft flex items-center gap-2 self-start rounded-ctl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-[oklch(0.4_0.14_262)] hover:text-white"
        >
          Открыть на сайте аптеки <ArrowUpRight size={16} />
        </a>
      )}
    </SidePanel>
  );
}
