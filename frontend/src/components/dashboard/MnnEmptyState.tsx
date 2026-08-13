import { useEffect, useMemo, useState } from "react";
import { Target, TrendingUp, Clock, Search } from "lucide-react";
import clsx from "clsx";
import { getMarketOverview } from "../../api/client";

const RECENT_KEY = "pharmdash.recent-mnn";
const RECENT_MAX = 6;

interface RecentEntry {
  mnn: string;
  ts: number; // ms
}

interface Suggestion {
  mnn: string;
  usd: number;
  score?: number;
  color?: string;
}

interface Props {
  marketId: number;
  onPick: (mnn: string) => void;
}

const COLOR_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

function readRecent(marketId: number): RecentEntry[] {
  try {
    const raw = localStorage.getItem(`${RECENT_KEY}:${marketId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is RecentEntry =>
          x && typeof x.mnn === "string" && typeof x.ts === "number",
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecentMnn(marketId: number, mnn: string) {
  try {
    const now = Date.now();
    const key = `${RECENT_KEY}:${marketId}`;
    const list = readRecent(marketId).filter((r) => r.mnn !== mnn);
    list.unshift({ mnn, ts: now });
    localStorage.setItem(key, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* localStorage disabled — ignore */
  }
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function MnnEmptyState({ marketId, onPick }: Props) {
  const [topOpp, setTopOpp] = useState<Suggestion[]>([]);
  const [topUsd, setTopUsd] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const recent = useMemo(() => readRecent(marketId), [marketId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMarketOverview(marketId)
      .then((res) => {
        if (cancelled) return;
        setTopOpp(
          res.decision.top_opportunities.slice(0, 5).map((o) => ({
            mnn: o.mnn,
            usd: o.usd,
            score: o.total_score,
            color: o.color,
          })),
        );
        setTopUsd(
          res.portfolio.top_mnn.slice(0, 5).map((m) => ({
            mnn: m.mnn,
            usd: m.usd,
          })),
        );
      })
      .catch(() => { /* silent — page stays usable via search */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [marketId]);

  const empty = !loading && topOpp.length === 0 && topUsd.length === 0 && recent.length === 0;

  if (empty) {
    return (
      <div className="text-center py-12">
        <Search size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-600 font-medium mb-1">Выберите МНН</p>
        <p className="text-xs text-slate-400">
          Начните вводить название МНН для получения аналитики
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SuggestionColumn
        icon={Target}
        iconColor="text-emerald-600 bg-emerald-50"
        title="Топ возможности"
        subtitle="лучший score в рынке"
        items={topOpp}
        loading={loading}
        onPick={onPick}
        showScore
      />
      <SuggestionColumn
        icon={Clock}
        iconColor="text-slate-600 bg-slate-100"
        title="Недавно смотренные"
        subtitle="на этом устройстве"
        items={recent.map((r) => ({ mnn: r.mnn, usd: 0 }))}
        loading={false}
        onPick={onPick}
        hideUsd
      />
      <SuggestionColumn
        icon={TrendingUp}
        iconColor="text-indigo-600 bg-indigo-50"
        title="Топ по продажам"
        subtitle="крупнейшие МНН рынка"
        items={topUsd}
        loading={loading}
        onPick={onPick}
      />
    </div>
  );
}

function SuggestionColumn({
  icon: Icon, iconColor, title, subtitle, items, loading, onPick, showScore, hideUsd,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconColor: string;
  title: string;
  subtitle: string;
  items: Suggestion[];
  loading: boolean;
  onPick: (mnn: string) => void;
  showScore?: boolean;
  hideUsd?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={clsx("w-7 h-7 rounded-lg flex items-center justify-center", iconColor)}>
          <Icon size={14} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>
      </div>
      {loading && items.length === 0 && (
        <p className="text-xs text-slate-400 py-4 text-center">Загрузка…</p>
      )}
      {!loading && items.length === 0 && (
        <p className="text-xs text-slate-400 py-4 text-center">Пока пусто</p>
      )}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.mnn}>
            <button
              onClick={() => onPick(item.mnn)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors text-left group"
            >
              {showScore && item.color && (
                <span
                  className={clsx(
                    "inline-block w-1.5 h-1.5 rounded-full flex-shrink-0",
                    COLOR_DOT[item.color] ?? "bg-slate-400",
                  )}
                  aria-hidden
                />
              )}
              <span className="flex-1 truncate text-sm text-slate-700 group-hover:text-indigo-700">
                {item.mnn}
              </span>
              {showScore && item.score != null && (
                <span className="text-xs font-semibold text-slate-600 tabular-nums">
                  {item.score.toFixed(0)}
                </span>
              )}
              {!hideUsd && item.usd > 0 && (
                <span className="text-[11px] text-slate-400 w-14 text-right tabular-nums">
                  {fmtUsd(item.usd)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
