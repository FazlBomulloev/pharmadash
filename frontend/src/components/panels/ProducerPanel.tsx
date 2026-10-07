import { Link } from "react-router-dom";
import { getProducerDetails } from "../../api/client";
import type { ProducerDetails } from "../../types/api";
import { useFetch } from "../../hooks/useFetch";
import {
  fmtGrowth, fmtInt, fmtShare, fmtUnits, fmtUsd, titleCase,
} from "../../lib/format";
import { atcColor, growthTone } from "../../lib/palette";
import { ProgressBar, YearBars } from "../ui/bars";
import { CountryChip } from "../ui/chips";
import { KpiGrid, PanelSection, SidePanel } from "../ui/SidePanel";
import { ErrorNote, Loading } from "../ui/states";

const ATC_LEGEND_LIMIT = 6;
const PORTFOLIO_LIMIT = 8;

/** Панель производителя в масштабе всего рынка. */
export function ProducerPanel({
  marketId, producer, isHome, onClose,
}: {
  marketId: number;
  producer: string;
  isHome: boolean;
  onClose: () => void;
}) {
  const { data, error, loading } = useFetch<ProducerDetails>(
    () => getProducerDetails(marketId, producer),
    [marketId, producer],
    "Не удалось загрузить данные производителя",
  );
  const country = data?.kpi.top_country ?? null;
  const rank = data?.kpi.rank;

  return (
    <SidePanel
      onClose={onClose}
      eyebrow={
        <>
          {country && <CountryChip country={country} isHome={isHome} />}
          <span>
            Производитель
            {country && ` · ${titleCase(country)}`}
            {rank != null && ` · ${rank}-й на рынке`}
          </span>
        </>
      }
      title={data?.name ?? producer}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && loading && <Loading className="h-40" />}
      {data && <Body data={data} marketId={marketId} />}
    </SidePanel>
  );
}

function Body({ data, marketId }: { data: ProducerDetails; marketId: number }) {
  const { kpi } = data;
  const years = kpi.years_labels;
  const lastYear = years[years.length - 1] ?? "";
  const shares = kpi.shares_by_year ?? [null, null, kpi.share_of_market];

  // Хвост классов сворачивается в «Прочие», чтобы легенда не разрасталась.
  const atcAll = data.atc_breakdown ?? [];
  const atcHead = atcAll.slice(0, ATC_LEGEND_LIMIT);
  const tailShare = atcAll
    .slice(ATC_LEGEND_LIMIT)
    .reduce((sum, a) => sum + a.share, 0);
  const atc = [
    ...atcHead.map((a) => ({
      key: a.atc, label: a.atc, share: a.share, color: atcColor(a.atc),
    })),
    ...(tailShare > 0
      ? [{ key: "__rest", label: "Прочие", share: tailShare, color: "#c4c7cc" }]
      : []),
  ];

  const portfolio = (data.mnn_portfolio ?? []).slice(0, PORTFOLIO_LIMIT);
  const maxMnn = Math.max(...portfolio.map((m) => m.usd_y3), 1e-9);

  return (
    <>
      <KpiGrid
        items={[
          { label: `USD ${lastYear}`, value: fmtUsd(kpi.usd_y3) },
          { label: "Доля рынка", value: fmtShare(kpi.share_of_market) },
          {
            label: "Рост USD",
            value: fmtGrowth(kpi.usd_growth),
            color: growthTone(kpi.usd_growth),
          },
          { label: "Упаковки", value: fmtUnits(kpi.un_y3) },
          { label: "МНН в портфеле", value: fmtInt(kpi.mnn_count) },
          { label: "Торговых марок", value: fmtInt(kpi.tm_count) },
        ]}
      />

      <PanelSection title="Доля рынка по годам">
        <YearBars
          items={shares.map((s, i) => ({
            label: years[i] ?? "—",
            value: s ?? 0,
            text: fmtShare(s),
            selected: i === shares.length - 1,
          }))}
        />
      </PanelSection>

      {atc.length > 0 && (
        <PanelSection title="Классы ATC в портфеле">
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-[5px]">
            {atc.map((a) => (
              <span
                key={a.key}
                title={`${a.label} · ${fmtShare(a.share)}`}
                style={{ flex: `${a.share} 1 0%`, background: a.color }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {atc.map((a) => (
              <span
                key={a.key}
                className="flex min-w-0 items-center gap-2 text-[13px]"
              >
                <span
                  className="size-[9px] shrink-0 rounded-[3px]"
                  style={{ background: a.color }}
                />
                <span className="min-w-0 flex-1 truncate text-muted">
                  {a.label}
                </span>
                <span className="font-semibold">{fmtShare(a.share)}</span>
              </span>
            ))}
          </div>
        </PanelSection>
      )}

      {portfolio.length > 0 && (
        <div className="flex flex-col">
          <div className="grid grid-cols-[minmax(0,1fr)_84px_60px_56px_16px] gap-2.5 pb-1.5 text-[11px] text-faint">
            <span>Портфель МНН</span>
            <span className="text-right">USD</span>
            <span className="text-right">В портф.</span>
            <span className="text-right">г/г</span>
            <span />
          </div>
          {portfolio.map((m) => (
            <Link
              key={m.mnn}
              to={`/market/${marketId}/dashboard?mnn=${encodeURIComponent(m.mnn)}`}
              className="tr-soft grid grid-cols-[minmax(0,1fr)_84px_60px_56px_16px] items-center gap-2.5 border-t border-[#f3f3f0] py-2 text-sm text-fg hover:bg-[#f7f7f4] hover:text-fg"
            >
              <span className="flex min-w-0 flex-col gap-[5px]">
                <span className="truncate" title={m.mnn}>{m.mnn}</span>
                <ProgressBar value={m.usd_y3 / maxMnn} />
              </span>
              <span className="text-right font-medium">{fmtUsd(m.usd_y3)}</span>
              <span className="text-right text-[13px]">
                {fmtShare(m.share_in_producer)}
              </span>
              <span
                className="text-right text-[13px] font-medium"
                style={{ color: growthTone(m.growth) }}
              >
                {fmtGrowth(m.growth)}
              </span>
              <span className="text-[#b5b8be]">→</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
