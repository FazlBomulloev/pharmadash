import type { DashboardResponse, ScoringCategory } from "../../types/api";
import {
  fmtGrowth, fmtInt, fmtPrice, fmtScore, fmtUnits, fmtUsd,
} from "../../lib/format";
import { CATEGORY_LABEL } from "../scoring/meta";
import { DarkHero } from "../ui/Card";
import { HeroTrend } from "../ui/HeroTrend";

const POS_ON_INK = "oklch(0.84 0.14 155)";
const NEG_ON_INK = "oklch(0.78 0.14 25)";

const INK_CATEGORY: Record<
  ScoringCategory, { background: string; color: string; dot: string }
> = {
  priority: {
    background: "oklch(0.78 0.16 155 / 0.18)", color: "oklch(0.86 0.14 155)",
    dot: "oklch(0.78 0.16 155)",
  },
  watch: {
    background: "oklch(0.8 0.14 80 / 0.2)", color: "oklch(0.88 0.12 85)",
    dot: "oklch(0.82 0.14 80)",
  },
  miss: {
    background: "oklch(1 0 0 / 0.12)", color: "oklch(0.84 0.04 268)",
    dot: "oklch(0.84 0.04 268)",
  },
  stop: {
    background: "oklch(0.7 0.17 25 / 0.22)", color: "oklch(0.85 0.1 25)",
    dot: "oklch(0.72 0.17 25)",
  },
};

export function MnnHero({
  data, onYear, onScore, t,
}: {
  data: DashboardResponse;
  onYear: (year: number) => void;
  onScore: () => void;
  t: number;
}) {
  const { zone1, zone3 } = data;
  const item = zone3.item;
  const stats = [
    { label: "Продажи USD", value: fmtUsd(zone1.usd_last_year * t), growth: zone1.usd_growth },
    { label: "Упаковки", value: fmtUnits(zone1.un_last_year * t), growth: zone1.un_growth },
    {
      label: "Цена упаковки",
      value: fmtPrice(zone1.asp_last_year == null ? null : zone1.asp_last_year * t),
      growth: zone1.asp_growth,
    },
  ];
  const tone = item ? INK_CATEGORY[item.category] : null;

  return (
    <DarkHero className="pb-[18px]!">
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 min-w-0 break-words text-[34px] font-semibold leading-[1.05] tracking-[-0.03em]">
              {data.mnn}
            </h1>
            {item?.cls && (
              <span className="rounded-md bg-[oklch(1_0_0/0.12)] px-2 py-1 text-xs font-semibold">
                {item.cls}
              </span>
            )}
            {item && tone && (
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: tone.background, color: tone.color }}
              >
                <span
                  className="size-[7px] rounded-full"
                  style={{ background: tone.dot }}
                />
                {CATEGORY_LABEL[item.category]}
              </span>
            )}
          </div>
          <span className="text-[13px] text-ink-fg-2">
            {item ? `${item.direction} · ` : ""}
            {fmtInt(zone1.active_competitors)} активных конкурентов из{" "}
            {fmtInt(zone1.total_producers)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-x-5 gap-y-4">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-col gap-1">
              <span className="whitespace-nowrap text-xs text-[oklch(0.82_0.04_268)]">
                {s.label}
              </span>
              <span className="whitespace-nowrap text-2xl font-semibold tracking-[-0.02em]">
                {s.value}
              </span>
              <span
                className="text-xs font-semibold"
                style={{
                  color: s.growth != null && s.growth < 0
                    ? NEG_ON_INK
                    : POS_ON_INK,
                }}
              >
                {s.growth == null ? " " : `${fmtGrowth(s.growth)} г/г`}
              </span>
            </div>
          ))}
        </div>

        {item && (
          <button
            type="button"
            onClick={onScore}
            className="tr-soft flex items-center gap-3.5 rounded-inner border-0 bg-ink-glass px-3.5 py-3 text-left text-white hover:bg-[oklch(1_0_0/0.11)]"
          >
            <span className="text-[28px] font-bold leading-none tracking-[-0.02em]">
              {fmtScore(item.total * t, 0)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-xs text-ink-fg-2">
                Скоринг · ранг {fmtInt(item.rank)} из{" "}
                {fmtInt(zone3.selection_size)}
              </span>
              <span className="h-1.5 overflow-hidden rounded-[3px] bg-[oklch(1_0_0/0.14)]">
                <span
                  className="block h-full rounded-[3px]"
                  style={{
                    width: `${item.total * t}%`,
                    background: tone?.dot,
                  }}
                />
              </span>
            </span>
            <span className="text-sm text-ink-fg-2">→</span>
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-2.5">
        <span className="text-[13px] text-ink-fg-2">Продажи по годам, USD</span>
        <HeroTrend
          years={zone1.series.years}
          values={zone1.series.usd}
          selectedYear={data.selected_year}
          onPick={onYear}
          format={fmtUsd}
          t={t}
        />
      </div>
    </DarkHero>
  );
}
