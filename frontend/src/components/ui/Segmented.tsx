import type { ReactNode } from "react";
import clsx from "clsx";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

/** Сегмент-контрол. dark — вариант для тёмного hero. */
export function Segmented<T extends string | number>({
  options, value, onChange, dark = false, size = "md", className, ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  dark?: boolean;
  size?: "md" | "sm";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={clsx(
        "inline-flex gap-0.5 p-[3px]",
        size === "md" ? "rounded-ctl" : "rounded-[9px]",
        className,
      )}
      style={{ background: dark ? "oklch(1 0 0 / 0.08)" : "#ebebe7" }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "tr-soft whitespace-nowrap border-0",
              size === "md"
                ? "rounded-lg px-3 py-1.5 text-[13px]"
                : "rounded-[7px] px-[11px] py-[5px] text-xs",
              active ? "font-semibold" : "font-medium",
              dark
                ? active ? "text-white" : "text-ink-fg-2 hover:text-white"
                : active ? "text-fg" : "text-muted-2 hover:text-fg",
            )}
            style={{
              background: active
                ? dark ? "oklch(1 0 0 / 0.16)" : "#fff"
                : "transparent",
              boxShadow: active && !dark
                ? "0 1px 2px rgba(16,24,40,.08)"
                : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
