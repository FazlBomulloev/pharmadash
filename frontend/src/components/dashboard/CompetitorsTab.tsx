import type { Competitor, DashboardResponse } from "../../types/api";
import {
  fmtInt, fmtPct, fmtShare, fmtUsd, plural, titleCase,
} from "../../lib/format";
import {
  countryBar, countryChip, countryMeta, hhiLevel,
} from "../../lib/palette";
import { ProgressBar, ZoneScale } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";
import { CountryChip, GrowthChip, Pill } from "../ui/chips";

const MAX_DOTS = 60;
const STACK_TOP = 5;
const STACK_SHADES = [
  "oklch(0.45 0.16 268)", "oklch(0.55 0.15 268)", "oklch(0.65 0.13 268)",
  "oklch(0.75 0.1 268)", "oklch(0.84 0.07 268)",
];

const PRODUCER_GRID =
  "grid min-w-[720px] gap-3 " +
  "grid-cols-[20px_minmax(200px,1.4fr)_130px_90px_56px_72px_72px]";
const FORM_GRID =
  "grid min-w-[640px] gap-3 grid-cols-[minmax(160px,1fr)_140px_150px_100px_110px]";

export function CompetitorsTab({
  data, t,
}: {
  data: DashboardResponse;
  t: number;
}) {
  const { zone1, zone2 } = data;
  const level = hhiLevel(zone2.hhi);
  const leader = zone2.top_competitors[0];
  const top = zone2.top_competitors.slice(0, STACK_TOP);
  const restShare = Math.max(0, 1 - top.reduce((s, c) => s + c.share, 0));
  const total = zone1.total_producers;
  const active = zone1.active_competitors;
  const dots = Math.min(total, MAX_DOTS);
  const maxShare = Math.max(
    ...zone2.top_competitors.map((c) => c.share), 1e-9,
  );

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5">
        <Card anim="tab" index={0} className="flex flex-col gap-3.5">
          <span className="text-[13px] text-muted-2">Концентрация (HHI)</span>
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="text-4xl font-semibold leading-none tracking-[-0.03em]">
              {fmtInt(zone2.hhi == null ? null : zone2.hhi * t)}
            </span>
            {level && (
              <Pill style={{ background: level.background, color: level.color }}>
                {level.label}
              </Pill>
            )}
          </span>
          <div className="flex flex-col gap-1.5">
            <ZoneScale
              value={zone2.hhi ?? 0}
              max={10000}
              height={10}
              marker={16}
              zones={[
                { to: 1500, color: "oklch(0.78 0.12 155)" },
                { to: 2500, color: "oklch(0.82 0.13 80)" },
                { to: 10000, color: "oklch(0.72 0.15 25)" },
              ]}
            />
            <div className="relative h-3.5 text-[11px] text-faint">
              <span className="absolute left-0">0</span>
              <span className="absolute left-[15%] -translate-x-1/2">1 500</span>
              <span className="absolute left-[25%] -translate-x-[10%]">2 500</span>
              <span className="absolute right-0">10 000</span>
            </div>
          </div>
        </Card>

        <Card anim="tab" index={1} className="flex flex-col gap-3.5">
          <span className="text-[13px] text-muted-2">Лидер рынка МНН</span>
          <span className="flex min-w-0 flex-wrap items-baseline gap-2.5">
            <span
              className="max-w-full truncate text-[28px] font-semibold leading-tight tracking-[-0.03em]"
              title={leader?.corporation}
            >
              {leader?.corporation ?? "—"}
            </span>
            <span className="text-[15px] font-semibold text-[oklch(0.45_0.15_268)]">
              {fmtPct(zone2.leader_share)}
            </span>
          </span>
          <div className="flex flex-col gap-2">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
              {top.map((c, i) => (
                <span
                  key={c.corporation}
                  title={`${c.corporation} · ${fmtShare(c.share)}`}
                  style={{
                    flex: `${c.share} 1 0%`, background: STACK_SHADES[i],
                  }}
                />
              ))}
              {restShare > 0.001 && (
                <span
                  title={`Прочие · ${fmtShare(restShare)}`}
                  style={{ flex: `${restShare} 1 0%`, background: "#e2e3e7" }}
                />
              )}
            </div>
            <span className="text-xs text-muted-2">
              Топ-3 держат {fmtPct(zone2.top3_share)} рынка МНН
            </span>
          </div>
        </Card>

        <Card anim="tab" index={2} className="flex flex-col gap-3.5">
          <span className="text-[13px] text-muted-2">Активные конкуренты</span>
          <span className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-4xl font-semibold leading-none tracking-[-0.03em]">
              {fmtInt(active)}
            </span>
            <span className="text-[15px] text-muted-2">
              из {fmtInt(total)}{" "}
              {plural(total, "производителя", "производителей", "производителей")}
            </span>
          </span>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: dots }, (_, i) => (
                <span
                  key={i}
                  className="size-3.5 rounded"
                  style={{
                    background: i < active
                      ? "oklch(0.52 0.16 268)"
                      : "#e2e3e7",
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-2">
              порог активности — {fmtUsd(zone1.competitor_threshold_usd)} продаж
            </span>
          </div>
        </Card>
      </div>

      <Card anim="tab" index={3} className="flex flex-col overflow-x-auto">
        <CardTitle note="USD · доля · рост к прошлому году" className="pb-3">
          Производители
        </CardTitle>
        <div className={`${PRODUCER_GRID} border-b border-line pb-2 text-[11px] text-faint`}>
          <span />
          <span>Производитель · торговые марки</span>
          <span>Страна</span>
          <span className="text-right">USD</span>
          <span className="text-right">Доля</span>
          <span className="text-right">USD г/г</span>
          <span className="text-right">Уп. г/г</span>
        </div>
        {zone2.top_competitors.map((c, i) => (
          <ProducerRow
            key={c.corporation}
            rank={i + 1}
            competitor={c}
            barWidth={(c.share / maxShare) * t}
          />
        ))}
      </Card>

      {zone2.concentration_by_form.length > 0 && (
        <Card anim="tab" index={4} className="flex flex-col overflow-x-auto">
          <CardTitle note="по всему МНН, фильтры не учитываются" className="pb-3">
            Концентрация по формам
          </CardTitle>
          <div className={`${FORM_GRID} border-b border-line pb-2 text-[11px] text-faint`}>
            <span>Форма</span>
            <span>Доля МНН</span>
            <span>Лидер</span>
            <span className="text-right">Активн. конк.</span>
            <span className="text-right">Уровень</span>
          </div>
          {zone2.concentration_by_form.map((f) => {
            const formLevel = hhiLevel(f.hhi);
            return (
              <div
                key={f.name}
                className={`${FORM_GRID} items-center border-b border-[#f5f5f2] py-3 text-sm`}
              >
                <span className="font-medium">{f.name}</span>
                <span className="flex items-center gap-2">
                  <ProgressBar className="flex-1" value={f.share * t} />
                  <span className="w-[34px] text-right text-[13px] font-semibold">
                    {fmtShare(f.share)}
                  </span>
                </span>
                <span className="truncate text-muted" title={f.leader}>
                  {f.leader}
                </span>
                <span className="text-right font-semibold">
                  {fmtInt(f.active_competitors)}
                </span>
                {formLevel && (
                  <Pill
                    className="justify-self-end"
                    style={{
                      background: formLevel.background, color: formLevel.color,
                    }}
                  >
                    {formLevel.label}
                  </Pill>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}

function ProducerRow({
  rank, competitor: c, barWidth,
}: {
  rank: number;
  competitor: Competitor;
  barWidth: number;
}) {
  const meta = countryMeta(c.country);
  const chip = countryChip(meta.hue);
  const showTmShare = c.tms.length > 1;
  return (
    <div
      className={`${PRODUCER_GRID} tr-soft -mx-2 items-center rounded-ctl border-b border-[#f5f5f2] px-2 py-[11px] text-sm hover:bg-[#f7f7f4]`}
    >
      <span className="text-xs text-faintest">{rank}</span>
      <span className="flex min-w-0 flex-col gap-[7px]">
        <span className="truncate font-semibold" title={c.corporation}>
          {c.corporation}
        </span>
        {c.tms.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {c.tms.map((tm) => (
              <span
                key={tm.tm}
                title={[tm.forms.join(", "), tm.doses.join(" · ")]
                  .filter(Boolean)
                  .join(" — ")}
                className="inline-flex items-center gap-[5px] whitespace-nowrap rounded-[5px] px-[7px] py-0.5 text-xs"
                style={chip}
              >
                <b className="font-semibold">{tm.tm}</b>
                {showTmShare && (
                  <span className="opacity-70">{fmtShare(tm.share)}</span>
                )}
              </span>
            ))}
          </span>
        )}
        <ProgressBar value={barWidth} color={countryBar(meta.hue)} />
      </span>
      <span className="flex min-w-0 items-center gap-[7px] text-[13px] text-fg-2">
        {c.country ? (
          <>
            <CountryChip country={c.country} className="px-[5px]! py-0.5!" />
            <span className="truncate">{titleCase(c.country)}</span>
          </>
        ) : (
          "—"
        )}
      </span>
      <span className="whitespace-nowrap text-right font-semibold">
        {fmtUsd(c.usd_last_year)}
      </span>
      <span className="text-right text-[13px]">{fmtShare(c.share)}</span>
      <GrowthChip value={c.usd_growth} size="table" className="justify-self-end" />
      <GrowthChip value={c.un_growth} size="table" className="justify-self-end" />
    </div>
  );
}
