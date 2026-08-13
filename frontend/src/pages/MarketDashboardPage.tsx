import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getDashboard } from "../api/client";
import type { DashboardResponse } from "../types/api";
import MnnSearch from "../components/dashboard/MnnSearch";
import MnnScoreHeader from "../components/dashboard/MnnScoreHeader";
import DashboardFilters from "../components/dashboard/DashboardFilters";
import Zone1 from "../components/dashboard/Zone1";
import Zone2 from "../components/dashboard/Zone2";
import Zone3 from "../components/dashboard/Zone3";
import AtcBenchmark from "../components/dashboard/AtcBenchmark";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";
import { Search } from "lucide-react";

interface UrlState {
  mnn: string;
  lf: string | null;
  dose: string | null;
  year: number | null;
}

function readUrl(params: URLSearchParams): UrlState {
  const yearRaw = params.get("year");
  const yearNum = yearRaw ? parseInt(yearRaw, 10) : NaN;
  return {
    mnn: params.get("mnn") ?? "",
    lf: params.get("lf") || null,
    dose: params.get("dose") || null,
    year: Number.isFinite(yearNum) ? yearNum : null,
  };
}

function writeUrl(s: UrlState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.mnn) out.mnn = s.mnn;
  if (s.lf) out.lf = s.lf;
  if (s.dose) out.dose = s.dose;
  if (s.year != null) out.year = String(s.year);
  return out;
}

export default function MarketDashboardPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => readUrl(searchParams), [searchParams]);
  const { mnn, lf: selectedLf, dose: selectedDose, year: selectedYear } = state;

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const patch = useCallback(
    (patch: Partial<UrlState>) => {
      setSearchParams(writeUrl({ ...state, ...patch }), { replace: true });
    },
    [state, setSearchParams],
  );

  const fetchDashboard = useCallback(
    async (
      selectedMnn: string,
      lf: string | null,
      dose: string | null,
      year: number | null,
    ) => {
      if (!marketId || !selectedMnn.trim()) return;
      setLoading(true);
      setError("");
      try {
        const res = await getDashboard(
          parseInt(marketId),
          selectedMnn,
          { lf, dose, year },
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

  const handleMnnChange = useCallback(
    (newMnn: string) => {
      // Changing MNN drops filters since they depend on the MNN's own dictionary.
      setSearchParams(writeUrl({ mnn: newMnn, lf: null, dose: null, year: null }), {
        replace: true,
      });
    },
    [setSearchParams],
  );

  const handleFiltersChange = useCallback(
    (
      lf: string | null,
      dose: string | null,
      year: number | null,
    ) => {
      patch({ lf, dose, year });
    },
    [patch],
  );

  useEffect(() => {
    if (!mnn) {
      setData(null);
      return;
    }
    fetchDashboard(mnn, selectedLf, selectedDose, selectedYear);
  }, [mnn, selectedLf, selectedDose, selectedYear, fetchDashboard]);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 -mx-6 px-6 pt-6 pb-4 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 space-y-3">
        <MnnSearch
          marketId={parseInt(marketId ?? "0")}
          value={mnn}
          onChange={handleMnnChange}
        />
        {data && (
          <MnnScoreHeader
            mnn={data.mnn}
            zone1={data.zone1}
            zone2={data.zone2}
            zone3={data.zone3}
            atcBenchmark={data.atc_benchmark}
          />
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
          availableYears={data.available_years ?? data.years ?? []}
          selectedYear={selectedYear ?? data.selected_year}
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
          {data.atc_benchmark.length > 0 && (
            <>
              <div className="border-t border-slate-200" />
              <div className="space-y-4">
                {data.atc_benchmark.map((b) => (
                  <AtcBenchmark key={b.atc3} data={b} />
                ))}
              </div>
            </>
          )}
          <div className="border-t border-slate-200" />
          <Zone2
            data={data.zone2}
            marketId={parseInt(marketId ?? "0")}
            mnn={data.mnn}
            years={data.years}
          />
          <div className="border-t border-slate-200" />
          <div id="mnn-zone3-details">
            <Zone3 data={data.zone3} />
          </div>
        </div>
      )}
    </div>
  );
}
