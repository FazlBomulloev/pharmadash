import { Check, X } from "lucide-react";
import type {
  ScoringCriterion, ScoringItem, ScoringThresholds,
} from "../../types/api";
import { fmtScore } from "../../lib/format";
import { scoreTone } from "../../lib/palette";
import { ProgressBar, ZoneScale } from "../ui/bars";
import { STOP_REASON_LABEL, contributions, criterionValue } from "./meta";

export function ScoreScale({
  total, thresholds, height = 16, marker = 20,
}: {
  total: number;
  thresholds: ScoringThresholds;
  height?: number;
  marker?: number;
}) {
  const { watch, priority } = thresholds;
  return (
    <div className="flex flex-col gap-1.5">
      <ZoneScale
        value={total}
        height={height}
        marker={marker}
        zones={[
          { to: watch, color: "#e2e3e7" },
          { to: priority, color: "oklch(0.82 0.13 80)" },
          { to: 100, color: "oklch(0.72 0.14 155)" },
        ]}
      />
      <div className="flex justify-between gap-2 text-[11px] text-faint">
        <span>0</span>
        <span className="whitespace-nowrap">
          {fmtScore(watch, 0)} смотреть · {fmtScore(priority, 0)} приоритет
        </span>
        <span>100</span>
      </div>
    </div>
  );
}

export function StopNote({ item }: { item: ScoringItem }) {
  if (item.passed) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-[13px]"
        style={{
          background: "oklch(0.97 0.03 155)", color: "oklch(0.36 0.1 155)",
        }}
      >
        <span
          className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "oklch(0.58 0.15 155)" }}
        >
          <Check size={13} strokeWidth={3} />
        </span>
        <span>
          Стоп-фильтр пройден: продажи, цена и число производителей в
          пределах порогов
        </span>
      </div>
    );
  }
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px]"
      style={{
        background: "oklch(0.97 0.02 25)", color: "oklch(0.45 0.15 25)",
      }}
    >
      <span
        className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: "oklch(0.6 0.19 25)" }}
      >
        <X size={13} strokeWidth={3} />
      </span>
      <span className="flex flex-col gap-0.5">
        <b className="font-semibold">Стоп-фильтр не пройден</b>
        {item.stop_reasons.map((r) => (
          <span key={r}>{STOP_REASON_LABEL[r]}</span>
        ))}
      </span>
    </div>
  );
}

function ScorePill({ value }: { value: number }) {
  const tone = scoreTone(value);
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-xs font-bold"
      style={{ background: tone.background, color: tone.color }}
    >
      {value.toFixed(2).replace(".", ",")}
    </span>
  );
}

const FULL_GRID =
  "grid min-w-[600px] items-center gap-3.5 " +
  "grid-cols-[minmax(120px,1fr)_minmax(130px,1.1fr)_minmax(160px,1.3fr)_44px_90px]";
const COMPACT_GRID =
  "grid items-center gap-3 grid-cols-[minmax(0,1fr)_minmax(110px,1fr)_52px]";

export function CriteriaTable({
  item, weights, variant = "full", t = 1,
}: {
  item: ScoringItem;
  weights: Record<ScoringCriterion, number>;
  variant?: "full" | "compact";
  t?: number;
}) {
  const { rows, raw } = contributions(item, weights);
  const maxCeiling = Math.max(...rows.map((r) => r.ceiling), 1e-9);

  if (variant === "compact") {
    return (
      <div className="flex flex-col">
        <div className={`${COMPACT_GRID} pb-1.5 text-[11px] text-faint`}>
          <span>Критерий</span>
          <span>Балл</span>
          <span className="text-right">Вклад</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.key}
            className={`${COMPACT_GRID} border-t border-[#f3f3f0] py-2 text-sm`}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{r.label}</span>
              <span className="truncate text-xs text-muted-2">
                {criterionValue(item, r.key)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <ProgressBar
                className="flex-1"
                value={r.score}
                color={scoreTone(r.score).bar}
                height={8}
              />
              <ScorePill value={r.score} />
            </span>
            <span className="text-right text-[13px] font-semibold">
              {fmtScore(r.contribution)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={`${FULL_GRID} border-b border-line pb-2 text-[11px] text-faint`}>
        <span>Критерий</span>
        <span>Значение</span>
        <span>Балл</span>
        <span className="text-right">Вес</span>
        <span className="text-right">Вклад</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.key}
          className={`${FULL_GRID} border-b border-[#f5f5f2] py-2.5 text-sm`}
        >
          <span className="font-medium">{r.label}</span>
          <span className="text-[13px] text-muted-2">
            {criterionValue(item, r.key)}
          </span>
          <span className="flex items-center gap-2.5">
            <ProgressBar
              className="flex-1"
              value={r.score * t}
              color={scoreTone(r.score).bar}
              height={8}
            />
            <ScorePill value={r.score} />
          </span>
          <span className="text-right text-[13px] text-muted-2">
            {fmtScore(r.weight, 0)}
          </span>
          <span className="flex items-center justify-end gap-2">
            <ProgressBar
              className="w-10"
              value={(r.contribution / maxCeiling) * t}
            />
            <span className="w-8 text-right text-[13px] font-semibold">
              {fmtScore(r.contribution)}
            </span>
          </span>
        </div>
      ))}
      <div className="flex min-w-[600px] justify-between gap-4 pt-3 text-xs text-muted-2">
        <span>
          Сумма вкладов до нормировки. Итог — положение между худшим и
          лучшим МНН выборки
        </span>
        <span className="text-sm font-semibold text-fg">{fmtScore(raw)}</span>
      </div>
    </>
  );
}
