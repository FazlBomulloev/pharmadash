import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { fmtDeltaUsd } from "../../lib/format";
import { NEG, NEG_BAR, POS, POS_BAR, heatIndigo, scoreTone } from "../../lib/palette";

/** Полоска-индикатор: value 0…1. */
export function ProgressBar({
  value, color = "oklch(0.52 0.16 268)", height = 6, track = "#f0f0ec",
  className,
}: {
  value: number;
  color?: string;
  height?: number;
  track?: string;
  className?: string;
}) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <span
      className={clsx("block overflow-hidden", className)}
      style={{ height, borderRadius: height / 2, background: track }}
    >
      <span
        className="block h-full"
        style={{
          width: `${pct}%`,
          background: color,
          borderRadius: height / 2,
          transition: "background-color .2s",
        }}
      />
    </span>
  );
}

export interface StackSegment {
  key: string;
  value: number;
  color: string;
  /** Цвет текста внутри сегмента. */
  fg?: string;
  /** Подпись внутри сегмента (число, название). */
  label?: ReactNode;
  title?: string;
  /** Приглушить сегмент (не выбран при активном фильтре). */
  dim?: boolean;
}

/** Составная полоса. С подписями внутри — высоты 28–56px. */
export function StackedBar({
  segments, height, gap = 3, radius = 12, minWidth = 0, onPick, className,
  textClass = "text-base font-bold",
}: {
  segments: StackSegment[];
  height: number;
  gap?: number;
  radius?: number;
  /** Минимальная ширина сегмента с подписью. */
  minWidth?: number;
  onPick?: (key: string) => void;
  className?: string;
  textClass?: string;
}) {
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div
      className={clsx("flex overflow-hidden", className)}
      style={{ height, gap, borderRadius: radius }}
    >
      {visible.map((s) => {
        const style: CSSProperties = {
          flex: `${s.value} 1 0%`,
          minWidth,
          background: s.color,
          color: s.fg,
          opacity: s.dim ? 0.35 : 1,
          transition: "flex .2s, opacity .2s, filter .2s",
        };
        const inner = s.label != null && (
          <span className={clsx("whitespace-nowrap", textClass)}>{s.label}</span>
        );
        const cls = "flex items-center overflow-hidden border-0 px-2 text-left";
        return onPick ? (
          <button
            key={s.key}
            type="button"
            title={s.title}
            onClick={() => onPick(s.key)}
            className={clsx(cls, "hover:brightness-105")}
            style={style}
          >
            {inner}
          </button>
        ) : (
          <span key={s.key} title={s.title} className={cls} style={style}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}

/** Легенда под полосой: точка + название + значение. */
export function Legend({
  items, onPick, className,
}: {
  items: { key: string; color: string; label: ReactNode; dim?: boolean }[];
  onPick?: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {items.map((i) => {
        const body = (
          <>
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: i.color }}
            />
            {i.label}
          </>
        );
        const cls = "flex items-center gap-1.5 text-xs";
        return onPick ? (
          <button
            key={i.key}
            type="button"
            onClick={() => onPick(i.key)}
            className={clsx(cls, "tr-soft border-0 bg-transparent p-0")}
            style={{ color: "inherit", opacity: i.dim ? 0.5 : 1 }}
          >
            {body}
          </button>
        ) : (
          <span key={i.key} className={cls}>{body}</span>
        );
      })}
    </div>
  );
}

export interface DivergingRow {
  key: string;
  name: string;
  delta: number;
  /** Ссылка строки (Дашборд МНН). */
  to?: string;
}

/**
 * «Кто двигает рынок»: рост вправо от оси, падение влево.
 * axis — положение оси 0…1; без него ось смещается пропорционально
 * соотношению наибольшего падения и роста.
 */
export function DivergingBars({
  rows, t = 1, axis, barHeight = 22,
}: {
  rows: DivergingRow[];
  /** Прогресс появления 0…1. */
  t?: number;
  axis?: number;
  barHeight?: number;
}) {
  const maxPos = Math.max(0, ...rows.map((r) => r.delta));
  const maxNeg = Math.max(0, ...rows.map((r) => -r.delta));
  const span = maxPos + maxNeg;
  const zero = axis ?? (
    span > 0 ? Math.min(Math.max(maxNeg / span, 0.12), 0.88) : 0.5
  );
  // Общий масштаб: самый длинный бар упирается в край своей стороны.
  const scale = Math.max(maxPos / (1 - zero), maxNeg / zero, 1e-9);

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((r) => {
        const width = (Math.abs(r.delta) / scale) * t;
        const up = r.delta >= 0;
        const body = (
          <>
            <span className="truncate" title={r.name}>{r.name}</span>
            <span className="relative" style={{ height: barHeight }}>
              <span
                className="absolute -bottom-1 -top-1 w-px bg-line-strong"
                style={{ left: `${zero * 100}%` }}
              />
              <span
                className="absolute inset-y-0 rounded-[5px]"
                style={{
                  left: `${(up ? zero : zero - width) * 100}%`,
                  width: `${width * 100}%`,
                  background: up ? POS_BAR : NEG_BAR,
                }}
              />
            </span>
            <span
              className="whitespace-nowrap text-right font-semibold"
              style={{ color: up ? POS : NEG }}
            >
              {fmtDeltaUsd(r.delta)}
            </span>
          </>
        );
        const cls =
          "-mx-2 grid items-center gap-3.5 rounded-row px-2 py-[7px] text-sm text-fg " +
          "grid-cols-[minmax(110px,150px)_minmax(0,1fr)_84px]";
        return r.to ? (
          <Link
            key={r.key}
            to={r.to}
            className={clsx(cls, "tr-soft hover:bg-subtle hover:text-fg")}
          >
            {body}
          </Link>
        ) : (
          <div key={r.key} className={cls}>{body}</div>
        );
      })}
    </div>
  );
}

/** Три столбика по годам (в боковой панели). */
export function YearBars({
  items, height = 96, t = 1,
}: {
  items: {
    label: string;
    /** Высота столбика 0…1. */
    value: number;
    text: string;
    selected?: boolean;
  }[];
  height?: number;
  t?: number;
}) {
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  const barMax = height - 44;
  return (
    <div className="flex items-end gap-4" style={{ height }}>
      {items.map((i) => (
        <div
          key={i.label}
          className="flex h-full flex-1 flex-col justify-end gap-1.5"
        >
          <span className="text-[13px] font-semibold">{i.text}</span>
          <div
            style={{
              height: Math.max(2, (i.value / max) * barMax * t),
              background: i.selected
                ? "oklch(0.47 0.14 262)"
                : "oklch(0.88 0.04 262)",
              borderRadius: "5px 5px 2px 2px",
            }}
          />
          <span className="text-xs text-faint">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Ячейка тепловой карты: доля в процентах, шкала индиго. */
export function HeatCell({
  share, max = 25, className,
}: {
  /** Доля 0…1 или null. */
  share: number | null | undefined;
  max?: number;
  className?: string;
}) {
  const pct = share == null ? null : share * 100;
  return (
    <span
      className={clsx(
        "flex h-8 items-center justify-center rounded-md text-xs font-semibold",
        className,
      )}
      style={
        pct == null
          ? { background: "#f6f6f3", color: "#a3a6ad" }
          : heatIndigo(pct, max)
      }
    >
      {pct == null ? "—" : pct.toFixed(pct < 10 ? 1 : 0).replace(".", ",")}
    </span>
  );
}

/** Балл критерия 0…1 — ячейка / пилюля цветом уровня. */
export function ScoreCell({
  value, className,
}: {
  value: number;
  className?: string;
}) {
  const tone = scoreTone(value);
  return (
    <span
      className={clsx(
        "flex h-8 items-center justify-center rounded-md text-xs font-semibold",
        className,
      )}
      style={{ background: tone.background, color: tone.color }}
    >
      {value.toFixed(2).replace(".", ",")}
    </span>
  );
}

/**
 * Шкала зон с маркером. zones — границы зон 0…max по возрастанию;
 * value — положение маркера.
 */
export function ZoneScale({
  zones, value, max = 100, height = 16, marker = 20, onInk = false,
}: {
  zones: { to: number; color: string }[];
  value: number;
  max?: number;
  height?: number;
  marker?: number;
  onInk?: boolean;
}) {
  const widths = zones.map((z, i) => z.to - (i > 0 ? zones[i - 1].to : 0));
  const pos = Math.min(Math.max(value / max, 0), 1) * 100;
  return (
    <div className="relative" style={{ height: Math.max(height, marker) }}>
      <div
        className="absolute inset-x-0 flex gap-0.5 overflow-hidden"
        style={{
          top: (Math.max(height, marker) - height) / 2,
          height,
          borderRadius: height / 2,
        }}
      >
        {zones.map((z, i) => (
          <span
            key={z.to}
            style={{ flex: `${widths[i]} 1 0%`, background: z.color }}
          />
        ))}
      </div>
      <span
        className="absolute top-1/2 rounded-full bg-white"
        style={{
          left: `${pos}%`,
          width: marker,
          height: marker,
          translate: "-50% -50%",
          border: `${marker >= 20 ? 4 : 3}px solid ${onInk ? "#fff" : "#16181d"}`,
          background: onInk ? "oklch(0.26 0.075 268)" : "#fff",
        }}
      />
    </div>
  );
}
