import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { getCountryDetails } from "../../api/client";
import type { CountryDetails } from "../../types/api";
import { useFetch } from "../../hooks/useFetch";
import {
  fmtGrowth, fmtInt, fmtShare, fmtUnits, fmtUsd, titleCase,
} from "../../lib/format";
import { growthTone } from "../../lib/palette";
import { ProgressBar, YearBars } from "../ui/bars";
import {
  KpiGrid, PanelSection, SidePanel, UnderlineTabs,
} from "../ui/SidePanel";
import { ErrorNote, Loading } from "../ui/states";

const THIN_BAR = "oklch(0.72 0.09 262)";

type Tab = "producers" | "mnn";

export function CountryPanel({
  marketId, country, mnn, onClose,
}: {
  marketId: number;
  country: string;
  mnn?: string | null;
  onClose: () => void;
}) {
  const { data, error, loading } = useFetch<CountryDetails>(
    () => getCountryDetails(marketId, country, mnn),
    [marketId, country, mnn],
    "Не удалось загрузить данные страны",
  );

  return (
    <SidePanel
      onClose={onClose}
      eyebrow={`Страна производства · ${mnn ? mnn : "весь рынок"}`}
      title={titleCase(data?.name ?? country)}
      gap={32}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && loading && <Loading className="h-40" />}
      {data && <Body data={data} marketId={marketId} inMnn={!!mnn} />}
    </SidePanel>
  );
}

function Body({
  data, marketId, inMnn,
}: {
  data: CountryDetails;
  marketId: number;
  inMnn: boolean;
}) {
  const [tab, setTab] = useState<Tab>("producers");
  const [formName, setFormName] = useState<string | null>(null);
  const { kpi } = data;
  const years = kpi.years_labels;
  const lastYear = years[years.length - 1] ?? "";
  const scope = inMnn ? "Доля в МНН" : "Доля рынка";

  const forms = data.forms_breakdown;
  const form = forms.find((f) => f.form === formName) ?? forms[0];
  const mnnPortfolio = data.mnn_portfolio ?? [];
  const tabs: { value: Tab; label: string }[] = [
    { value: "producers", label: "Производители" },
    ...(mnnPortfolio.length > 0
      ? [{ value: "mnn" as Tab, label: "Портфель МНН" }]
      : []),
  ];
  const maxProducer = Math.max(...data.producers.map((p) => p.usd_y3), 1e-9);
  const maxMnn = Math.max(...mnnPortfolio.map((m) => m.usd_y3), 1e-9);

  return (
    <>
      <KpiGrid
        items={[
          { label: `USD ${lastYear}`, value: fmtUsd(kpi.usd_y3) },
          { label: "Упаковки", value: fmtUnits(kpi.un_y3) },
          { label: scope, value: fmtShare(kpi.share_of_market) },
          { label: "Производителей", value: fmtInt(kpi.producers_count) },
          { label: "МНН", value: fmtInt(kpi.mnns_count) },
          {
            label: "Рост USD",
            value: fmtGrowth(kpi.usd_growth),
            color: growthTone(kpi.usd_growth),
          },
        ]}
      />

      <PanelSection title={`${scope} по годам`}>
        <YearBars
          items={[kpi.share_y1, kpi.share_y2, kpi.share_y3].map((s, i) => ({
            label: years[i] ?? "—",
            value: s ?? 0,
            text: fmtShare(s),
            selected: i === 2,
          }))}
        />
      </PanelSection>

      <div className="flex flex-col gap-1.5">
        <UnderlineTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          className="mb-1.5 border-b border-[#ecece8]"
        />
        {tab === "producers" && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_84px_52px_52px_56px] gap-2.5 py-1 text-[11px] text-faint">
              <span>Производитель</span>
              <span className="text-right">USD</span>
              <span className="text-right">В стране</span>
              <span className="text-right">{inMnn ? "В МНН" : "Рынка"}</span>
              <span className="text-right">г/г</span>
            </div>
            {data.producers.map((p) => (
              <div
                key={p.name}
                className="grid grid-cols-[minmax(0,1fr)_84px_52px_52px_56px] items-center gap-2.5 border-t border-[#f3f3f0] py-2 text-sm"
              >
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <span className="truncate" title={p.name}>{p.name}</span>
                  <ProgressBar
                    value={p.usd_y3 / maxProducer}
                    color={THIN_BAR}
                    height={3}
                  />
                </span>
                <span className="text-right font-medium">{fmtUsd(p.usd_y3)}</span>
                <span className="text-right text-[13px]">
                  {fmtShare(p.share_in_country)}
                </span>
                <span className="text-right text-[13px] text-muted-2">
                  {fmtShare(p.share_in_market)}
                </span>
                <span
                  className="text-right text-[13px] font-medium"
                  style={{ color: growthTone(p.growth) }}
                >
                  {fmtGrowth(p.growth)}
                </span>
              </div>
            ))}
          </>
        )}
        {tab === "mnn" && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_84px_60px_56px_16px] gap-2.5 py-1 text-[11px] text-faint">
              <span>МНН</span>
              <span className="text-right">USD</span>
              <span className="text-right">В стране</span>
              <span className="text-right">г/г</span>
              <span />
            </div>
            {mnnPortfolio.map((m) => (
              <Link
                key={m.mnn}
                to={`/market/${marketId}/dashboard?mnn=${encodeURIComponent(m.mnn)}`}
                className="tr-soft grid grid-cols-[minmax(0,1fr)_84px_60px_56px_16px] items-center gap-2.5 border-t border-[#f3f3f0] py-2 text-sm text-fg hover:bg-[#f7f7f4] hover:text-fg"
              >
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <span className="truncate" title={m.mnn}>{m.mnn}</span>
                  <ProgressBar
                    value={m.usd_y3 / maxMnn}
                    color={THIN_BAR}
                    height={3}
                  />
                </span>
                <span className="text-right font-medium">{fmtUsd(m.usd_y3)}</span>
                <span className="text-right text-[13px]">
                  {fmtShare(m.share_in_country)}
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
          </>
        )}
      </div>

      {form && (
        <PanelSection title="Формы и торговые марки" gap={14}>
          <div className="flex flex-wrap gap-2">
            {forms.map((f) => {
              const active = f.form === form.form;
              return (
                <button
                  key={f.form}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFormName(f.form)}
                  className={clsx(
                    "tr-soft flex items-center gap-1.5 rounded-full border px-3 py-[7px] text-[13px] font-medium",
                    active
                      ? "border-fg bg-fg text-white"
                      : "border-line-strong bg-white text-fg hover:bg-subtle",
                  )}
                >
                  {f.form}
                  <span className="opacity-60">
                    {fmtShare(f.share_in_country)}
                  </span>
                </button>
              );
            })}
          </div>
          <div>
            <div className="flex justify-between pb-2 pt-1 text-[13px] text-muted-2">
              <span>{form.form}</span>
              <span>
                {fmtUsd(form.usd_y3)} · {fmtShare(form.share_in_country)}
              </span>
            </div>
            {form.tms.map((tm) => (
              <div
                key={tm.tm}
                className="grid grid-cols-[minmax(0,1fr)_84px_52px] items-center gap-2.5 border-t border-[#f3f3f0] py-2 text-sm"
              >
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <span className="truncate" title={tm.tm}>{tm.tm}</span>
                  <ProgressBar
                    value={tm.share_in_form}
                    color={THIN_BAR}
                    height={3}
                  />
                </span>
                <span className="text-right font-medium">{fmtUsd(tm.usd_y3)}</span>
                <span className="text-right text-[13px] text-muted-2">
                  {fmtShare(tm.share_in_form)}
                </span>
              </div>
            ))}
          </div>
        </PanelSection>
      )}
    </>
  );
}
