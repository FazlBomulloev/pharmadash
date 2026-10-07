import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import { stagger } from "../../lib/anim";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Порядок в каскаде появления. */
  index?: number;
  /** rise — появление страницы, tab — смена вкладки. */
  anim?: "rise" | "tab" | "none";
}

export function Card({
  index = 0, anim = "rise", className, style, ...rest
}: CardProps) {
  return (
    <div
      className={clsx(
        "min-w-0 bg-surface rounded-card px-[26px] py-6",
        anim === "rise" && "anim-rise",
        anim === "tab" && "anim-tab",
        className,
      )}
      style={{ ...stagger(index), ...style }}
      {...rest}
    />
  );
}

export function CardTitle({
  children, note, right, className,
}: {
  children: ReactNode;
  /** Серое пояснение справа от заголовка. */
  note?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-baseline justify-between gap-3",
        className,
      )}
    >
      <span className="text-[17px] font-semibold tracking-[-0.01em]">
        {children}
      </span>
      {note && <span className="text-xs text-faint">{note}</span>}
      {right}
    </div>
  );
}

/** Тёмный hero-блок наверху экрана. */
export function DarkHero({
  index = 0, className, style, ...rest
}: HTMLAttributes<HTMLElement> & { index?: number }) {
  return (
    <section
      className={clsx(
        "anim-rise flex flex-wrap gap-x-11 gap-y-6 rounded-hero bg-ink",
        "px-[30px] py-7 text-white",
        className,
      )}
      style={{ ...stagger(index), ...style }}
      {...rest}
    />
  );
}

/** Шапка страницы: заголовок слева, фильтры справа. */
export function PageHeader({
  title, subtitle, children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="anim-head flex flex-wrap items-end justify-between gap-5">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle && (
          <div className="text-sm text-muted-2">{subtitle}</div>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2.5">{children}</div>
      )}
    </header>
  );
}
