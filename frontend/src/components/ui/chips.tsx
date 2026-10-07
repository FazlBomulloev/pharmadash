import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import type { ScoringCategory } from "../../types/api";
import { fmtGrowth } from "../../lib/format";
import {
  CATEGORY_COLOR, atcHue, countryChip, countryMeta, tintChip,
} from "../../lib/palette";
import { CATEGORY_LABEL } from "../scoring/meta";

export function GrowthChip({
  value, onInk = false, size = "pill", suffix, className,
}: {
  value: number | null | undefined;
  onInk?: boolean;
  size?: "pill" | "table";
  suffix?: string;
  className?: string;
}) {
  const empty = value == null || !Number.isFinite(value);
  const down = !empty && (value as number) < 0;
  let tone: CSSProperties;
  if (empty) {
    tone = onInk
      ? { background: "oklch(1 0 0 / 0.1)", color: "oklch(0.84 0.04 268)" }
      : { background: "#f0f0ec", color: "#8b8f97" };
  } else if (onInk) {
    tone = down
      ? { background: "oklch(0.7 0.17 25 / 0.2)", color: "oklch(0.84 0.1 25)" }
      : { background: "oklch(0.78 0.16 155 / 0.18)", color: "oklch(0.86 0.14 155)" };
  } else {
    tone = down
      ? { background: "oklch(0.95 0.035 25)", color: "oklch(0.45 0.15 25)" }
      : { background: "oklch(0.95 0.045 155)", color: "oklch(0.4 0.11 155)" };
  }
  return (
    <span
      className={clsx(
        "inline-block whitespace-nowrap font-semibold",
        size === "pill"
          ? "rounded-full px-[11px] py-[5px] text-sm"
          : "rounded-md px-[7px] py-[3px] text-xs",
        className,
      )}
      style={tone}
    >
      {fmtGrowth(value)}
      {suffix && !empty ? ` ${suffix}` : ""}
    </span>
  );
}

export function CountryChip({
  country, isHome = false, className,
}: {
  country: string | null | undefined;
  isHome?: boolean;
  className?: string;
}) {
  const meta = countryMeta(country, isHome);
  return (
    <span
      className={clsx(
        "inline-block rounded-[5px] px-1.5 py-[3px] text-center text-[10px] font-bold leading-none",
        className,
      )}
      style={countryChip(meta.hue)}
    >
      {meta.code}
    </span>
  );
}

export function CategoryPill({
  category, variant = "soft", dot = false, className,
}: {
  category: ScoringCategory;
  variant?: "solid" | "soft";
  dot?: boolean;
  className?: string;
}) {
  const c = CATEGORY_COLOR[category];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-1 text-xs font-semibold",
        className,
      )}
      style={
        variant === "solid"
          ? { background: c.bg, color: c.fg }
          : { background: c.tint, color: c.ink }
      }
    >
      {dot && (
        <span
          className="size-1.5 rounded-full"
          style={{ background: variant === "solid" ? c.fg : c.bg }}
        />
      )}
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function AtcChip({
  cls, className,
}: {
  cls: string | null | undefined;
  className?: string;
}) {
  if (!cls) return <span className="text-faint">—</span>;
  return (
    <span
      className={clsx(
        "inline-block max-w-full truncate rounded-md px-[7px] py-[3px] align-middle text-xs font-semibold",
        className,
      )}
      style={tintChip(atcHue(cls))}
    >
      {cls}
    </span>
  );
}

export function Pill({
  children, style, className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-block whitespace-nowrap rounded-full px-[9px] py-1 text-xs font-semibold",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}
