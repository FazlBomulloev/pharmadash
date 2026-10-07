import type { ReactNode } from "react";
import clsx from "clsx";
import type { ScoringItem } from "../../types/api";
import {
  fmtInt, fmtPct, fmtPrice, fmtScore, fmtUsd,
} from "../../lib/format";
import { CATEGORY_COLOR } from "../../lib/palette";
import { ProgressBar, ScoreCell } from "../ui/bars";
import { AtcChip, CategoryPill, GrowthChip } from "../ui/chips";
import { CRITERIA, STOP_REASON_LABEL } from "./meta";

export type TableMode = "sum" | "metrics" | "scores";

export interface SortState {
  key: string;
  order: "asc" | "desc";
}

interface Column {
  key: string;
  label: string;
  title?: string;
  align?: "right" | "center";
  cell: (item: ScoringItem) => ReactNode;
}

const text = (v: ReactNode, className = "text-fg-2") => (
  <span className={clsx("truncate text-[13px]", className)}>{v}</span>
);

function columnsFor(mode: TableMode, years: number[]): Column[] {
  const year = (i: number) => years[i] ?? `Y${i + 1}`;
  if (mode === "sum") {
    return [
      { key: "cls", label: "Класс", cell: (i) => <AtcChip cls={i.cls} /> },
      { key: "direction", label: "Направление", cell: (i) => text(i.direction) },
      {
        key: "usd", label: `$ ${year(2)}`, align: "right",
        cell: (i) => text(fmtUsd(i.sales[2]), "font-semibold text-fg"),
      },
      {
        key: "total", label: "Итог",
        cell: (i) => (
          <span className="flex w-full items-center gap-2">
            <ProgressBar
              className="flex-1"
              value={i.total / 100}
              color={CATEGORY_COLOR[i.category].bg}
            />
            <span className="w-8 text-right text-[13px] font-semibold">
              {fmtScore(i.total)}
            </span>
          </span>
        ),
      },
      {
        key: "category", label: "Категория",
        cell: (i) => <CategoryPill category={i.category} />,
      },
      {
        key: "", label: "Фильтр",
        cell: (i) => i.passed
          ? text("Пройден", "text-muted-2")
          : text(
              i.stop_reasons.map((r) => STOP_REASON_LABEL[r]).join(", "),
              "font-medium text-neg",
            ),
      },
    ];
  }
  if (mode === "metrics") {
    const num = (v: string) => text(v, "text-fg");
    return [
      { key: "usd_y1", label: `$ ${year(0)}`, align: "right", cell: (i) => num(fmtUsd(i.sales[0])) },
      { key: "usd_y2", label: `$ ${year(1)}`, align: "right", cell: (i) => num(fmtUsd(i.sales[1])) },
      {
        key: "usd", label: `$ ${year(2)}`, align: "right",
        cell: (i) => text(fmtUsd(i.sales[2]), "font-semibold text-fg"),
      },
      { key: "price", label: "Цена", align: "right", cell: (i) => num(fmtPrice(i.price)) },
      {
        key: "cagr_usd", label: "CAGR $", align: "right",
        cell: (i) => <GrowthChip value={i.cagr_usd} size="table" />,
      },
      {
        key: "cagr_units", label: "CAGR уп.", align: "right",
        cell: (i) => <GrowthChip value={i.cagr_units} size="table" />,
      },
      { key: "import_share", label: "Импорт", align: "right", cell: (i) => num(fmtPct(i.import_share)) },
      { key: "hospital_share", label: "Госпиталь", align: "right", cell: (i) => num(fmtPct(i.hospital_share)) },
      { key: "producers", label: "Произв.", title: "Число производителей", align: "right", cell: (i) => num(fmtInt(i.producers)) },
      { key: "hhi", label: "HHI", align: "right", cell: (i) => num(fmtInt(i.hhi)) },
    ];
  }
  return [
    ...CRITERIA.map((c): Column => ({
      key: `score_${c.key}`,
      label: c.short,
      title: c.label,
      align: "center",
      cell: (i) => <ScoreCell value={i.scores[c.key]} className="w-full" />,
    })),
    {
      key: "total", label: "Итог", align: "right",
      cell: (i) => text(fmtScore(i.total), "font-bold text-fg"),
    },
  ];
}

const GRID: Record<TableMode, { template: string; minWidth: number }> = {
  sum: {
    template:
      "minmax(220px,1.6fr) 140px minmax(150px,1fr) 100px minmax(140px,1fr) 110px minmax(150px,1.2fr)",
    minWidth: 1100,
  },
  metrics: {
    template: "minmax(220px,1.6fr) repeat(10,minmax(80px,1fr))",
    minWidth: 1100,
  },
  scores: {
    template: "minmax(220px,1.6fr) repeat(10,minmax(64px,1fr)) 80px",
    minWidth: 1080,
  },
};

const ARROW = { asc: " ↑", desc: " ↓" };
const JUSTIFY = { right: "justify-end", center: "justify-center" };

export function ScoringTable({
  items, mode, years, sort, onSort, selected, onSelect,
}: {
  items: ScoringItem[];
  mode: TableMode;
  years: number[];
  sort: SortState;
  onSort: (key: string) => void;
  selected: string | null;
  onSelect: (item: ScoringItem) => void;
}) {
  const columns = columnsFor(mode, years);
  const { template, minWidth } = GRID[mode];
  const arrow = (key: string) => (sort.key === key ? ARROW[sort.order] : "");

  return (
    <div className="max-h-[calc(var(--screen-h)-420px)] min-h-[360px] overflow-auto">
      <div role="table" style={{ minWidth }}>
        <div
          role="row"
          className="sticky top-0 z-[2] grid border-b border-[#eeeeea] bg-[#fafaf8]"
          style={{ gridTemplateColumns: template }}
        >
          <button
            type="button"
            role="columnheader"
            onClick={() => onSort("mnn")}
            className={clsx(
              "sticky left-0 z-[3] whitespace-nowrap border-0 bg-[#fafaf8] px-4 py-2.5 text-left text-[11px] font-medium hover:text-fg",
              sort.key === "mnn" || sort.key === "rank"
                ? "text-fg"
                : "text-muted-2",
            )}
          >
            # &nbsp;МНН{arrow("mnn")}
          </button>
          {columns.map((c) =>
            c.key ? (
              <button
                key={c.key}
                type="button"
                role="columnheader"
                title={c.title ?? c.label}
                onClick={() => onSort(c.key)}
                className={clsx(
                  "whitespace-nowrap border-0 bg-transparent px-2.5 py-2.5 text-[11px] font-medium hover:text-fg",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  !c.align && "text-left",
                  sort.key === c.key ? "text-fg" : "text-muted-2",
                )}
              >
                {c.label}{arrow(c.key)}
              </button>
            ) : (
              <span
                key={c.label}
                role="columnheader"
                className="px-2.5 py-2.5 text-[11px] font-medium text-muted-2"
              >
                {c.label}
              </span>
            ),
          )}
        </div>

        {items.map((item) => {
          const isSelected = item.mnn === selected;
          return (
            <div
              key={item.mnn}
              role="row"
              tabIndex={0}
              onClick={() => onSelect(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(item);
                }
              }}
              className={clsx(
                "group tr-soft grid cursor-pointer items-center border-b border-[#f3f3f0] hover:bg-[#f7f7f4]",
                isSelected ? "bg-accent-tint" : "bg-white",
              )}
              style={{ gridTemplateColumns: template }}
            >
              <div
                role="cell"
                className={clsx(
                  "tr-soft sticky left-0 z-[1] flex h-full min-w-0 items-center gap-3 px-4 py-[9px] group-hover:bg-[#f7f7f4]",
                  isSelected ? "bg-accent-tint" : "bg-white",
                )}
                style={{
                  boxShadow: isSelected
                    ? "inset 3px 0 0 oklch(0.47 0.14 262)"
                    : undefined,
                }}
              >
                <span className="w-[26px] shrink-0 text-xs text-faintest">
                  {item.rank}
                </span>
                <span className="truncate text-sm font-medium" title={item.mnn}>
                  {item.mnn}
                </span>
              </div>
              {columns.map((c) => (
                <div
                  key={c.key || c.label}
                  role="cell"
                  className={clsx(
                    "flex min-w-0 px-2.5 py-[9px]",
                    c.align && JUSTIFY[c.align],
                  )}
                >
                  {c.cell(item)}
                </div>
              ))}
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-2">
            Нет МНН по заданным условиям
          </div>
        )}
      </div>
    </div>
  );
}
