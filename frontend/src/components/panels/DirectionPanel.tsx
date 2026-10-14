import { useState } from "react";
import { Link } from "react-router-dom";
import { getDirectionDetails } from "../../api/client";
import type { DirectionDetails } from "../../types/api";
import { useFetch } from "../../hooks/useFetch";
import { fmtGrowth, fmtInt, fmtShare, fmtUsd } from "../../lib/format";
import { growthTone } from "../../lib/palette";
import { ProgressBar, YearBars } from "../ui/bars";
import {
  KpiGrid, PanelSection, SidePanel, UnderlineTabs,
} from "../ui/SidePanel";
import { ErrorNote, Loading } from "../ui/states";

const THIN_BAR = "oklch(0.72 0.09 262)";

type Tab = "pairs" | "forms";

export function DirectionPanel({
  marketId, direction, onClose,
}: {
  marketId: number;
  direction: string;
  onClose: () => void;
}) {
  const { data, error, loading } = useFetch<DirectionDetails>(
    () => getDirectionDetails(marketId, direction),
    [marketId, direction],
    "Не удалось загрузить данные направления",
  );

  return (
    <SidePanel
      onClose={onClose}
      eyebrow="Направление · весь рынок · оценка по долям назначений"
      title={data?.name ?? direction}
      gap={32}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && loading && <Loading className="h-40" />}
      {data && <Body data={data} marketId={marketId} />}
    </SidePanel>
  );
}

function Body({
  data, marketId,
}: {
  data: DirectionDetails;
  marketId: number;
}) {
  const [tab, setTab] = useState<Tab>("pairs");
  const { kpi } = data;
  const years = data.years_labels;
  const lastYear = years[years.length - 1] ?? "";
  const maxPair = Math.max(...data.pairs.map((p) => p.usd_y3), 1e-9);

  return (
    <>
      <KpiGrid
        items={[
          { label: `USD ${lastYear}`, value: fmtUsd(kpi.usd_y3) },
          { label: "Доля рынка", value: fmtShare(kpi.share_of_market) },
          { label: "Пар МНН×ЛФ", value: fmtInt(kpi.pairs_count) },
          { label: "МНН", value: fmtInt(kpi.mnns_count) },
          {
            label: "Рост USD",
            value: fmtGrowth(kpi.usd_growth),
            color: growthTone(kpi.usd_growth),
          },
        ]}
      />

      <PanelSection title="Оценка USD по годам">
        <YearBars
          items={[kpi.usd_y1, kpi.usd_y2, kpi.usd_y3].map((v, i) => ({
            label: years[i] ?? "—",
            value: v,
            text: fmtUsd(v),
            selected: i === 2,
          }))}
        />
      </PanelSection>

      <div className="flex flex-col gap-1.5">
        <UnderlineTabs
          tabs={[
            { value: "pairs" as Tab, label: "Молекулы" },
            { value: "forms" as Tab, label: "Формы" },
          ]}
          value={tab}
          onChange={setTab}
          className="mb-1.5 border-b border-[#ecece8]"
        />

        {tab === "pairs" && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_84px_60px_56px_16px] gap-2.5 py-1 text-[11px] text-faint">
              <span>МНН × ЛФ</span>
              <span className="text-right">USD</span>
              <span className="text-right">Доля напр.</span>
              <span className="text-right">г/г</span>
              <span />
            </div>
            {data.pairs.map((p) => (
              <Link
                key={`${p.mnn}|${p.lf}`}
                to={
                  `/market/${marketId}/dashboard`
                  + `?mnn=${encodeURIComponent(p.mnn)}`
                  + `&lf=${encodeURIComponent(p.lf)}`
                }
                className="tr-soft grid grid-cols-[minmax(0,1fr)_84px_60px_56px_16px] items-center gap-2.5 border-t border-[#f3f3f0] py-2 text-sm text-fg hover:bg-[#f7f7f4] hover:text-fg"
              >
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <span className="truncate" title={`${p.mnn} · ${p.lf}`}>
                    {p.mnn} <span className="text-muted-2">· {p.lf}</span>
                  </span>
                  <ProgressBar
                    value={p.usd_y3 / maxPair}
                    color={THIN_BAR}
                    height={3}
                  />
                </span>
                <span className="text-right font-medium">
                  {fmtUsd(p.usd_y3)}
                </span>
                <span className="text-right text-[13px]">
                  {fmtShare(p.share_in_pair)}
                </span>
                <span
                  className="text-right text-[13px] font-medium"
                  style={{ color: growthTone(p.growth) }}
                >
                  {fmtGrowth(p.growth)}
                </span>
                <span className="text-[#b5b8be]">→</span>
              </Link>
            ))}
          </>
        )}

        {tab === "forms" && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_84px_60px] gap-2.5 py-1 text-[11px] text-faint">
              <span>Форма</span>
              <span className="text-right">USD</span>
              <span className="text-right">В направлении</span>
            </div>
            {data.forms.map((f) => (
              <div
                key={f.form}
                className="grid grid-cols-[minmax(0,1fr)_84px_60px] items-center gap-2.5 border-t border-[#f3f3f0] py-2 text-sm"
              >
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <span className="truncate">{f.form}</span>
                  <ProgressBar
                    value={f.share_in_direction}
                    color={THIN_BAR}
                    height={3}
                  />
                </span>
                <span className="text-right font-medium">
                  {fmtUsd(f.usd_y3)}
                </span>
                <span className="text-right text-[13px] text-muted-2">
                  {fmtShare(f.share_in_direction)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
