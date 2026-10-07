import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getDashboard } from "../api/client";
import type { DashboardResponse } from "../types/api";
import { useFetch } from "../hooks/useFetch";
import { useProgress } from "../hooks/useProgress";
import { CompetitorsTab } from "../components/dashboard/CompetitorsTab";
import { MnnEmptyState } from "../components/dashboard/MnnEmptyState";
import { pushRecentMnn } from "../lib/recentMnn";
import { MnnHero } from "../components/dashboard/MnnHero";
import { MnnSearch } from "../components/dashboard/MnnSearch";
import {
  GeographyTab, StructureTab,
} from "../components/dashboard/StructureGeoTabs";
import { ScoringTab, SummaryTab } from "../components/dashboard/SummaryTab";
import { CountryPanel } from "../components/panels/CountryPanel";
import { Segmented } from "../components/ui/Segmented";
import { Select } from "../components/ui/Select";
import { UnderlineTabs } from "../components/ui/SidePanel";
import { ErrorNote, Loading } from "../components/ui/states";

type Tab = "summary" | "competitors" | "structure" | "geo" | "scoring";

const TABS: { value: Tab; label: string }[] = [
  { value: "summary", label: "Сводка" },
  { value: "competitors", label: "Конкуренты" },
  { value: "structure", label: "Структура" },
  { value: "geo", label: "География" },
  { value: "scoring", label: "Скоринг" },
];

interface UrlState {
  mnn: string;
  tab: Tab;
  lf: string | null;
  dose: string | null;
  year: number | null;
}

function readUrl(params: URLSearchParams): UrlState {
  const year = parseInt(params.get("year") ?? "", 10);
  const tab = params.get("tab") as Tab;
  return {
    mnn: params.get("mnn") ?? "",
    tab: TABS.some((x) => x.value === tab) ? tab : "summary",
    lf: params.get("lf") || null,
    dose: params.get("dose") || null,
    year: Number.isFinite(year) ? year : null,
  };
}

function writeUrl(s: UrlState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.mnn) out.mnn = s.mnn;
  if (s.tab !== "summary") out.tab = s.tab;
  if (s.lf) out.lf = s.lf;
  if (s.dose) out.dose = s.dose;
  if (s.year != null) out.year = String(s.year);
  return out;
}

const GUTTER = "px-[clamp(20px,3vw,40px)]";

export default function MarketDashboardPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = parseInt(marketId ?? "0", 10);
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => readUrl(searchParams), [searchParams]);
  const [country, setCountry] = useState<string | null>(null);

  const patch = useCallback(
    (next: Partial<UrlState>) =>
      setSearchParams(writeUrl({ ...state, ...next }), { replace: true }),
    [state, setSearchParams],
  );

  const { data, error, loading } = useFetch<DashboardResponse | null>(
    () => state.mnn
      ? getDashboard(id, state.mnn, {
          lf: state.lf, dose: state.dose, year: state.year,
        })
      : Promise.resolve(null),
    [id, state.mnn, state.lf, state.dose, state.year],
    "МНН не найден или ошибка загрузки",
  );
  // Ответ относится к выбранному МНН (а не к предыдущему, пока идёт запрос).
  const current = state.mnn ? data : null;
  const loadedMnn = current?.mnn;

  useEffect(() => {
    if (loadedMnn) pushRecentMnn(id, loadedMnn);
  }, [id, loadedMnn]);

  // Прогресс появления перезапускается при новых данных и смене вкладки.
  const animKey = useMemo(() => ({ current, tab: state.tab }), [current, state.tab]);
  const t = useProgress(animKey);

  // Смена МНН сбрасывает фильтры: формы и дозировки у каждого МНН свои.
  const pickMnn = useCallback(
    (mnn: string) => {
      setCountry(null);
      setSearchParams(
        writeUrl({ mnn, tab: "summary", lf: null, dose: null, year: null }),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const goScoring = () => patch({ tab: "scoring" });
  const years = current?.available_years ?? [];
  const lastYear = years[years.length - 1] ?? null;
  const selectedYear = current?.selected_year ?? lastYear;
  const pickYear = (year: number) =>
    patch({ year: year === lastYear ? null : year });
  const dirty =
    !!state.lf || !!state.dose
    || (state.year != null && state.year !== lastYear);

  // Каждый фильтр сужается вторым, чтобы не получить пустую выборку.
  const forms = current
    ? state.dose
      ? current.doses_forms_map[state.dose] ?? []
      : current.available_forms
    : [];
  const doses = current
    ? state.lf
      ? current.forms_doses_map[state.lf] ?? []
      : current.available_doses
    : [];

  return (
    <main className="flex min-w-0 flex-col">
      <div className={`flex flex-col gap-[18px] pb-1.5 pt-5 ${GUTTER}`}>
        <MnnSearch marketId={id} value={state.mnn} onChange={pickMnn} />
        {current && (
          <MnnHero data={current} onYear={pickYear} onScore={goScoring} t={t} />
        )}
      </div>

      {current && (
        <div
          className={`sticky top-0 z-30 border-b border-[#e9e9e5] bg-[rgba(244,244,241,.94)] pt-1.5 backdrop-blur-[8px] ${GUTTER}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <UnderlineTabs
              className="gap-6! [&>button]:pb-3 [&>button]:pt-2.5"
              tabs={TABS}
              value={state.tab}
              onChange={(tab) => patch({ tab })}
            />
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <Select
                label="Форма"
                value={state.lf ?? ""}
                allLabel="Все"
                align="right"
                onChange={(lf) => patch({ lf: lf || null })}
                options={forms.map((f) => ({ value: f, label: f }))}
              />
              <Select
                label="Доза"
                value={state.dose ?? ""}
                allLabel="Все"
                align="right"
                onChange={(dose) => patch({ dose: dose || null })}
                options={doses.map((d) => ({ value: d, label: d }))}
              />
              {years.length > 1 && selectedYear != null && (
                <Segmented
                  ariaLabel="Год"
                  size="sm"
                  options={years.map((y) => ({ value: y, label: String(y) }))}
                  value={selectedYear}
                  onChange={pickYear}
                />
              )}
              {dirty && (
                <button
                  type="button"
                  onClick={() => patch({ lf: null, dose: null, year: null })}
                  className="border-0 bg-transparent text-[13px] font-medium text-accent hover:text-accent-hover"
                >
                  Сбросить
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={`flex flex-col gap-7 pb-[72px] pt-7 transition-opacity duration-200 ${GUTTER}`}
        style={
          loading && current ? { opacity: 0.55, pointerEvents: "none" } : undefined
        }
      >
        {error && state.mnn && <ErrorNote>{error}</ErrorNote>}
        {state.mnn && !current && loading && <Loading className="h-48" />}
        {!state.mnn && <MnnEmptyState marketId={id} onPick={pickMnn} />}

        {current && (
          // key — вкладка: при переключении карточки появляются заново
          <TabContent
            key={state.tab}
            tab={state.tab}
            data={current}
            t={t}
            onScore={goScoring}
            country={country}
            onCountry={setCountry}
          />
        )}
      </div>

      {current && country && (
        <CountryPanel
          key={country}
          marketId={id}
          country={country}
          mnn={current.mnn}
          onClose={() => setCountry(null)}
        />
      )}
    </main>
  );
}

function TabContent({
  tab, data, t, onScore, country, onCountry,
}: {
  tab: Tab;
  data: DashboardResponse;
  t: number;
  onScore: () => void;
  country: string | null;
  onCountry: (country: string) => void;
}) {
  switch (tab) {
    case "summary":
      return <SummaryTab data={data} onScore={onScore} t={t} />;
    case "competitors":
      return <CompetitorsTab data={data} t={t} />;
    case "structure":
      return <StructureTab data={data} t={t} />;
    case "geo":
      return (
        <GeographyTab
          data={data}
          selectedCountry={country}
          onCountry={onCountry}
          t={t}
        />
      );
    case "scoring":
      return <ScoringTab data={data} t={t} />;
  }
}
