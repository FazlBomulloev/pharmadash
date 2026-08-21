import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Compass } from "lucide-react";
import { getMarketOverview } from "../api/client";
import type { OverviewResponse, OverviewQuery } from "../types/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";
import OverviewHeader from "../components/overview/OverviewHeader";
import OverviewFilters from "../components/overview/OverviewFilters";
import OverviewDecisionStrip from "../components/overview/OverviewDecisionStrip";
import OverviewVolume from "../components/overview/OverviewVolume";
import OverviewPortfolio from "../components/overview/OverviewPortfolio";
import OverviewGrls from "../components/overview/OverviewGrls";
import OverviewPc from "../components/overview/OverviewPc";
import OverviewDecision from "../components/overview/OverviewDecision";

function readFilters(params: URLSearchParams): OverviewQuery {
  const sectorRaw = params.get("sector");
  const sector: OverviewQuery["sector"] =
    sectorRaw === "ret" || sectorRaw === "hos" ? sectorRaw : "all";
  const atc3 = params.get("atc3") || null;
  const yearRaw = params.get("year");
  const yearNum = yearRaw ? parseInt(yearRaw, 10) : NaN;
  const year = Number.isFinite(yearNum) ? yearNum : null;
  return { sector, atc3, year };
}

function writeFilters(f: OverviewQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.sector && f.sector !== "all") out.sector = f.sector;
  if (f.atc3) out.atc3 = f.atc3;
  if (f.year != null) out.year = String(f.year);
  return out;
}

export default function MarketOverviewPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(
    () => readFilters(searchParams),
    [searchParams],
  );

  const setFilters = useCallback(
    (next: OverviewQuery) => {
      setSearchParams(writeFilters(next), { replace: true });
    },
    [setSearchParams],
  );

  const load = useCallback(
    async (query: OverviewQuery) => {
      if (!marketId) return;
      setLoading(true);
      setError("");
      try {
        const res = await getMarketOverview(parseInt(marketId), query);
        setData(res);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })
            ?.response?.data?.detail ?? "Не удалось загрузить обзор";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [marketId],
  );

  useEffect(() => {
    load(filters);
  }, [load, filters]);

  if (loading && !data) {
    return <LoadingSpinner className="h-64" size="lg" />;
  }

  if (error && !data) {
    return (
      <EmptyState
        icon={Compass}
        title="Нет данных для обзора"
        description={error || "Загрузите БДП через раздел «Загрузка»"}
      />
    );
  }

  if (!data) return null;

  const marketId_ = data.header.market_id;

  return (
    <div className="space-y-8">
      <OverviewHeader
        header={data.header}
        onFxUpdated={() => load(filters)}
      />

      <OverviewDecisionStrip
        data={data.decision}
        marketId={marketId_}
      />

      <OverviewFilters
        filters={data.filters}
        value={filters}
        availableYears={
          data.header.available_years ?? data.header.years ?? []
        }
        onChange={setFilters}
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div
        className={loading ? "opacity-50 pointer-events-none transition-opacity" : ""}
      >
        <div className="space-y-8">
          <OverviewVolume data={data.volume} />
          <OverviewPortfolio data={data.portfolio} marketId={marketId_} />
          {data.grls && <OverviewGrls data={data.grls} />}
          {data.pc && <OverviewPc data={data.pc} />}
          <div id="overview-decision-details">
            <OverviewDecision data={data.decision} marketId={marketId_} />
          </div>
        </div>
      </div>
    </div>
  );
}
