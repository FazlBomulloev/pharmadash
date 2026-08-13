import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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

const EMPTY_FILTERS: OverviewQuery = {
  sector: "all",
  atc3: null,
  year: null,
};

export default function MarketOverviewPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<OverviewQuery>(EMPTY_FILTERS);

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
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
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
