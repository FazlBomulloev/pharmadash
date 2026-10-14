import { useState } from "react";
import clsx from "clsx";
import type { DirectionOverviewRow } from "../../types/api";
import { fmtGrowth, fmtUsd } from "../../lib/format";
import { growthTone } from "../../lib/palette";
import { HeatCell } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";

const GRID = "grid grid-cols-[minmax(0,1fr)_92px_repeat(3,56px)_64px] gap-2.5";

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
  const tail = rows.filter((r) => r.kind !== "direction");
  const main = rows.filter((r) => r.kind === "direction");
  const shown = all ? main : main.slice(0, 15);
  const hidden = main.length - shown.length;

  return (
    <Card index={index} className="flex flex-1 flex-col gap-1.5">
      <CardTitle
        note="оценка по долям назначений · клик — детальный анализ"
        className="pb-2"
      >
        Направления
      </CardTitle>

      {rows.length === 0 ? (
        <span className="text-sm text-faint">
          Справочник направлений не загружен
        </span>
      ) : (
        <>
          <div className={clsx(GRID, "-mx-1.5 px-1.5 text-[11px] text-faint")}>
            <span>Направление</span>
            <span className="text-right">USD</span>
            {yearLabels.map((y, i) => (
              <span key={i} className="text-center">{y}</span>
            ))}
            <span className="text-right">г/г</span>
          </div>

          {[...shown, ...tail].map((r) => {
            const clickable = r.kind === "direction";
            const body = (
              <>
                <span className="truncate" title={r.name}>{r.name}</span>
                <span className="text-right text-[13px] font-medium">
                  {fmtUsd(r.usd)}
                </span>
                {r.shares_by_year.map((s, i) => (
                  <HeatCell key={i} share={s} max={12} />
                ))}
                <span
                  className="whitespace-nowrap text-right text-[13px] font-semibold"
                  style={{ color: growthTone(r.growth) }}
                >
                  {fmtGrowth(r.growth)}
                </span>
              </>
            );
            const base = clsx(
              GRID,
              "-mx-1.5 items-center rounded-row px-1.5 py-0.5 text-left text-sm",
              r.kind === "direction" ? "text-fg" : "text-muted-2 italic",
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
          })}

          {(hidden > 0 || all) && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="mt-1.5 w-fit border-0 bg-transparent px-1.5 py-1 text-[13px] font-medium text-accent hover:text-accent-hover"
            >
              {all ? "Свернуть" : `Показать все ${main.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
