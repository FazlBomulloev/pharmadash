import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import type {
  OverviewCountry, OverviewDecision, OverviewFilters, OverviewMnn,
  OverviewProducer, Mover,
} from "../../types/api";
import {
  fmtGrowth, fmtInt, fmtScore, fmtShare, fmtUsd, titleCase,
} from "../../lib/format";
import {
  CATEGORY_COLOR, atcColor, growthTone, hhiLevel,
} from "../../lib/palette";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "../scoring/meta";
import {
  DivergingBars, HeatCell, Legend, ProgressBar, StackedBar,
} from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";
import { CountryChip, Pill } from "../ui/chips";

const dashboardLink = (marketId: number, mnn: string) =>
  `/market/${marketId}/dashboard?mnn=${encodeURIComponent(mnn)}`;

export function MoversCard({
  movers, marketId, t, index,
}: {
  movers: Mover[];
  marketId: number;
  t: number;
  index: number;
}) {
  return (
    <Card index={index} className="flex flex-[1.3_1_440px] flex-col gap-4">
      <CardTitle note="изменение продаж к прошлому году, USD">
        Кто двигает рынок
      </CardTitle>
      {movers.length === 0 ? (
        <span className="text-sm text-faint">
          Нет данных за прошлый год для сравнения
        </span>
      ) : (
        <DivergingBars
          axis={0.5}
          t={t}
          rows={movers.map((m) => ({
            key: m.name,
            name: m.name,
            delta: m.delta,
            to: dashboardLink(marketId, m.name),
          }))}
        />
      )}
    </Card>
  );
}

export function ScoringCard({
  decision, marketId, index,
}: {
  decision: OverviewDecision;
  marketId: number;
  index: number;
}) {
  const navigate = useNavigate();
  const scoringUrl = `/market/${marketId}/scoring`;
  const top = decision.top.slice(0, 5);

  return (
    <Card index={index} className="flex flex-[1_1_340px] flex-col gap-[18px]">
      <CardTitle
        right={
          <Link to={scoringUrl} className="text-[13px] font-medium">
            Весь скоринг →
          </Link>
        }
      >
        Скоринг МНН
      </CardTitle>
      <StackedBar
        height={48}
        minWidth={52}
        onPick={(cat) => navigate(`${scoringUrl}?cat=${cat}`)}
        segments={CATEGORY_ORDER.map((c) => ({
          key: c,
          value: decision.categories[c],
          color: CATEGORY_COLOR[c].bg,
          fg: CATEGORY_COLOR[c].fg,
          label: fmtInt(decision.categories[c]),
          title: CATEGORY_LABEL[c],
        }))}
      />
      <Legend
        className="-mt-1.5 text-muted"
        items={CATEGORY_ORDER.map((c) => ({
          key: c,
          color: CATEGORY_COLOR[c].bg,
          label: CATEGORY_LABEL[c],
        }))}
      />
      <div className="flex flex-col">
        <span className="pb-1.5 text-xs text-faint">
          Топ-5 кандидатов · {fmtInt(decision.passed)} прошли стоп-фильтр
        </span>
        {top.map((item) => (
          <Link
            key={item.mnn}
            to={dashboardLink(marketId, item.mnn)}
            className="tr-soft -mx-2 grid grid-cols-[minmax(0,1fr)_auto_40px] items-center gap-2.5 rounded-row border-t border-[#f3f3f0] px-2 py-[9px] text-fg hover:bg-subtle hover:text-fg"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-[22px] w-1.5 shrink-0 rounded-[3px]"
                style={{ background: atcColor(item.cls) }}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium" title={item.mnn}>
                  {item.mnn}
                </span>
                <span className="truncate text-[11px] text-faint">
                  {item.direction}
                </span>
              </span>
            </span>
            <span className="whitespace-nowrap text-[13px] text-muted">
              {fmtUsd(item.usd)}
            </span>
            <span
              className="rounded-lg py-[5px] text-center text-sm font-bold"
              style={{
                background: CATEGORY_COLOR[item.category].bg,
                color: CATEGORY_COLOR[item.category].fg,
              }}
            >
              {fmtScore(item.total, 0)}
            </span>
          </Link>
        ))}
        {top.length === 0 && (
          <span className="border-t border-[#f3f3f0] py-3 text-sm text-faint">
            Ни один МНН не прошёл стоп-фильтр
          </span>
        )}
      </div>
    </Card>
  );
}

export function TopMnnCard({
  items, marketId, index,
}: {
  items: OverviewMnn[];
  marketId: number;
  index: number;
}) {
  const max = Math.max(...items.map((m) => m.usd), 1e-9);
  return (
    <Card index={index} className="flex flex-[1_1_400px] flex-col">
      <CardTitle note="USD · доля · г/г" className="pb-3">
        Топ-10 МНН
      </CardTitle>
      {items.map((m, i) => (
        <Link
          key={m.mnn}
          to={dashboardLink(marketId, m.mnn)}
          className="tr-soft -mx-2 grid grid-cols-[20px_minmax(0,1fr)_92px_48px_56px] items-center gap-2.5 rounded-row px-2 py-[9px] text-sm text-fg hover:bg-[#f7f7f4] hover:text-fg"
        >
          <span className="text-xs text-faintest">{i + 1}</span>
          <span className="flex min-w-0 flex-col gap-[5px]">
            <span className="truncate" title={m.mnn}>{m.mnn}</span>
            <ProgressBar
              value={m.usd / max}
              color="oklch(0.72 0.09 262)"
              height={3}
            />
          </span>
          <span className="whitespace-nowrap text-right font-medium">
            {fmtUsd(m.usd)}
          </span>
          <span className="text-right text-[13px] text-muted-2">
            {fmtShare(m.share)}
          </span>
          <span
            className="whitespace-nowrap text-right text-[13px] font-medium"
            style={{ color: growthTone(m.growth) }}
          >
            {fmtGrowth(m.growth)}
          </span>
        </Link>
      ))}
    </Card>
  );
}

/** Классы ATC: клик по строке включает фильтр всей страницы. */
export function AtcCard({
  options, selected, onPick, index,
}: {
  options: OverviewFilters["options"]["atc3"];
  selected: string | null;
  onPick: (atc: string | null) => void;
  index: number;
}) {
  const items = options.slice(0, 10);
  const max = Math.max(...items.map((a) => a.usd), 1e-9);
  const active = (selected ?? "").toUpperCase();
  return (
    <Card index={index} className="flex flex-[1_1_400px] flex-col gap-1">
      <CardTitle note="клик — фильтр по классу" className="pb-2.5">
        Классы ATC
      </CardTitle>
      {items.map((a) => {
        const isActive = a.atc === active;
        return (
          <button
            key={a.atc}
            type="button"
            aria-pressed={isActive}
            onClick={() => onPick(isActive ? null : a.atc)}
            className="tr-soft -mx-2 grid grid-cols-[10px_minmax(0,1fr)_84px_52px] items-center gap-2.5 rounded-row border-0 bg-transparent px-2 py-[7px] text-left text-sm text-fg hover:bg-[#f7f7f4]"
          >
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: atcColor(a.atc) }}
            />
            <span className="flex min-w-0 flex-col gap-[5px]">
              <span className={clsx("truncate", isActive && "font-semibold")}>
                {a.atc}
              </span>
              <ProgressBar
                value={a.usd / max}
                track="#f2f2ef"
                color={
                  !active || isActive
                    ? "oklch(0.52 0.16 268)"
                    : "oklch(0.9 0.02 262)"
                }
              />
            </span>
            <span className="whitespace-nowrap text-right font-medium">
              {fmtUsd(a.usd)}
            </span>
            <span className="text-right text-[13px] text-muted-2">
              {fmtShare(a.share)}
            </span>
          </button>
        );
      })}
    </Card>
  );
}

const HEAT_GRID =
  "grid grid-cols-[minmax(100px,1fr)_repeat(3,minmax(52px,72px))_56px] gap-1";

export function CountriesCard({
  countries, yearLabels, selected, onPick, index,
}: {
  countries: OverviewCountry[];
  yearLabels: string[];
  selected: string | null;
  onPick: (country: string) => void;
  index: number;
}) {
  return (
    <Card index={index} className="flex flex-[1_1_400px] flex-col gap-1.5">
      <CardTitle note="доля USD, % · клик — детальный анализ" className="pb-2">
        Страны производства
      </CardTitle>
      <div className={clsx(HEAT_GRID, "-mx-1.5 px-1.5 text-[11px] text-faint")}>
        <span />
        {yearLabels.map((y, i) => (
          <span key={i} className="text-center">{y}</span>
        ))}
        <span className="text-right">г/г</span>
      </div>
      {countries.map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => onPick(c.name)}
          className={clsx(
            HEAT_GRID,
            "tr-soft -mx-1.5 items-center rounded-row border-0 px-1.5 py-0.5 text-left text-sm text-fg hover:bg-[#f4f5fa]",
            selected === c.name ? "bg-accent-tint" : "bg-transparent",
          )}
        >
          <span className="truncate" title={titleCase(c.name)}>
            {titleCase(c.name)}
          </span>
          {c.shares_by_year.map((s, i) => (
            <HeatCell key={i} share={s} />
          ))}
          <span
            className="whitespace-nowrap text-right text-[13px] font-semibold"
            style={{ color: growthTone(c.growth) }}
          >
            {fmtGrowth(c.growth)}
          </span>
        </button>
      ))}
    </Card>
  );
}

export function ProducersCard({
  producers, hhi, selected, onPick, index,
}: {
  producers: OverviewProducer[];
  hhi: number | null;
  selected: string | null;
  onPick: (producer: OverviewProducer) => void;
  index: number;
}) {
  const max = Math.max(...producers.map((p) => p.usd), 1e-9);
  const level = hhiLevel(hhi);
  return (
    <Card index={index} className="flex flex-[1_1_400px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-[17px] font-semibold tracking-[-0.01em]">
            Топ-10 производителей
          </span>
          <span className="text-xs text-faint">клик — детальный анализ</span>
        </span>
        {level && hhi != null && (
          <Pill style={{ background: level.background, color: level.color }}>
            HHI {fmtInt(hhi)} · {level.word}
          </Pill>
        )}
      </div>
      {producers.map((p) => (
        <button
          key={p.name}
          type="button"
          onClick={() => onPick(p)}
          className={clsx(
            "tr-soft -mx-2 grid grid-cols-[30px_minmax(0,1fr)_84px_54px] items-center gap-2.5 rounded-row border-0 px-2 py-[7px] text-left text-sm text-fg hover:bg-[#f4f5fa]",
            selected === p.name ? "bg-accent-tint" : "bg-transparent",
          )}
        >
          <CountryChip
            country={p.country}
            isHome={p.is_home}
            className="px-0!"
          />
          <span className="flex min-w-0 flex-col gap-[5px]">
            <span className="truncate" title={p.name}>{p.name}</span>
            <ProgressBar
              value={p.usd / max}
              color={
                p.is_home
                  ? "oklch(0.58 0.12 195)"
                  : "oklch(0.52 0.16 268)"
              }
            />
          </span>
          <span className="whitespace-nowrap text-right font-medium">
            {fmtUsd(p.usd)}
          </span>
          <span
            className="whitespace-nowrap text-right text-[13px] font-semibold"
            style={{ color: growthTone(p.growth) }}
          >
            {fmtGrowth(p.growth)}
          </span>
        </button>
      ))}
    </Card>
  );
}
