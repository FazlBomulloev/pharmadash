import { useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getDashboard } from "../api/client";
import type { DashboardResponse } from "../types/api";
import MnnSearch from "../components/dashboard/MnnSearch";
import DashboardFilters from "../components/dashboard/DashboardFilters";
import Zone1 from "../components/dashboard/Zone1";
import Zone2 from "../components/dashboard/Zone2";
import Zone3 from "../components/dashboard/Zone3";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";
import { Search } from "lucide-react";

export default function MarketDashboardPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const [mnn, setMnn] = useState("");
  const [selectedLf, setSelectedLf] = useState<string | null>(null);
  const [selectedDose, setSelectedDose] = useState<string | null>(null);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(
    async (
      selectedMnn: string,
      lf: string | null,
      dose: string | null,
    ) => {
      if (!marketId || !selectedMnn.trim()) return;
      setLoading(true);
      setError("");
      try {
        const res = await getDashboard(
          parseInt(marketId),
          selectedMnn,
          { lf, dose },
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

  const handleMnnChange = useCallback((newMnn: string) => {
    setMnn(newMnn);
    setSelectedLf(null);
    setSelectedDose(null);
  }, []);

  const handleFiltersChange = useCallback(
    (lf: string | null, dose: string | null) => {
      setSelectedLf(lf);
      setSelectedDose(dose);
    },
    [],
  );

  useEffect(() => {
    if (!mnn) return;
    fetchDashboard(mnn, selectedLf, selectedDose);
  }, [selectedLf, selectedDose, mnn, fetchDashboard]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <MnnSearch
          marketId={parseInt(marketId ?? "0")}
          value={mnn}
          onChange={handleMnnChange}
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

      {!loading && data && data.available_forms && (
        <DashboardFilters
          availableForms={data.available_forms ?? []}
          availableDoses={data.available_doses ?? []}
          formsDosesMap={data.forms_doses_map ?? {}}
          dosesFormsMap={data.doses_forms_map ?? {}}
          selectedLf={selectedLf}
          selectedDose={selectedDose}
          onChange={handleFiltersChange}
        />
      )}

      {loading && !data && <LoadingSpinner className="h-48" size="lg" />}

      {!loading && !data && !error && (
        <EmptyState
          icon={Search}
          title="Выберите МНН"
          description="Начните вводить название МНН для получения аналитики"
        />
      )}

      {data && (
        <div
          className={`space-y-8 transition-opacity ${
            loading ? "opacity-50 pointer-events-none" : ""
          }`}
        >
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
