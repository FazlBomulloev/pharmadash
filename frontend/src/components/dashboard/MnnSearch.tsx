import { useState } from "react";
import { Search, X } from "lucide-react";
import { suggestMnn } from "../../api/client";
import type { MnnSuggestion } from "../../types/api";
import { useDebounce } from "../../hooks/useDebounce";
import { useFetch } from "../../hooks/useFetch";
import { fmtScore, fmtUsd } from "../../lib/format";
import { CATEGORY_COLOR } from "../../lib/palette";
import { Autocomplete } from "../ui/Autocomplete";

/**
 * Поиск МНН с автокомплитом из БДП. В пустом поле — лучшие по скорингу,
 * при вводе — поиск по названию или началу класса ATC.
 */
export function MnnSearch({
  marketId, value, onChange,
}: {
  marketId: number;
  /** Выбранный МНН ("" — не выбран). */
  value: string;
  onChange: (mnn: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [focused, setFocused] = useState(false);

  // Выбранный МНН сменился снаружи (ссылка, история) — поле следует за ним.
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    setQuery(value);
  }

  // Текст равен выбранному МНН — показываем лучших, а не один пункт.
  const typed = query.trim() === value.trim() ? "" : query.trim();
  const debounced = useDebounce(typed, 180);
  const { data } = useFetch<MnnSuggestion[]>(
    (signal) => suggestMnn(marketId, debounced, signal),
    [marketId, debounced],
  );
  const items = data ?? [];

  return (
    <Autocomplete
      className="z-[35] max-w-[560px]"
      menuClassName="rounded-[14px]! shadow-[0_16px_40px_rgba(16,24,40,.14)]!"
      query={query}
      onQuery={setQuery}
      items={items}
      itemKey={(s) => s.mnn}
      onPick={(s) => {
        setQuery(s.mnn);
        onChange(s.mnn);
      }}
      header={
        debounced
          ? "Найдено в БДП"
          : "Лучшие по скорингу · начните вводить название или класс ATC"
      }
      emptyText="Нет такого МНН в БДП"
      renderItem={(s) => {
        const tone = CATEGORY_COLOR[s.category];
        return (
          <span className="grid grid-cols-[8px_minmax(0,1fr)_auto_64px_34px] items-center gap-2.5 text-sm text-fg">
            <span
              className="size-2 rounded-full"
              style={{ background: tone.bg }}
            />
            <span className="truncate">{s.mnn}</span>
            <span className="rounded-[5px] bg-[#f2f2ef] px-1.5 py-0.5 text-[11px] font-semibold text-muted">
              {s.cls ?? "—"}
            </span>
            <span className="whitespace-nowrap text-right text-[13px] text-muted-2">
              {fmtUsd(s.usd)}
            </span>
            <span
              className="rounded-md py-[3px] text-center text-xs font-bold"
              style={{ background: tone.bg, color: tone.fg }}
            >
              {fmtScore(s.total, 0)}
            </span>
          </span>
        );
      }}
    >
      {(input) => (
        <div
          className="tr-soft flex h-11 items-center gap-2.5 rounded-xl border bg-white px-3.5"
          style={{
            borderColor: focused ? "oklch(0.5 0.16 268)" : "#e3e3df",
          }}
        >
          <Search size={16} className="shrink-0 text-[#9a9ea6]" />
          <input
            {...input}
            aria-label="Поиск МНН"
            placeholder="Введите МНН для анализа…"
            onFocus={(e) => {
              setFocused(true);
              e.currentTarget.select();
              input.onFocus();
            }}
            onBlur={() => {
              setFocused(false);
              // незавершённый ввод не подменяет выбранный МНН
              setQuery(value);
              input.onBlur();
            }}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-fg outline-none placeholder:text-faintest"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onChange("");
              }}
              className="tr-soft flex items-center gap-1 whitespace-nowrap rounded-md border-0 bg-[#f2f2ef] px-2 py-[3px] text-xs text-muted hover:bg-[#e8e8e4]"
            >
              Сменить МНН <X size={12} />
            </button>
          )}
        </div>
      )}
    </Autocomplete>
  );
}
