import { useState } from "react";
import clsx from "clsx";
import type { DirectionOverviewRow } from "../../types/api";
import { fmtGrowth, fmtUsd } from "../../lib/format";
import { growthTone } from "../../lib/palette";
import { HeatCell } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";

const TOP = 16;
const OTHER_NAME = "Прочие направления";

const sumNullable = (values: (number | null)[]): number | null =>
  values.every((v) => v === null)
    ? null
    : values.reduce<number>((acc, v) => acc + (v ?? 0), 0);

function mergeTail(tail: DirectionOverviewRow[]): DirectionOverviewRow {
  return {
    name: OTHER_NAME,
    usd: tail.reduce((acc, r) => acc + r.usd, 0),
    share: sumNullable(tail.map((r) => r.share)),
    shares_by_year: [0, 1, 2].map((i) =>
      sumNullable(tail.map((r) => r.shares_by_year[i] ?? null)),
    ),
    growth: null,
    kind: "other",
  };
}

const GRID =
  "grid grid-cols-[minmax(80px,1fr)_76px_repeat(3,minmax(40px,58px))_54px] gap-1";

function Head({ yearLabels }: { yearLabels: string[] }) {
  return (
    <div className={clsx(GRID, "-mx-1.5 px-1.5 pb-0.5 text-[11px] text-faint")}>
      <span>Направление</span>
      <span className="text-right">USD</span>
      {yearLabels.map((y, i) => (
        <span key={i} className="text-center">{y}</span>
      ))}
      <span className="text-right">г/г</span>
    </div>
  );
}

export function DirectionsCard({
  rows, yearLabels, selected, onPick, index,
}: {
  rows: DirectionOverviewRow[];
  yearLabels: string[];
  selected: string | null;
  onPick: (name: string) => void;
  index: number;
}) {
  const [all, setAll] = useState(false);
  const directions = rows.filter((r) => r.kind === "direction");
  const unalloc = rows.filter((r) => r.kind === "unallocated");
  const tail = directions.slice(TOP);
  const visible = all || tail.length === 0
    ? [...directions, ...unalloc]
    : [...directions.slice(0, TOP), mergeTail(tail), ...unalloc];

  const half = Math.ceil(visible.length / 2);
  const columns = [visible.slice(0, half), visible.slice(half)];

  const renderRow = (r: DirectionOverviewRow) => {
    const clickable = r.kind === "direction";
    const body = (
      <>
        <span className="truncate" title={r.name}>{r.name}</span>
        <span className="whitespace-nowrap text-right text-[13px] tabular-nums">
          {fmtUsd(r.usd)}
        </span>
        {r.shares_by_year.map((s, i) => (
          <HeatCell key={i} share={s} max={12} />
        ))}
        <span
          className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums"
          style={{ color: growthTone(r.growth) }}
        >
          {fmtGrowth(r.growth)}
        </span>
      </>
    );
    const base = clsx(
      GRID,
      "-mx-1.5 items-center rounded-row px-1.5 py-0.5 text-left text-sm",
      clickable ? "text-fg" : "text-muted-2 italic",
    );
    return clickable ? (
      <button
        key={r.name}
        type="button"
        onClick={() => onPick(r.name)}
        className={clsx(
          base, "tr-soft border-0 hover:bg-[#f4f5fa]",
          selected === r.name ? "bg-accent-tint" : "bg-transparent",
        )}
      >
        {body}
      </button>
    ) : (
      <div key={r.name} className={base}>{body}</div>
    );
  };

  return (
    <Card index={index} className="flex flex-1 flex-col gap-1.5">
      <CardTitle note="доля USD, % · клик — детальный анализ" className="pb-2">
        Направления
      </CardTitle>

      {rows.length === 0 ? (
        <span className="text-sm text-faint">
          Справочник направлений не загружен
        </span>
      ) : (
        <>
          <div className="grid gap-x-10 xl:grid-cols-2">
            {columns.map((col, i) => (
              col.length === 0 ? null : (
                <div key={i} className="flex min-w-0 flex-col">
                  <Head yearLabels={yearLabels} />
                  {col.map(renderRow)}
                </div>
              )
            ))}
          </div>

          {directions.length > TOP && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="mt-1.5 w-fit border-0 bg-transparent px-1.5 py-1 text-[13px] font-medium text-accent hover:text-accent-hover"
            >
              {all ? "Свернуть" : `Показать все ${directions.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
