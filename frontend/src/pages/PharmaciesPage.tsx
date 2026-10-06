import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, ExternalLink, Store, ChevronLeft, ChevronRight,
  Loader2, CheckCircle2, AlertCircle,
  ArrowUp, ArrowDown, ChevronsUpDown, X, ImageOff,
} from "lucide-react";
import clsx from "clsx";
import {
  getPharmacySources,
  triggerPharmacyRun,
  getPharmacyPrices,
  getPharmacyFilters,
} from "../api/client";
import type {
  PharmacySource,
  PharmacyPrice,
  PharmacyPricesQuery,
  PharmacyFiltersResponse,
} from "../types/api";
import PharmacyFilters from "../components/pharmacies/PharmacyFilters";
import LoadingSpinner from "../components/common/LoadingSpinner";

const DEFAULT_LIMIT = 50;

export default function PharmaciesPage() {
  const [sources, setSources] = useState<PharmacySource[]>([]);
  const [filters, setFilters] = useState<PharmacyFiltersResponse | null>(null);
  const [query, setQuery] = useState<PharmacyPricesQuery>({
    offset: 0, limit: DEFAULT_LIMIT,
    sort: "scraped_at", order: "desc",
  });
  const [draft, setDraft] = useState<PharmacyPricesQuery>({
    offset: 0, limit: DEFAULT_LIMIT,
  });
  const [items, setItems] = useState<PharmacyPrice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [zoomImg, setZoomImg] = useState<{
    url: string; name: string;
  } | null>(null);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const loadSources = useCallback(async () => {
    const s = await getPharmacySources();
    setSources(s);
  }, []);

  const loadFilters = useCallback(async () => {
    const f = await getPharmacyFilters();
    setFilters(f);
  }, []);

  const loadPrices = useCallback(async (q: PharmacyPricesQuery) => {
    setLoading(true);
    try {
      const r = await getPharmacyPrices(q);
      setItems(r.items);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
    loadFilters();
  }, [loadSources, loadFilters]);

  useEffect(() => {
    loadPrices(query);
  }, [query, loadPrices]);

  // авто-обновление списка источников, пока идёт хоть один запуск
  useEffect(() => {
    const anyRunning = sources.some((s) => s.running);
    if (!anyRunning) return;
    const iv = setInterval(() => {
      loadSources();
    }, 3000);
    return () => clearInterval(iv);
  }, [sources, loadSources]);

  async function handleRun(slug: string) {
    await triggerPharmacyRun(slug);
    await loadSources();
  }

  function applyDraft() {
    setQuery({ ...draft, offset: 0 });
  }

  function resetFilters() {
    const empty: PharmacyPricesQuery = { offset: 0, limit: DEFAULT_LIMIT };
    setDraft(empty);
    setQuery({ ...empty, sort: "scraped_at", order: "desc" });
  }

  function toggleSort(field: string) {
    setQuery((q) => {
      // Клик по текущей колонке — переключаем asc/desc.
      // Клик по новой — начинаем с asc (для текста «А→Я»),
      // а для числовых/дат — с desc (сначала большие/свежие).
      const isNumeric = field === "price" || field === "scraped_at";
      let nextOrder: "asc" | "desc";
      if (q.sort === field) {
        nextOrder = q.order === "asc" ? "desc" : "asc";
      } else {
        nextOrder = isNumeric ? "desc" : "asc";
      }
      return { ...q, sort: field, order: nextOrder, offset: 0 };
    });
  }

  const page = Math.floor((query.offset ?? 0) / DEFAULT_LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT));

  const sourceLabel = useMemo(() => {
    const m: Record<string, string> = {};
    sources.forEach((s) => { m[s.slug] = s.display_name; });
    return m;
  }, [sources]);

  return (
    <div className="flex gap-0 h-[calc(100vh-6rem)]">
      <div className="flex-1 min-w-0 flex flex-col gap-4 pr-0">
        {/* Карточки источников */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sources.map((s) => (
            <SourceCard key={s.slug} src={s} onRun={handleRun} />
          ))}
        </div>

        {/* Таблица цен */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Цены аптек
              <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">
                всего {total.toLocaleString("ru-RU")}
              </span>
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              стр. {page} из {totalPages}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <LoadingSpinner className="h-64" />
            ) : items.length === 0 ? (
              <div className="text-center text-slate-400 dark:text-slate-500 py-24 text-sm">
                Ничего не найдено. Запустите обновление источника или измените фильтры.
              </div>
            ) : (
              <table className="text-sm" style={{ tableLayout: "fixed", width: "100%" }}>
                <colgroup>
                  <col style={{ width: 56 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 320 }} />
                  <col style={{ width: 260 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 44 }} />
                </colgroup>
                <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <Th>Фото</Th>
                    <SortableTh field="source" query={query} onToggle={toggleSort}>Аптека</SortableTh>
                    <SortableTh field="name" query={query} onToggle={toggleSort}>Название</SortableTh>
                    <SortableTh field="mnn" query={query} onToggle={toggleSort}>МНН</SortableTh>
                    <SortableTh field="form" query={query} onToggle={toggleSort}>Форма</SortableTh>
                    <SortableTh field="dosage" query={query} onToggle={toggleSort}>Дозировка</SortableTh>
                    <SortableTh field="manufacturer" query={query} onToggle={toggleSort}>Производитель</SortableTh>
                    <SortableTh field="country" query={query} onToggle={toggleSort}>Страна</SortableTh>
                    <SortableTh field="price" query={query} onToggle={toggleSort} align="right">Цена ₽</SortableTh>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const isExp = expanded.has(p.id);
                    return (
                      <tr
                        key={p.id}
                        onDoubleClick={() => toggleExpand(p.id)}
                        className={clsx(
                          "border-t border-slate-100 dark:border-slate-800 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20",
                          isExp && "bg-amber-50/40 dark:bg-amber-950/20",
                        )}
                        title={isExp ? "Двойной клик — свернуть" : "Двойной клик — раскрыть полностью"}
                      >
                        <Td expanded={isExp}>
                          <Thumb url={p.image_url} name={p.name} onZoom={setZoomImg} />
                        </Td>
                        <Td expanded={isExp}>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium">
                            {sourceLabel[p.source] ?? p.source}
                          </span>
                        </Td>
                        <Td expanded={isExp}>{p.name}</Td>
                        <Td expanded={isExp} className="text-slate-500 dark:text-slate-400">{p.mnn ?? "—"}</Td>
                        <Td expanded={isExp} className="text-slate-500 dark:text-slate-400">{p.form ?? "—"}</Td>
                        <Td expanded={isExp} className="text-slate-500 dark:text-slate-400">{p.dosage ?? "—"}</Td>
                        <Td expanded={isExp}>{p.manufacturer ?? "—"}</Td>
                        <Td expanded={isExp} className="text-slate-500 dark:text-slate-400">{p.country ?? "—"}</Td>
                        <Td expanded={isExp} className="text-right tabular-nums font-medium">
                          {p.price != null ? p.price.toLocaleString("ru-RU") : "—"}
                          {p.price_discount != null && (
                            <div className="text-xs text-emerald-600 dark:text-emerald-400">
                              −{p.price_discount.toLocaleString("ru-RU")}
                            </div>
                          )}
                        </Td>
                        <Td expanded={isExp}>
                          {p.url && (
                            <a
                              href={p.url} target="_blank" rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-400"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              Показано {items.length > 0 ? (query.offset ?? 0) + 1 : 0}–
              {(query.offset ?? 0) + items.length} из {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setQuery({
                  ...query,
                  offset: Math.max(0, (query.offset ?? 0) - DEFAULT_LIMIT),
                })}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setQuery({
                  ...query,
                  offset: (query.offset ?? 0) + DEFAULT_LIMIT,
                })}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <PharmacyFilters
        filters={filters}
        value={draft}
        onChange={setDraft}
        onApply={applyDraft}
        onReset={resetFilters}
      />

      <ZoomModal data={zoomImg} onClose={() => setZoomImg(null)} />
    </div>
  );
}

function SourceCard({
  src, onRun,
}: {
  src: PharmacySource;
  onRun: (slug: string) => void;
}) {
  const last = src.last_run;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Store size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {src.display_name}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {src.items_count.toLocaleString("ru-RU")} товаров
            </div>
          </div>
        </div>
        <button
          onClick={() => onRun(src.slug)}
          disabled={src.running}
          className={clsx(
            "text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors",
            src.running
              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
              : "bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-400",
          )}
        >
          {src.running ? (
            <><Loader2 size={12} className="animate-spin" /> Идёт</>
          ) : (
            <><RefreshCw size={12} /> Обновить</>
          )}
        </button>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        {last?.status === "success" && (
          <><CheckCircle2 size={12} className="text-emerald-500" /> Успех:{" "}
            {new Date(last.finished_at ?? last.started_at).toLocaleString("ru-RU")}</>
        )}
        {last?.status === "error" && (
          <><AlertCircle size={12} className="text-red-500" /> Ошибка:{" "}
            {last.error?.slice(0, 60) ?? "—"}</>
        )}
        {last?.status === "running" && (
          <><Loader2 size={12} className="animate-spin" /> Идёт с{" "}
            {new Date(last.started_at).toLocaleString("ru-RU")}</>
        )}
        {!last && <span className="italic">Ещё не запускалось</span>}
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={clsx("px-3 py-2 font-semibold text-xs uppercase tracking-wide whitespace-nowrap", className)}>
      {children}
    </th>
  );
}

function SortableTh({
  field, query, onToggle, children, align = "left",
}: {
  field: string;
  query: PharmacyPricesQuery;
  onToggle: (f: string) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = query.sort === field;
  const dir = active ? query.order : null;
  return (
    <th
      onClick={() => onToggle(field)}
      className={clsx(
        "px-3 py-2 font-semibold text-xs uppercase tracking-wide whitespace-nowrap cursor-pointer select-none",
        "hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors",
        align === "right" && "text-right",
        active && "text-indigo-600 dark:text-indigo-400",
      )}
      title={`Сортировать по колонке (по всей базе, ${dir === "asc" ? "↑" : dir === "desc" ? "↓" : "клик"})`}
    >
      <span
        className={clsx(
          "inline-flex items-center gap-1",
          align === "right" && "justify-end w-full",
        )}
      >
        {children}
        {dir === "asc" && <ArrowUp size={12} />}
        {dir === "desc" && <ArrowDown size={12} />}
        {!active && <ChevronsUpDown size={12} className="opacity-40" />}
      </span>
    </th>
  );
}

function Td({
  children, className, title, expanded,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
  expanded?: boolean;
}) {
  return (
    <td
      title={title}
      className={clsx(
        "px-3 py-2 text-slate-700 dark:text-slate-200 align-top",
        expanded
          ? "whitespace-normal break-words"
          : "whitespace-nowrap overflow-hidden text-ellipsis",
        className,
      )}
    >
      {children}
    </td>
  );
}

function Thumb({
  url, name, onZoom,
}: {
  url: string | null | undefined;
  name: string;
  onZoom: (v: { url: string; name: string }) => void;
}) {
  if (!url) {
    return (
      <div className="w-10 h-10 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-600">
        <ImageOff size={14} />
      </div>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onZoom({ url, name }); }}
      className="w-10 h-10 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
      title="Клик — увеличить"
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        className="w-full h-full object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    </button>
  );
}

function ZoomModal({
  data, onClose,
}: {
  data: { url: string; name: string } | null;
  onClose: () => void;
}) {
  if (!data) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-xl p-4 max-w-[min(90vw,600px)] max-h-[90vh] overflow-auto shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">
            {data.name}
          </p>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>
        <img
          src={data.url}
          alt={data.name}
          className="w-full h-auto rounded"
        />
      </div>
    </div>
  );
}
