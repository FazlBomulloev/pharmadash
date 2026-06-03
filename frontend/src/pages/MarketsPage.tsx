import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FlaskConical,
  Globe,
  Calendar,
  ArrowRight,
  Pill,
  Trash2,
} from "lucide-react";
import { getMarkets, deleteMarket } from "../api/client";
import type { Market } from "../types/api";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getMarkets()
      .then(setMarkets)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    if (!confirm("Удалить рынок и все данные?")) return;
    await deleteMarket(id);
    setMarkets((prev) => prev.filter((m) => m.id !== id));
  }

  if (loading) return <LoadingSpinner className="h-64" />;

  if (markets.length === 0) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Нет рынков"
        description="Загрузите первый рынок через раздел «Загрузка»"
      >
        <button
          onClick={() => navigate("/admin")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Загрузить рынок
        </button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Доступные рынки
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Выберите рынок для анализа
          </p>
        </div>
        <button
          onClick={() => navigate("/admin")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <FlaskConical size={16} />
          Новый рынок
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {markets.map((market) => (
          <div
            key={market.id}
            className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 hover:border-indigo-200 cursor-pointer"
            onClick={() =>
              navigate(`/market/${market.id}/dashboard`)
            }
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/[0.02] to-purple-500/[0.02] group-hover:from-indigo-500/[0.05] group-hover:to-purple-500/[0.05] transition-all duration-300" />
            <div className="relative p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <FlaskConical size={20} className="text-white" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(market.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <h3 className="text-lg font-semibold text-slate-800 mb-3">
                {market.name}
              </h3>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Calendar size={14} />
                  <span>
                    {market.years.join(", ")}
                  </span>
                </div>
                {market.regions && market.regions.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Globe size={14} />
                    <span>
                      {market.regions.length} регион(ов)
                    </span>
                  </div>
                )}
                {market.mnn_count != null && market.mnn_count > 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Pill size={14} />
                    <span>{market.mnn_count} МНН</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 text-sm font-medium text-indigo-600 group-hover:gap-2 transition-all">
                Открыть
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
