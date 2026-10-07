import type { ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { useEscape } from "../../hooks/useDismiss";

/**
 * Боковая панель справа поверх затемнения. Закрывается кликом по фону,
 * кнопкой ✕ и по Esc. Родитель рендерит не больше одной панели.
 */
export function SidePanel({
  onClose, width = 580, eyebrow, title, headerExtra, children, gap = 30,
}: {
  onClose: () => void;
  width?: number;
  /** Серый надзаголовок. */
  eyebrow?: ReactNode;
  /** Без заголовка шапка сжимается до кнопки закрытия. */
  title?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  gap?: number;
}) {
  useEscape(true, onClose);
  return (
    <>
      <div
        className="anim-overlay fixed inset-0 z-40 bg-[rgba(22,24,29,.18)]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="anim-panel fixed inset-y-0 right-0 z-[41] flex flex-col overflow-auto bg-white shadow-panel"
        style={{ width: `min(${width}px, 100%)` }}
      >
        <div
          className={clsx(
            "flex items-start gap-4",
            title
              ? "sticky top-0 z-[1] justify-between border-b border-line bg-white px-7 pb-4 pt-6"
              : "justify-end px-5 pt-4",
          )}
        >
          {title && (
            <div className="flex min-w-0 flex-col gap-1.5">
              {eyebrow && (
                <span className="flex flex-wrap items-center gap-2 text-xs text-faint">
                  {eyebrow}
                </span>
              )}
              <span className="break-words text-2xl font-semibold leading-tight tracking-[-0.02em]">
                {title}
              </span>
              {headerExtra}
            </div>
          )}
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="tr-soft flex size-8 shrink-0 items-center justify-center rounded-lg border-0 bg-[#f2f2ef] text-muted hover:bg-[#e8e8e4]"
          >
            <X size={16} />
          </button>
        </div>
        <div
          className={clsx("flex flex-col px-7 pb-10", title ? "pt-5" : "pt-2")}
          style={{ gap }}
        >
          {children}
        </div>
      </aside>
    </>
  );
}

/** Сетка KPI 3×N в панели. */
export function KpiGrid({
  items,
}: {
  items: { label: string; value: ReactNode; color?: string }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-[18px]">
      {items.map((k) => (
        <div key={k.label} className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-faint">{k.label}</span>
          <span
            className="whitespace-nowrap text-xl font-semibold"
            style={{ color: k.color }}
          >
            {k.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Вкладки с подчёркиванием. */
export function UnderlineTabs<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        "scrollbar-none flex gap-5 overflow-x-auto overflow-y-hidden",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={clsx(
              "tr-soft -mb-px shrink-0 whitespace-nowrap border-0 border-b-2 bg-transparent px-0 py-2 text-sm",
              active
                ? "border-fg font-semibold text-fg"
                : "border-transparent font-normal text-muted-2 hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Заголовок секции внутри панели. */
export function PanelSection({
  title, note, children, gap = 12,
}: {
  title?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <div className="flex flex-col" style={{ gap }}>
      {title && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{title}</span>
          {note && <span className="text-xs text-faint">{note}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
