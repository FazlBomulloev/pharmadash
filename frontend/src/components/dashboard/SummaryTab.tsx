import type { DashboardResponse } from "../../types/api";
import { fmtInt, fmtPct, fmtScore, fmtUsd } from "../../lib/format";
import { CATEGORY_COLOR, scoreTone } from "../../lib/palette";
import {
  CATEGORY_LABEL, contributions, criterionValue,
} from "../scoring/meta";
import { CriteriaTable, ScoreScale, StopNote } from "../scoring/ScoringParts";
import { DivergingBars, ProgressBar } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";
import { CategoryPill, Pill } from "../ui/chips";

const STATUS: Record<
  string, { label: string; background: string; color: string; note: string }
> = {
  Growing: {
    label: "Растущий",
    background: "oklch(0.95 0.05 155)", color: "oklch(0.38 0.11 155)",
    note: "Растут и продажи, и упаковки: спрос увеличивается.",
  },
  Declining: {
    label: "Падающий",
    background: "oklch(0.95 0.035 25)", color: "oklch(0.45 0.15 25)",
    note: "Продажи или упаковки заметно сокращаются.",
  },
  "Price-driven": {
    label: "Рост за счёт цены",
    background: "oklch(0.95 0.06 85)", color: "oklch(0.42 0.09 70)",
    note: "Продажи растут при падении упаковок: рост обеспечен ценой.",
  },
  "Price pressure": {
    label: "Давление на цену",
    background: "oklch(0.95 0.06 85)", color: "oklch(0.42 0.09 70)",
    note: "Упаковки растут, а продажи падают: цена снижается.",
  },
  Stable: {
    label: "Стабильный",
    background: "#f0f0ec", color: "#3d4048",
    note: "Продажи и упаковки меняются незначительно.",
  },
};

export function SummaryTab({
  data, onScore, t,
}: {
  data: DashboardResponse;
  onScore: () => void;
  t: number;
}) {
  const { zone1, zone2, zone3 } = data;
  const status = STATUS[zone1.market_status];
  const item = zone3.item;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-6">
      <Card anim="tab" index={0} className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="whitespace-nowrap text-[17px] font-semibold tracking-[-0.01em]">
              Кто двигает рынок МНН
            </span>
            {status && (
              <Pill
                className="px-2! py-[3px]!"
                style={{ background: status.background, color: status.color }}
              >
                {status.label}
              </Pill>
            )}
          </div>
          <span className="text-xs text-faint">
            изменение USD к прошлому году
          </span>
        </div>
        {zone2.movers.length > 0 ? (
          <DivergingBars
            t={t}
            barHeight={20}
            rows={zone2.movers.map((m) => ({
              key: m.name, name: m.name, delta: m.delta,
            }))}
          />
        ) : (
          <span className="text-sm text-faint">
            Продажи производителей не изменились к прошлому году
          </span>
        )}
        <div className="text-pretty border-t border-line pt-3 text-[13px] leading-normal text-muted-2">
          {status?.note}{" "}
          Активный конкурент — производитель с продажами не ниже
          max($10 000; 0,1% рынка МНН).
          {zone1.competitor_threshold_usd != null && (
            <> Сейчас порог {fmtUsd(zone1.competitor_threshold_usd)}.</>
          )}
        </div>
      </Card>

      <Card anim="tab" index={1} className="flex flex-col gap-5">
        <CardTitle
          right={
            <button
              type="button"
              onClick={onScore}
              className="border-0 bg-transparent p-0 text-[13px] font-medium text-accent hover:text-accent-hover"
            >
              Все 10 критериев →
            </button>
          }
        >
          Скоринг кратко
        </CardTitle>
        {item ? (
          <ScoreBrief data={data} t={t} />
        ) : (
          <span className="text-sm text-faint">
            Для выбранной формы и дозировки скоринг не рассчитан
          </span>
        )}
      </Card>
    </div>
  );
}

function ScoreBrief({ data, t }: { data: DashboardResponse; t: number }) {
  const { zone3 } = data;
  const item = zone3.item!;
  const tone = CATEGORY_COLOR[item.category];
  const { rows } = contributions(item, zone3.weights);
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const strong = sorted.slice(0, 3);
  const weak = sorted.slice(-3).reverse();
  const better = zone3.selection_size > 1
    ? (zone3.selection_size - item.rank) / (zone3.selection_size - 1)
    : null;

  return (
    <>
      <div className="flex items-center gap-4">
        <span
          className="flex size-[76px] shrink-0 items-center justify-center rounded-[20px] text-[32px] font-bold tracking-[-0.03em]"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {fmtScore(item.total * t, 0)}
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-base font-semibold">
            {CATEGORY_LABEL[item.category]} · ранг {fmtInt(item.rank)} из{" "}
            {fmtInt(zone3.selection_size)}
          </span>
          <span className="text-[13px] text-muted-2">
            из 100 · стоп-фильтр {item.passed ? "пройден" : "не пройден"}
            {better != null && ` · лучше ${fmtPct(better, 1)} МНН`}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <SideList
          title="Сильные стороны"
          background="oklch(0.97 0.025 155)"
          color="oklch(0.4 0.11 155)"
          dot="oklch(0.58 0.15 155)"
          rows={strong.map((r) => ({
            key: r.key, label: r.label, score: r.score,
            value: criterionValue(item, r.key),
          }))}
          t={t}
        />
        <SideList
          title="Слабые стороны"
          background="oklch(0.97 0.02 25)"
          color="oklch(0.46 0.15 25)"
          dot="oklch(0.6 0.19 25)"
          rows={weak.map((r) => ({
            key: r.key, label: r.label, score: r.score,
            value: criterionValue(item, r.key),
          }))}
          t={t}
        />
      </div>
    </>
  );
}

function SideList({
  title, background, color, dot, rows, t,
}: {
  title: string;
  background: string;
  color: string;
  dot: string;
  rows: { key: string; label: string; score: number; value: string }[];
  t: number;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-inner p-4"
      style={{ background }}
    >
      <span
        className="flex items-center gap-1.5 text-xs font-bold"
        style={{ color }}
      >
        <span className="size-2 rounded-full" style={{ background: dot }} />
        {title}
      </span>
      {rows.map((r) => {
        const tone = scoreTone(r.score);
        return (
          <div key={r.key} className="flex flex-col gap-1.5">
            <span className="flex justify-between gap-2 text-sm">
              <span>{r.label}</span>
              <span
                className="rounded-md px-[7px] py-0.5 text-xs font-bold"
                style={{ background: tone.background, color: tone.color }}
              >
                {r.score.toFixed(2).replace(".", ",")}
              </span>
            </span>
            <ProgressBar
              value={r.score * t}
              color={tone.bar}
              height={8}
              track="#fff"
            />
            <span className="text-xs text-muted-2">{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ScoringTab({ data, t }: { data: DashboardResponse; t: number }) {
  const { zone3 } = data;
  const item = zone3.item;
  if (!item) {
    return (
      <Card anim="tab" className="text-sm text-faint">
        Для выбранной формы и дозировки скоринг не рассчитан
      </Card>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Card anim="tab" index={0} className="flex flex-[1_1_320px] flex-col gap-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-baseline gap-2">
            <span className="text-[56px] font-semibold leading-none tracking-[-0.04em]">
              {fmtScore(item.total * t)}
            </span>
            <span className="text-lg text-[#9a9ea6]">/ 100</span>
          </span>
          <CategoryPill
            category={item.category}
            variant="solid"
            className="px-3! py-1.5! text-[13px]! font-bold!"
          />
        </div>
        <ScoreScale total={item.total} thresholds={zone3.thresholds} />
        <div className="grid grid-cols-2 gap-2.5">
          <Mini label="Ранг">
            {fmtInt(item.rank)} из {fmtInt(zone3.selection_size)}
          </Mini>
          <Mini label="Класс">{item.cls ?? "—"}</Mini>
        </div>
        <StopNote item={item} />
      </Card>
      <Card
        anim="tab"
        index={1}
        className="flex flex-[2_1_560px] flex-col overflow-x-auto"
      >
        <CardTitle note="балл 0–1 · вес · вклад в итог" className="pb-3">
          10 критериев
        </CardTitle>
        <CriteriaTable item={item} weights={zone3.weights} t={t} />
      </Card>
    </div>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px] rounded-xl bg-subtle px-3.5 py-3">
      <span className="text-xs text-muted-2">{label}</span>
      <span className="truncate text-xl font-semibold">{children}</span>
    </div>
  );
}
