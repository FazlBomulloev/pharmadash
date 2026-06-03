import { useState, useEffect, useRef } from "react";
import { Search, Pill } from "lucide-react";
import clsx from "clsx";
import { getMnnList } from "../../api/client";
import { useDebounce } from "../../hooks/useDebounce";

interface Props {
  marketId: number;
  value: string;
  onChange: (mnn: string) => void;
}

export default function MnnSearch({ marketId, value, onChange }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 200);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 1) {
      setSuggestions([]);
      return;
    }
    getMnnList(marketId, debouncedQuery).then((r) =>
      setSuggestions(r.mnns.slice(0, 15)),
    );
  }, [marketId, debouncedQuery]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(mnn: string) {
    setQuery(mnn);
    setOpen(false);
    onChange(mnn);
  }

  return (
    <div ref={ref} className="relative w-full max-w-lg">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              onChange(query.trim());
              setOpen(false);
            }
          }}
          placeholder="Введите МНН для анализа..."
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all shadow-sm"
        />
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map((mnn) => (
            <button
              key={mnn}
              onClick={() => select(mnn)}
              className={clsx(
                "w-full px-4 py-2.5 text-left text-sm hover:bg-indigo-50 flex items-center gap-2 transition-colors",
                mnn === value && "bg-indigo-50 text-indigo-700",
              )}
            >
              <Pill size={14} className="text-slate-400 flex-shrink-0" />
              {mnn}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
