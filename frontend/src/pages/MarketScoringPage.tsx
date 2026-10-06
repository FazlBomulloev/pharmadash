import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Filter, Search,
  SlidersHorizontal, X,
} from "lucide-react";
import clsx from "clsx";
import { getMarketScoring } from "../api/client";
import type {
  ScoringCategory, ScoringItem, ScoringResponse,
} from "../types/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import {
  CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_PILL, CRITERIA,
  STOP_REASON_LABEL, fmtPct, fmtPrice, fmtScore, fmtSignedPct, fmtUsd,
  scoreTone,
} from "../components/scoring/meta";

const PAGE_SIZE = 50;

type SortKey =
  | "rank" | "mnn" | "cls" | "direction" | "sales0" | "sales1" | "sales2"
  | "price" | "cagr_usd" | "cagr_units" | "import_share"
  | "hospital_share" | "producers" | "hhi" | "total"
  | `score:${string}`;

function sortValue(item: ScoringItem, key: SortKey): number | string | null {
  if (key.startsWith("score:")) {
    return item.scores[key.slice(6) as keyof ScoringItem["scores"]];
  }
  switch (key) {
    case "sales0": return item.sales[0];
    case "sales1": return item.sales[1];
    case "sales2": return item.sales[2];
    case "mnn": return item.mnn;
    case "cls": return item.cls;
    case "direction": return item.direction;
    default: return item[key as keyof ScoringItem] as number | null;
  }
}

interface Loaded {
  key: string;
  data: ScoringResponse | null;
  error: string;
}

export default function MarketScoringPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = parseInt(marketId ?? "0", 10);
  const [params, setParams] = useSearchParams();
  const lf = params.get("lf") || null;
  const dose = params.get("dose") || null;

  const requestKey = `${id}|${lf ?? ""}|${dose ?? ""}`;
  const [loaded, setLoaded] = useState<Loaded>({
    key: "", data: null, error: "",
  });
  const loading = loaded.key !== requestKey;
  const data = loaded.data;

  useEffect(() => {
    let cancelled = false;
    getMarketScoring(id, { lf, dose })
      .then((res) => {
        if (!cancelled) setLoaded({ key: requestKey, data: res, error: "" });
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, data: null,
            error: "Не удалось загрузить скоринг",
          });
        }
      });
    return () => { cancelled = true; };
  }, [id, lf, dose, requestKey]);

  const [category, setCategory] = useState<ScoringCategory | "passed" | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "rank", asc: true,
  });
  const [page, setPage] = useState(0);

  function setFilter(next: { lf: string | null; dose: string | null }) {
    const out: Record<string, string> = {};
    if (next.lf) out.lf = next.lf;
    if (next.dose) out.dose = next.dose;
    setParams(out, { replace: true });
    setPage(0);
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toUpperCase();
    const filtered = data.items.filter((i) => {
      if (category === "passed" && !i.passed) return false;
      if (category && category !== "passed" && i.category !== category) {
        return false;
      }
      if (q && !i.mnn.includes(q) && !(i.cls ?? "").includes(q)) return false;
      return true;
    });
    const dir = sort.asc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      // пустые значения всегда в конце, независимо от направления
      if (va == null && vb == null) return a.rank - b.rank;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.rank - b.rank;
    });
  }, [data, category, search, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(
    safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE,
  );

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, asc: !s.asc }
        // для рангов и названий естественный порядок — по возрастанию
        : { key, asc: ["rank", "mnn", "cls", "direction"].includes(key) },
    );
    setPage(0);
  }

  function dashboardLink(mnn: string): string {
    const q = new URLSearchParams({ mnn });
    if (lf) q.set("lf", lf);
    if (dose) q.set("dose", dose);
    return `/market/${id}/dashboard?${q.toString()}`;
  }

  if (!data && loading) return <LoadingSpinner className="h-64" size="lg" />;
  if (!data) {
    return (
      <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm">
        {loaded.error || "Нет данных"}
      </div>
    );
  }

  const years = data.years.length === 3 ? data.years : ["Y-2", "Y-1", "Y"];
  const summary = data.summary;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            Скоринг МНН
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {lf || dose
              ? "Пересчитан по выбранной форме и дозировке: метрики, перцентили, ранги и категории"
              : "Одна строка — один МНН, все формы и дозировки суммируются"}
          </p>
        </div>
        <Link
          to={`/market/${id}/settings`}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <SlidersHorizontal size={14} />
          Настройки рынка
        </Link>
      </div>

      {/* Фильтр выборки */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Filter size={14} />
            Выборка
          </div>
          <FilterSelect
            label="Форма"
            value={lf}
            options={data.filters.forms}
            onChange={(v) => setFilter({ lf: v, dose })}
          />
          <FilterSelect
            label="Дозировка"
            value={dose}
            options={data.filters.doses}
            onChange={(v) => setFilter({ lf, dose: v })}
          />
          {(lf || dose) && (
            <button
              onClick={() => setFilter({ lf: null, dose: null })}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X size={12} />
              Сбросить
            </button>
          )}
          {loading && <LoadingSpinner size="sm" />}
        </div>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <SummaryTile
          label="МНН в выборке"
          value={summary.total}
          active={category === null}
          onClick={() => { setCategory(null); setPage(0); }}
        />
        <SummaryTile
          label="Прошли фильтр"
          value={summary.passed}
          active={category === "passed"}
          onClick={() => { setCategory("passed"); setPage(0); }}
        />
        {CATEGORY_ORDER.map((c) => (
          <SummaryTile
            key={c}
            label={CATEGORY_LABEL[c]}
            value={summary.categories[c]}
            pill={CATEGORY_PILL[c]}
            active={category === c}
            onClick={() => { setCategory(c); setPage(0); }}
          />
        ))}
      </div>

      {/* Таблица */}
      <div
        className={clsx(
          "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-opacity",
          loading && "opacity-50 pointer-events-none",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-wrap">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Поиск по МНН или классу"
              aria-label="Поиск по МНН или классу"
              className="pl-8 pr-3 py-1.5 w-72 text-sm bg-white dark:bg-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>
          <Pager
            page={safePage}
            pageCount={pageCount}
            total={rows.length}
            onChange={setPage}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <Th k="rank" sort={sort} onSort={toggleSort}>Ранг</Th>
                <Th k="mnn" sort={sort} onSort={toggleSort}>МНН</Th>
                <Th k="cls" sort={sort} onSort={toggleSort}>Класс</Th>
                <Th k="direction" sort={sort} onSort={toggleSort}>Направление</Th>
                <Th k="sales0" sort={sort} onSort={toggleSort} right>$ {years[0]}</Th>
                <Th k="sales1" sort={sort} onSort={toggleSort} right>$ {years[1]}</Th>
                <Th k="sales2" sort={sort} onSort={toggleSort} right>$ {years[2]}</Th>
                <Th k="price" sort={sort} onSort={toggleSort} right>Цена уп.</Th>
                <Th k="cagr_usd" sort={sort} onSort={toggleSort} right>CAGR $</Th>
                <Th k="cagr_units" sort={sort} onSort={toggleSort} right>CAGR уп.</Th>
                <Th k="import_share" sort={sort} onSort={toggleSort} right>Импорт</Th>
                <Th k="hospital_share" sort={sort} onSort={toggleSort} right>Госпиталь</Th>
                <Th k="producers" sort={sort} onSort={toggleSort} right>Произв.</Th>
                <Th k="hhi" sort={sort} onSort={toggleSort} right>HHI</Th>
                {CRITERIA.map((c) => (
                  <Th
                    key={c.key}
                    k={`score:${c.key}`}
                    sort={sort}
                    onSort={toggleSort}
                    right
                    title={`Балл: ${c.label}`}
                  >
                    {c.short}
                  </Th>
                ))}
                <Th k="total" sort={sort} onSort={toggleSort} right>ИТОГ</Th>
                <th className="px-3 py-2 font-medium">Категория</th>
                <th className="px-3 py-2 font-medium">Фильтр</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((i) => (
                <tr
                  key={i.mnn}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="px-3 py-1.5 tabular-nums text-slate-500 dark:text-slate-400">{i.rank}</td>
                  <td className="px-3 py-1.5 max-w-[260px] truncate font-medium">
                    <Link
                      to={dashboardLink(i.mnn)}
                      title={i.mnn}
                      className="text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      {i.mnn}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 max-w-[140px] truncate text-slate-600 dark:text-slate-300" title={i.cls ?? ""}>{i.cls ?? "—"}</td>
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{i.direction}</td>
                  <Num>{fmtUsd(i.sales[0])}</Num>
                  <Num>{fmtUsd(i.sales[1])}</Num>
                  <Num strong>{fmtUsd(i.sales[2])}</Num>
                  <Num>{fmtPrice(i.price)}</Num>
                  <Num>{fmtSignedPct(i.cagr_usd)}</Num>
                  <Num>{fmtSignedPct(i.cagr_units)}</Num>
                  <Num>{fmtPct(i.import_share)}</Num>
                  <Num>{fmtPct(i.hospital_share)}</Num>
                  <Num>{i.producers}</Num>
                  <Num>{i.hhi != null ? Math.round(i.hhi) : "—"}</Num>
                  {CRITERIA.map((c) => (
                    <td key={c.key} className="px-1.5 py-1.5 text-right">
                      <span
                        className={clsx(
                          "inline-block min-w-[36px] px-1.5 py-0.5 rounded tabular-nums text-center",
                          scoreTone(i.scores[c.key]),
                        )}
                      >
                        {fmtScore(i.scores[c.key])}
                      </span>
                    </td>
                  ))}
                  <Num strong>{i.total.toFixed(1)}</Num>
                  <td className="px-3 py-1.5">
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded border text-[11px] font-semibold",
                        CATEGORY_PILL[i.category],
                      )}
                    >
                      {CATEGORY_LABEL[i.category]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                    {i.passed
                      ? "Пройдено"
                      : i.stop_reasons.map((r) => STOP_REASON_LABEL[r]).join("; ")}
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={27}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    Нет МНН по заданным условиям
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="max-w-[220px] px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
      >
        <option value="">Все</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function SummaryTile({
  label, value, pill, active, onClick,
}: {
  label: string;
  value: number;
  pill?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "text-left rounded-xl border p-3 transition-colors bg-white dark:bg-slate-900",
        active
          ? "border-indigo-500 ring-1 ring-indigo-500"
          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600",
      )}
    >
      <span
        className={clsx(
          "inline-block text-[11px] font-semibold rounded",
          pill
            ? clsx("px-1.5 py-0.5 border", pill)
            : "text-slate-500 dark:text-slate-400",
        )}
      >
        {label}
      </span>
      <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">
        {value.toLocaleString("ru-RU")}
      </p>
    </button>
  );
}

function Th({
  k, sort, onSort, right, title, children,
}: {
  k: SortKey;
  sort: { key: SortKey; asc: boolean };
  onSort: (k: SortKey) => void;
  right?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const active = sort.key === k;
  return (
    <th
      className={clsx("px-3 py-2 font-medium", right && "text-right")}
      aria-sort={active ? (sort.asc ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onSort(k)}
        title={title}
        className={clsx(
          "inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-100",
          active && "text-slate-800 dark:text-slate-100",
        )}
      >
        {children}
        {active && (sort.asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}

function Num({
  strong, children,
}: {
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <td
      className={clsx(
        "px-3 py-1.5 text-right tabular-nums",
        strong
          ? "font-semibold text-slate-800 dark:text-slate-100"
          : "text-slate-600 dark:text-slate-300",
      )}
    >
      {children}
    </td>
  );
}

function Pager({
  page, pageCount, total, onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className="tabular-nums">
        {total.toLocaleString("ru-RU")} МНН · стр. {page + 1} из {pageCount}
      </span>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        aria-label="Предыдущая страница"
        className="p-1.5 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount - 1}
        aria-label="Следующая страница"
        className="p-1.5 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
