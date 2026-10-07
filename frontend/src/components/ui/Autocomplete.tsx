import {
  useEffect, useId, useState, type KeyboardEvent, type ReactNode,
} from "react";
import clsx from "clsx";
import { useOutsideClose } from "../../hooks/useDismiss";

export function Autocomplete<T>({
  query, onQuery, items, itemKey, renderItem, onPick, header, emptyText,
  children, className, menuClassName,
}: {
  query: string;
  onQuery: (q: string) => void;
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onPick: (item: T) => void;
  header?: ReactNode;
  emptyText: string;
  children: (input: {
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    onFocus: () => void;
    onBlur: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
    role: "combobox";
    "aria-expanded": boolean;
    "aria-controls": string;
    "aria-autocomplete": "list";
    autoComplete: "off";
  }) => ReactNode;
  className?: string;
  menuClassName?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));

  const [seenItems, setSeenItems] = useState(items);
  if (seenItems !== items) {
    setSeenItems(items);
    setHighlight(0);
  }

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${listId}-${highlight}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, highlight, listId]);

  function pick(item: T) {
    onPick(item);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (items.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + step + items.length) % items.length);
    } else if (e.key === "Enter") {
      if (open && items[highlight]) {
        e.preventDefault();
        pick(items[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className={clsx("relative", className)}>
      {children({
        value: query,
        onChange: (e) => {
          onQuery(e.target.value);
          setOpen(true);
        },
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
        onKeyDown,
        role: "combobox",
        "aria-expanded": open,
        "aria-controls": listId,
        "aria-autocomplete": "list",
        autoComplete: "off",
      })}
      {open && (
        <div
          id={listId}
          role="listbox"
          className={clsx(
            "anim-pop absolute left-0 top-[calc(100%+6px)] z-40 flex max-h-[380px] w-full flex-col overflow-y-auto rounded-xl border border-seg bg-white p-1.5 shadow-pop",
            menuClassName,
          )}
        >
          {header && (
            <span className="px-2.5 pb-1.5 pt-1 text-[11px] text-faint">
              {header}
            </span>
          )}
          {items.map((item, i) => (
            <div
              key={itemKey(item)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={clsx(
                "tr-soft cursor-pointer rounded-lg px-2.5 py-2 text-[13px]",
                i === highlight ? "bg-canvas" : "bg-transparent",
              )}
            >
              {renderItem(item)}
            </div>
          ))}
          {items.length === 0 && (
            <span className="px-2.5 py-2 text-[13px] text-faint">
              {emptyText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
