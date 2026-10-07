import type { OverviewVolume } from "../../types/api";
import {
  fmtDeltaUsd, fmtGrowth, fmtPrice, fmtUnits, fmtUsd,
} from "../../lib/format";
import { DarkHero } from "../ui/Card";
import { GrowthChip } from "../ui/chips";
import { HeroTrend } from "../ui/HeroTrend";
import { Segmented } from "../ui/Segmented";

export type HeroMode = "usd" | "un";

const POS_ON_INK = "oklch(0.84 0.14 155)";
const NEG_ON_INK = "oklch(0.78 0.14 25)";

function inkTone(v: number | null | undefined) {
  return v != null && v < 0 ? NEG_ON_INK : POS_ON_INK;
}

/** Тёмный hero обзора: главный показатель, 4 метрики и график по годам. */
export function OverviewHero({
  volume, scopeNote, mode, onMode, selectedYear, onYear, t,
}: {
  volume: OverviewVolume;
  /** «все секторы · 2024». */
  scopeNote: string;
  mode: HeroMode;
  onMode: (mode: HeroMode) => void;
  selectedYear: number | null;
  onYear: (year: number) => void;
  /** Прогресс появления 0…1 (count-up и прорисовка графика). */
  t: number;
}) {
  const isUsd = mode === "usd";
  const prevYear = volume.years_labels[1];
  const hasPrev = volume.usd_y2 > 0;
  const usdDelta = volume.usd_y3 - volume.usd_y2;
  const unDelta = volume.un_y3 - volume.un_y2;

  const hero = isUsd
    ? {
        label: "Продажи, USD",
        value: fmtUsd(volume.usd_y3 * t),
        growth: volume.usd_growth,
        sub: hasPrev ? `${fmtDeltaUsd(usdDelta)} к ${prevYear}` : "",
      }
    : {
        label: "Продажи, упаковки",
        value: fmtUnits(volume.un_y3 * t),
        growth: volume.un_growth,
        sub: volume.un_y2 > 0
          ? `${unDelta < 0 ? "−" : "+"}${fmtUnits(Math.abs(unDelta))} к ${prevYear}`
          : "",
      };

  const ret = volume.ret_share;
  const hos = volume.hos_share;
  const stats = [
    isUsd
      ? {
          label: "Упаковки",
          value: fmtUnits(volume.un_y3 * t),
          growth: volume.un_growth,
        }
      : {
          label: "Продажи, USD",
          value: fmtUsd(volume.usd_y3 * t),
          growth: volume.usd_growth,
        },
    {
      label: "Средняя цена упаковки",
      value: fmtPrice(volume.asp_y3 == null ? null : volume.asp_y3 * t),
      growth: volume.asp_growth,
    },
    {
      label: "Рост USD в среднем за год",
      value: fmtGrowth(volume.usd_cagr_2y),
      growth: null,
    },
    {
      label: "Розница / госпиталь",
      value: ret == null || hos == null
        ? "—"
        : `${Math.round(ret * 100)} / ${Math.round(hos * 100)}%`,
      growth: null,
    },
  ];

  const series = volume.series;

  return (
    <DarkHero className="gap-x-12! gap-y-7! px-8! pb-6! pt-[30px]!">
      <div className="flex min-w-fit flex-[1_1_300px] flex-col gap-[22px]">
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-ink-fg-2">
            {hero.label} · {scopeNote}
          </span>
          <span className="whitespace-nowrap text-[clamp(48px,6vw,72px)] font-semibold leading-[0.95] tracking-[-0.045em]">
            {hero.value}
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <GrowthChip value={hero.growth} onInk suffix="г/г" />
            <span className="text-[13px] text-ink-fg-2">{hero.sub}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-[18px] border-t border-ink-line pt-5">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-[oklch(0.82_0.04_268)]">
                {s.label}
              </span>
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="whitespace-nowrap text-[22px] font-semibold tracking-[-0.02em]">
                  {s.value}
                </span>
                {s.growth != null && (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: inkTone(s.growth) }}
                  >
                    {fmtGrowth(s.growth)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-[2_1_460px] flex-col gap-3">
        <div className="flex justify-end">
          <Segmented
            dark
            size="sm"
            ariaLabel="Показатель графика"
            value={mode}
            onChange={onMode}
            options={[
              { value: "usd", label: "USD" },
              { value: "un", label: "Упаковки" },
            ]}
          />
        </div>
        <HeroTrend
          years={series.years}
          values={isUsd ? series.usd : series.un}
          selectedYear={selectedYear}
          onPick={onYear}
          format={isUsd ? fmtUsd : fmtUnits}
          t={t}
        />
      </div>
    </DarkHero>
  );
}
