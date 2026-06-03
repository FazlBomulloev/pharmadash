import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getDashboard } from "../api/client";
import type { DashboardResponse } from "../types/api";
import MnnSearch from "../components/dashboard/MnnSearch";
import Zone1 from "../components/dashboard/Zone1";
import Zone2 from "../components/dashboard/Zone2";
import Zone3 from "../components/dashboard/Zone3";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";
import { Search } from "lucide-react";

export default function MarketDashboardPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const [mnn, setMnn] = useState("");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(
    async (selectedMnn: string) => {
      if (!marketId || !selectedMnn.trim()) return;
      setMnn(selectedMnn);
      setLoading(true);
      setError("");
      try {
        const res = await getDashboard(
          parseInt(marketId),
          selectedMnn,
        );
        setData(res);
      } catch {
        setError("МНН не найден или ошибка загрузки");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [marketId],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <MnnSearch
          marketId={parseInt(marketId ?? "0")}
          value={mnn}
          onChange={loadDashboard}
        />
        {data && (
          <div className="px-4 py-2 bg-indigo-50 rounded-lg">
            <span className="text-sm font-semibold text-indigo-700">
              {data.mnn}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && <LoadingSpinner className="h-48" size="lg" />}

      {!loading && !data && !error && (
        <EmptyState
          icon={Search}
          title="Выберите МНН"
          description="Начните вводить название МНН для получения аналитики"
        />
      )}

      {!loading && data && (
        <div className="space-y-8">
          <Zone1 data={data.zone1} />
          <div className="border-t border-slate-200" />
          <Zone2 data={data.zone2} />
          <div className="border-t border-slate-200" />
          <Zone3 data={data.zone3} />
        </div>
      )}
    </div>
  );
}
