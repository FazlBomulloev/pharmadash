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
import clsx from "clsx";
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
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Доступные рынки
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Выберите рынок для анализа
          </p>
        </div>
        <button
          onClick={() => navigate("/admin")}
          className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 dark:hover:bg-indigo-400 transition-colors flex items-center gap-2"
        >
          <FlaskConical size={16} />
          Новый рынок
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {markets.map((market) => (
          <div
            key={market.id}
            className="group relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition-all duration-300 hover:border-indigo-200 dark:hover:border-indigo-800 cursor-pointer"
            onClick={() =>
              navigate(`/market/${market.id}/overview`)
            }
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/[0.02] to-purple-500/[0.02] dark:from-indigo-500/[0.06] dark:to-purple-500/[0.06] group-hover:from-indigo-500/[0.05] group-hover:to-purple-500/[0.05] dark:group-hover:from-indigo-500/[0.10] dark:group-hover:to-purple-500/[0.10] transition-all duration-300" />
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
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
                {market.name}
              </h3>

              <div className="flex gap-1.5 mb-3">
                <span className={clsx(
                  "px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide",
                  "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
                )}>БДП ✓</span>
                <span className={clsx(
                  "px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide",
                  market.has_pc
                    ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
                )}>РС {market.has_pc ? "✓" : "—"}</span>
                <span className={clsx(
                  "px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide",
                  market.has_grls
                    ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
                )}>ГРЛС {market.has_grls ? "✓" : "—"}</span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Calendar size={14} />
                  <span>
                    {market.years.join(", ")}
                  </span>
                </div>
                {market.regions && market.regions.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Globe size={14} />
                    <span>
                      {market.regions.length} регион(ов)
                    </span>
                  </div>
                )}
                {market.mnn_count != null && market.mnn_count > 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Pill size={14} />
                    <span>{market.mnn_count} МНН</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 group-hover:gap-2 transition-all">
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
