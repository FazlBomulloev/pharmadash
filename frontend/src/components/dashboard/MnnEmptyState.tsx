import { getMarketScoring, suggestMnn } from "../../api/client";
import { useFetch } from "../../hooks/useFetch";
import { fmtScore, fmtUsd } from "../../lib/format";
import { stagger } from "../../lib/anim";
import { RECENT_LIMIT, readRecentMnn } from "../../lib/recentMnn";

interface Column {
  title: string;
  sub: string;
  items: { name: string; value: string }[];
  empty: string;
}

export function MnnEmptyState({
  marketId, onPick,
}: {
  marketId: number;
  onPick: (mnn: string) => void;
}) {
  const best = useFetch((signal) => suggestMnn(marketId, "", signal), [marketId]);
  const bySales = useFetch(
    (signal) => getMarketScoring(
      marketId, { sort: "usd", order: "desc", page_size: RECENT_LIMIT }, signal,
    ),
    [marketId],
  );
  const recent = readRecentMnn(marketId);

  const columns: Column[] = [
    {
      title: "Топ возможности",
      sub: "лучшие по баллу скоринга",
      items: (best.data ?? []).map((s) => ({
        name: s.mnn, value: fmtScore(s.total, 0),
      })),
      empty: best.loading ? "Загрузка…" : "Нет МНН, прошедших стоп-фильтр",
    },
    {
      title: "Недавно смотренные",
      sub: "на этом устройстве",
      items: recent.map((name) => ({ name, value: "" })),
      empty: "Вы ещё не открывали МНН этого рынка",
    },
    {
      title: "Топ по продажам",
      sub: "USD за последний год",
      items: (bySales.data?.items ?? []).map((i) => ({
        name: i.mnn, value: fmtUsd(i.sales[2]),
      })),
      empty: bySales.loading ? "Загрузка…" : "Нет данных",
    },
  ];

  return (
    <div className="flex flex-col gap-7 pt-6">
      <div className="anim-head flex flex-col gap-1.5">
        <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em]">
          Выберите МНН
        </h1>
        <span className="text-[15px] text-muted-2">
          Начните вводить название в поиске или откройте один из списков
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
        {columns.map((col, i) => (
          <div
            key={col.title}
            className="anim-rise flex flex-col rounded-card bg-surface px-[22px] py-5"
            style={stagger(i)}
          >
            <span className="text-[17px] font-semibold tracking-[-0.01em]">
              {col.title}
            </span>
            <span className="pb-2.5 pt-0.5 text-xs text-faint">{col.sub}</span>
            {col.items.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => onPick(item.name)}
                className="tr-soft -mx-2 flex justify-between gap-3 rounded-row border-0 border-t border-[#f3f3f0] bg-transparent px-2 py-2.5 text-left text-sm text-fg hover:bg-[#f7f7f4]"
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="shrink-0 font-medium text-muted-2">
                  {item.value}
                </span>
              </button>
            ))}
            {col.items.length === 0 && (
              <span className="border-t border-[#f3f3f0] py-2.5 text-sm text-faint">
                {col.empty}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
