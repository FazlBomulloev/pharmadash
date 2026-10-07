import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { useOutsideClose } from "../../hooks/useDismiss";

export interface SelectOption {
  value: string;
  label: string;
  /** Серая подпись справа (доля, количество). */
  hint?: ReactNode;
}

const SEARCH_FROM = 12;

/**
 * Кнопка-селект с выпадающим меню. Пустое значение ("") — пункт «все».
 * При длинном списке в меню появляется строка поиска.
 */
export function Select({
  label, value, options, onChange, allLabel, align = "left", width = 260,
  maxLabelWidth = 220, className,
}: {
  /** Серый ключ перед значением: «Форма», «Доза». */
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Подпись пункта без фильтра; без неё пустого пункта нет. */
  allLabel?: string;
  align?: "left" | "right";
  width?: number;
  maxLabelWidth?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const ref = useOutsideClose<HTMLDivElement>(open, close);

  const current = options.find((o) => o.value === value);
  const selected = value !== "" && current != null;
  const searchable = options.length > SEARCH_FROM;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, query]);

  function pick(next: string) {
    onChange(next);
    close();
  }

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="tr-soft flex items-center gap-2 whitespace-nowrap rounded-ctl border bg-white px-3 py-[7px] text-[13px] font-medium text-fg hover:bg-[#fafaf8]"
        style={{
          borderColor: selected ? "oklch(0.47 0.14 262)" : "#e3e3df",
        }}
      >
        {label && <span className="font-normal text-faint">{label}</span>}
        <span className="truncate" style={{ maxWidth: maxLabelWidth }}>
          {selected ? current.label : allLabel ?? "—"}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[#9a9ea6]" />
      </button>

      {open && (
        <div
          role="listbox"
          className={clsx(
            "anim-pop absolute top-[calc(100%+6px)] z-40 flex max-h-[340px] flex-col rounded-xl border border-seg bg-white p-1.5 shadow-pop",
            align === "right" ? "right-0" : "left-0",
          )}
          style={{ width: `min(${width}px, calc(100vw - 32px))` }}
        >
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск…"
              className="mb-1 rounded-lg border border-line-strong px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
            />
          )}
          <div className="flex flex-col overflow-y-auto">
            {allLabel && !query && (
              <Item
                label={allLabel}
                active={!selected}
                onClick={() => pick("")}
              />
            )}
            {visible.map((o) => (
              <Item
                key={o.value}
                label={o.label}
                hint={o.hint}
                active={o.value === value}
                onClick={() => pick(o.value)}
              />
            ))}
            {visible.length === 0 && (
              <span className="px-2.5 py-2 text-[13px] text-faint">
                Ничего не найдено
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Item({
  label, hint, active, onClick,
}: {
  label: string;
  hint?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        "tr-soft flex shrink-0 justify-between gap-3 rounded-lg border-0 px-2.5 py-2 text-left text-[13px] text-fg hover:bg-canvas",
        active ? "bg-canvas font-medium" : "bg-transparent",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {hint != null && <span className="shrink-0 text-faint">{hint}</span>}
    </button>
  );
}
