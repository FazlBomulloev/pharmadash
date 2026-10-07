import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Search, Settings } from "lucide-react";
import { getMarketScoring } from "../api/client";
import type {
  ScoringCategory, ScoringCriterion, ScoringItem, ScoringResponse,
  ScoringThresholds,
} from "../types/api";
import { useDebounce } from "../hooks/useDebounce";
import { useFetch } from "../hooks/useFetch";
import { fmtGrowth, fmtInt, fmtPct, fmtScore, fmtUsd } from "../lib/format";
import { CATEGORY_COLOR, growthTone } from "../lib/palette";
import { Page } from "../components/layout/Layout";
import {
  CATEGORY_LABEL, CATEGORY_ORDER,
} from "../components/scoring/meta";
import {
  CriteriaTable, ScoreScale, StopNote,
} from "../components/scoring/ScoringParts";
import {
  ScoringTable, type SortState, type TableMode,
} from "../components/scoring/ScoringTable";
import { Legend, StackedBar } from "../components/ui/bars";
import { DarkHero } from "../components/ui/Card";
import { CategoryPill } from "../components/ui/chips";
import { Pagination } from "../components/ui/Pagination";
import { Segmented } from "../components/ui/Segmented";
import { Select } from "../components/ui/Select";
import { SidePanel } from "../components/ui/SidePanel";
import { ErrorNote, Loading } from "../components/ui/states";

/** Фильтр таблицы: все, прошедшие стоп-фильтр или одна категория. */
type CatFilter = "all" | "passed" | ScoringCategory;

const TEXT_SORT = new Set(["mnn", "cls", "direction", "rank"]);
const DEFAULT_SORT: SortState = { key: "rank", order: "asc" };

function initialCat(params: URLSearchParams): CatFilter {
  const raw = params.get("cat");
  if (raw === "passed") return "passed";
  return CATEGORY_ORDER.includes(raw as ScoringCategory)
    ? (raw as ScoringCategory)
    : "all";
}

export default function MarketScoringPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = parseInt(marketId ?? "0", 10);
  const [searchParams] = useSearchParams();

  const [cat, setCat] = useState<CatFilter>(() => initialCat(searchParams));
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<TableMode>("sum");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [lf, setLf] = useState("");
  const [dose, setDose] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selected, setSelected] = useState<ScoringItem | null>(null);
  const search = useDebounce(q.trim(), 250);

  // Смена любого условия выборки возвращает на первую страницу.
  const refine = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const { data, error, loading } = useFetch<ScoringResponse>(
    (signal) => getMarketScoring(id, {
      lf, dose, q: search,
      category: cat === "all" || cat === "passed" ? null : cat,
      passed: cat === "passed",
      sort: sort.key, order: sort.order,
      page, page_size: pageSize,
    }, signal),
    [id, lf, dose, search, cat, sort.key, sort.order, page, pageSize],
    "Не удалось загрузить скоринг",
  );

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, order: prev.order === "asc" ? "desc" : "asc" }
        : { key, order: TEXT_SORT.has(key) ? "asc" : "desc" });
    setPage(1);
  }

  function pickCategory(key: string) {
    const next = key as ScoringCategory;
    refine(setCat)(cat === next ? "all" : next);
  }

  if (!data) {
    return (
      <Page>
        {error ? <ErrorNote>{error}</ErrorNote> : <Loading className="h-64" />}
      </Page>
    );
  }

  const { summary, filters } = data;
  const isDim = (c: ScoringCategory) =>
    cat === "passed" ? c === "stop" : cat !== "all" && cat !== c;
  const selection = [lf && `форма ${lf}`, dose && `дозировка ${dose}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Page>
      <header className="anim-head flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="m-0 text-[30px] font-semibold tracking-[-0.02em]">
            Скоринг МНН
          </h1>
          <Link
            to={`/market/${id}/settings`}
            title="Настройки рынка"
            aria-label="Настройки рынка"
            className="tr-soft flex size-8 items-center justify-center rounded-lg bg-seg text-muted hover:bg-line-strong hover:text-fg"
          >
            <Settings size={16} />
          </Link>
        </div>
        <span className="text-sm text-muted-2">
          {selection
            ? `Выборка: ${selection} · ${fmtInt(summary.total)} МНН`
            : "10 критериев, стоп-фильтры и категории по каждому МНН рынка"}
        </span>
      </header>

      <DarkHero className="items-center px-7! py-6! gap-y-5!">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-ink-fg-2">Прошли стоп-фильтр</span>
          <span className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-[56px] font-semibold leading-[0.95] tracking-[-0.045em]">
              {fmtInt(summary.passed)}
            </span>
            <span className="text-[15px] text-ink-fg-2">
              из {fmtInt(summary.total)} МНН
            </span>
          </span>
        </div>
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-3">
          <StackedBar
            height={56}
            minWidth={48}
            textClass="text-lg font-bold"
            onPick={pickCategory}
            segments={CATEGORY_ORDER.map((c) => ({
              key: c,
              value: summary.categories[c],
              color: CATEGORY_COLOR[c].bg,
              fg: CATEGORY_COLOR[c].fg,
              label: fmtInt(summary.categories[c]),
              title: CATEGORY_LABEL[c],
              dim: isDim(c),
            }))}
          />
          <Legend
            className="gap-x-[18px]! text-[13px] text-white [&_button]:text-[13px]"
            onPick={pickCategory}
            items={CATEGORY_ORDER.map((c) => ({
              key: c,
              color: CATEGORY_COLOR[c].bg,
              dim: isDim(c),
              label: (
                <>
                  {CATEGORY_LABEL[c]}
                  <span className="text-ink-fg-2">
                    {fmtPct(
                      summary.total
                        ? summary.categories[c] / summary.total
                        : 0,
                    )}
                  </span>
                </>
              ),
            }))}
          />
        </div>
      </DarkHero>

      <div className="anim-rise flex flex-wrap items-center justify-between gap-3" style={{ animationDelay: "210ms" }}>
        <Segmented<CatFilter>
          ariaLabel="Выборка МНН"
          value={cat === "all" || cat === "passed" ? cat : ("" as CatFilter)}
          onChange={refine(setCat)}
          options={[
            {
              value: "all",
              label: <Count label="Все" n={summary.total} />,
            },
            {
              value: "passed",
              label: <Count label="Прошли фильтр" n={summary.passed} />,
            },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Форма"
            value={lf}
            allLabel="Все"
            align="right"
            onChange={refine(setLf)}
            options={filters.forms.map((f) => ({ value: f, label: f }))}
          />
          <Select
            label="Доза"
            value={dose}
            allLabel="Все"
            align="right"
            onChange={refine(setDose)}
            options={filters.doses.map((d) => ({ value: d, label: d }))}
          />
          <label className="flex h-[34px] w-60 items-center gap-2 rounded-[9px] border border-line-strong bg-white px-[11px] focus-within:border-accent">
            <Search size={14} className="shrink-0 text-[#9a9ea6]" />
            <input
              value={q}
              onChange={(e) => refine(setQ)(e.target.value)}
              placeholder="МНН или класс"
              aria-label="Поиск по МНН или классу"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-faintest"
            />
          </label>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="anim-rise flex flex-col overflow-hidden rounded-card bg-surface" style={{ animationDelay: "300ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Segmented<TableMode>
            ariaLabel="Режим таблицы"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "sum", label: "Итог" },
              { value: "metrics", label: "Метрики" },
              { value: "scores", label: "Баллы" },
            ]}
          />
          <span className="text-[13px] text-muted-2">
            {cat !== "all" && cat !== "passed" && (
              <>{CATEGORY_LABEL[cat]} · </>
            )}
            {fmtInt(data.total)} МНН
          </span>
        </div>
        <div
          className="transition-opacity duration-200"
          style={loading ? { opacity: 0.55 } : undefined}
        >
          <ScoringTable
            items={data.items}
            mode={mode}
            years={data.years}
            sort={sort}
            onSort={toggleSort}
            selected={selected?.mnn ?? null}
            onSelect={setSelected}
          />
        </div>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPage={setPage}
          onPageSize={refine(setPageSize)}
        />
      </div>

      {selected && (
        <MnnPanel
          key={selected.mnn}
          item={selected}
          marketId={id}
          year={data.years[2]}
          weights={data.weights}
          thresholds={data.thresholds}
          onClose={() => setSelected(null)}
        />
      )}
    </Page>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <span className="flex items-center gap-[7px]">
      {label}
      <span className="font-medium text-faint">{fmtInt(n)}</span>
    </span>
  );
}

function MnnPanel({
  item, marketId, year, weights, thresholds, onClose,
}: {
  item: ScoringItem;
  marketId: number;
  year: number | undefined;
  weights: Record<ScoringCriterion, number>;
  thresholds: ScoringThresholds;
  onClose: () => void;
}) {
  return (
    <SidePanel
      onClose={onClose}
      width={480}
      gap={26}
      eyebrow={
        <>
          {item.direction}
          {item.cls && ` · ${item.cls}`} · ранг {fmtInt(item.rank)}
        </>
      }
      title={item.mnn}
      headerExtra={
        <CategoryPill category={item.category} className="self-start" />
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[44px] font-semibold leading-none tracking-[-0.03em]">
            {fmtScore(item.total)}
          </span>
          <span className="text-base text-[#9a9ea6]">/ 100</span>
        </div>
        <ScoreScale
          total={item.total}
          thresholds={thresholds}
          height={12}
          marker={14}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Figure label={`$ ${year ?? ""}`}>{fmtUsd(item.sales[2])}</Figure>
        <Figure label="CAGR $" color={growthTone(item.cagr_usd)}>
          {fmtGrowth(item.cagr_usd)}
        </Figure>
        <Figure label="Производителей">{fmtInt(item.producers)}</Figure>
      </div>

      <StopNote item={item} />
      <CriteriaTable item={item} weights={weights} variant="compact" />

      <Link
        to={`/market/${marketId}/dashboard?mnn=${encodeURIComponent(item.mnn)}`}
        className="tr-soft flex items-center gap-2 self-start rounded-ctl bg-fg px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2c2f36] hover:text-white"
      >
        Открыть дашборд МНН →
      </Link>
    </SidePanel>
  );
}

function Figure({
  label, color, children,
}: {
  label: string;
  color?: string;
  children: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-faint">{label}</span>
      <span className="whitespace-nowrap text-lg font-semibold" style={{ color }}>
        {children}
      </span>
    </div>
  );
}
