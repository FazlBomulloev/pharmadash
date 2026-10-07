import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getMarketOverview } from "../api/client";
import type { OverviewProducer, OverviewQuery } from "../types/api";
import { useFetch } from "../hooks/useFetch";
import { useProgress } from "../hooks/useProgress";
import { fmtInt, fmtShare } from "../lib/format";
import { Page } from "../components/layout/Layout";
import {
  AtcCard, CountriesCard, MoversCard, ProducersCard, ScoringCard, TopMnnCard,
} from "../components/overview/OverviewCards";
import { OverviewHero, type HeroMode } from "../components/overview/OverviewHero";
import { CountryPanel } from "../components/panels/CountryPanel";
import { ProducerPanel } from "../components/panels/ProducerPanel";
import { PageHeader } from "../components/ui/Card";
import { Segmented } from "../components/ui/Segmented";
import { Select } from "../components/ui/Select";
import { EmptyCard, ErrorNote, Loading } from "../components/ui/states";

type Sector = NonNullable<OverviewQuery["sector"]>;

const SECTORS: { value: Sector; label: string; note: string }[] = [
  { value: "all", label: "Все секторы", note: "все секторы" },
  { value: "ret", label: "Розница", note: "розница" },
  { value: "hos", label: "Госпиталь", note: "госпиталь" },
];

interface UrlState {
  sector: Sector;
  atc3: string | null;
  year: number | null;
  mode: HeroMode;
}

function readUrl(params: URLSearchParams): UrlState {
  const sectorRaw = params.get("sector");
  const year = parseInt(params.get("year") ?? "", 10);
  return {
    sector: sectorRaw === "ret" || sectorRaw === "hos" ? sectorRaw : "all",
    atc3: params.get("atc3") || null,
    year: Number.isFinite(year) ? year : null,
    mode: params.get("mode") === "un" ? "un" : "usd",
  };
}

function writeUrl(s: UrlState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.sector !== "all") out.sector = s.sector;
  if (s.atc3) out.atc3 = s.atc3;
  if (s.year != null) out.year = String(s.year);
  if (s.mode !== "usd") out.mode = s.mode;
  return out;
}

type Panel =
  | { kind: "country"; name: string }
  | { kind: "producer"; name: string; isHome: boolean }
  | null;

export default function MarketOverviewPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = parseInt(marketId ?? "0", 10);
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => readUrl(searchParams), [searchParams]);
  const [panel, setPanel] = useState<Panel>(null);

  const patch = useCallback(
    (next: Partial<UrlState>) =>
      setSearchParams(writeUrl({ ...state, ...next }), { replace: true }),
    [state, setSearchParams],
  );

  const { data, error, loading } = useFetch(
    () => getMarketOverview(id, {
      sector: state.sector, atc3: state.atc3, year: state.year,
    }),
    [id, state.sector, state.atc3, state.year],
    "Не удалось загрузить обзор",
  );
  const t = useProgress(data);

  if (!data) {
    return (
      <Page>
        {loading ? (
          <Loading className="h-64" />
        ) : (
          <EmptyCard
            title="Нет данных для обзора"
            description={error || "Загрузите БДП в разделе «Загрузка данных»"}
          />
        )}
      </Page>
    );
  }

  const { header, volume, portfolio, decision, filters } = data;
  const years = header.available_years;
  const lastYear = years[years.length - 1] ?? null;
  const selectedYear = header.selected_year ?? lastYear;
  const dirty =
    state.sector !== "all" || !!state.atc3
    || (state.year != null && state.year !== lastYear);
  const sectorNote =
    SECTORS.find((s) => s.value === state.sector)?.note ?? "";
  const scopeNote = [sectorNote, state.atc3, selectedYear]
    .filter(Boolean)
    .join(" · ");

  const pickYear = (year: number) =>
    patch({ year: year === lastYear ? null : year });

  function pickProducer(p: OverviewProducer) {
    setPanel({ kind: "producer", name: p.name, isHome: p.is_home });
  }

  return (
    <Page>
      <PageHeader
        title={header.name}
        subtitle={
          <div className="flex flex-wrap gap-5">
            <Counter value={header.mnn_count} label="МНН" />
            <Counter value={header.producer_count} label="производителей" />
            <Counter value={header.tm_count} label="ТМ" />
          </div>
        }
      >
        <Segmented
          ariaLabel="Сектор"
          options={SECTORS}
          value={state.sector}
          onChange={(sector) => patch({ sector })}
        />
        <Select
          value={(state.atc3 ?? "").toUpperCase()}
          allLabel="Все классы ATC"
          align="right"
          width={300}
          onChange={(atc) => patch({ atc3: atc || null })}
          options={filters.options.atc3.map((a) => ({
            value: a.atc,
            label: a.atc,
            hint: fmtShare(a.share),
          }))}
        />
        {years.length > 1 && selectedYear != null && (
          <Segmented
            ariaLabel="Год"
            options={years.map((y) => ({ value: y, label: String(y) }))}
            value={selectedYear}
            onChange={pickYear}
          />
        )}
        {dirty && (
          <button
            type="button"
            onClick={() =>
              patch({ sector: "all", atc3: null, year: null })}
            className="border-0 bg-transparent px-1 py-1.5 text-[13px] font-medium text-accent hover:text-accent-hover"
          >
            Сбросить
          </button>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div
        className="flex flex-col gap-6 transition-opacity duration-200"
        style={loading ? { opacity: 0.55, pointerEvents: "none" } : undefined}
      >
        <OverviewHero
          volume={volume}
          scopeNote={scopeNote}
          mode={state.mode}
          onMode={(mode) => patch({ mode })}
          selectedYear={selectedYear}
          onYear={pickYear}
          t={t}
        />

        <section className="flex flex-wrap gap-6">
          <MoversCard
            movers={portfolio.movers}
            marketId={id}
            t={t}
            index={1}
          />
          <ScoringCard decision={decision} marketId={id} index={2} />
        </section>

        <section className="flex flex-wrap gap-6">
          <TopMnnCard items={portfolio.top_mnn} marketId={id} index={3} />
          <AtcCard
            options={filters.options.atc3}
            selected={state.atc3}
            onPick={(atc3) => patch({ atc3 })}
            index={4}
          />
        </section>

        <section className="flex flex-wrap gap-6">
          <CountriesCard
            countries={portfolio.countries}
            yearLabels={volume.years_labels}
            selected={panel?.kind === "country" ? panel.name : null}
            onPick={(name) => setPanel({ kind: "country", name })}
            index={5}
          />
          <ProducersCard
            producers={portfolio.top_producers}
            hhi={portfolio.hhi}
            selected={panel?.kind === "producer" ? panel.name : null}
            onPick={pickProducer}
            index={6}
          />
        </section>
      </div>

      {panel?.kind === "country" && (
        <CountryPanel
          key={panel.name}
          marketId={id}
          country={panel.name}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === "producer" && (
        <ProducerPanel
          key={panel.name}
          marketId={id}
          producer={panel.name}
          isHome={panel.isHome}
          onClose={() => setPanel(null)}
        />
      )}
    </Page>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <span className="whitespace-nowrap">
      <b className="font-semibold text-fg">{fmtInt(value)}</b> {label}
    </span>
  );
}
