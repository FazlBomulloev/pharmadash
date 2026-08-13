import { useEffect, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  ChevronDown,
  FlaskConical,
  Check,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import clsx from "clsx";
import { getMarkets } from "../../api/client";
import type { Market } from "../../types/api";
import { useTheme } from "../../hooks/useTheme";

// Fallback titles for pages that don't sit under /market/:id/.
const GLOBAL_TITLES: Record<string, string> = {
  "/": "Рынки",
  "/admin": "Загрузка данных",
  "/admin/dictionary": "Словарь",
  "/admin/dictionary/import": "Импорт словаря",
};

const MARKET_PAGE_TITLES: Record<string, string> = {
  overview: "Обзор",
  dashboard: "Дашборд МНН",
  references: "Справочники",
};

function marketPageTitle(pathname: string): string | null {
  const m = pathname.match(/\/market\/\d+\/([a-z]+)/i);
  if (!m) return null;
  return MARKET_PAGE_TITLES[m[1]] ?? null;
}

export default function Header() {
  const { pathname } = useLocation();
  const marketMatch = useMatch("/market/:marketId/*");
  const marketId = marketMatch?.params.marketId ?? null;

  const globalTitle = GLOBAL_TITLES[pathname];
  const marketPage = marketPageTitle(pathname);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-between px-6 flex-shrink-0">
      <nav aria-label="Хлебные крошки" className="flex items-center min-w-0">
        {marketId ? (
          <MarketBreadcrumb marketId={marketId} marketPage={marketPage} />
        ) : (
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 truncate">
            {globalTitle ?? "PharmDash"}
          </h1>
        )}
      </nav>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { pref, cycle } = useTheme();
  const label =
    pref === "system"
      ? "Тема: системная"
      : pref === "dark"
      ? "Тема: тёмная"
      : "Тема: светлая";
  return (
    <button
      onClick={cycle}
      title={label}
      aria-label={label}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {pref === "system" ? (
        <Monitor size={16} />
      ) : pref === "dark" ? (
        <Moon size={16} />
      ) : (
        <Sun size={16} />
      )}
    </button>
  );
}

function MarketBreadcrumb({
  marketId, marketPage,
}: {
  marketId: string;
  marketPage: string | null;
}) {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = markets.find((m) => String(m.id) === marketId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMarkets()
      .then((list) => { if (!cancelled) setMarkets(list); })
      .catch(() => { /* silent — breadcrumb still shows page title */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function switchTo(m: Market) {
    // Preserve the sub-page slug (overview/dashboard/…) when switching.
    const slug = window.location.pathname.match(/\/market\/\d+\/([a-z]+)/i)?.[1] ?? "overview";
    setOpen(false);
    navigate(`/market/${m.id}/${slug}`);
  }

  return (
    <div className="flex items-center gap-2 min-w-0" ref={ref}>
      <button
        onClick={() => navigate("/")}
        className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        Рынки
      </button>
      <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <FlaskConical size={14} className="text-indigo-500 dark:text-indigo-400" />
          <span className="truncate max-w-[240px]">
            {current?.name ?? (loading ? "…" : `Рынок #${marketId}`)}
          </span>
          <ChevronDown size={13} className="text-slate-400 dark:text-slate-500" />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute left-0 top-full mt-1 min-w-[260px] max-h-[320px] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 py-1"
          >
            {markets.length === 0 && !loading && (
              <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-2">Нет рынков</p>
            )}
            {loading && (
              <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-2">Загрузка…</p>
            )}
            {markets.map((m) => {
              const selected = String(m.id) === marketId;
              return (
                <button
                  key={m.id}
                  role="option"
                  aria-selected={selected}
                  onClick={() => switchTo(m)}
                  className={clsx(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800",
                    selected && "bg-indigo-50/60 dark:bg-indigo-950/40",
                  )}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-slate-800 dark:text-slate-100 truncate">
                      {m.name}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {m.years.join(", ")}
                      {m.mnn_count != null && (
                        <> · {m.mnn_count.toLocaleString("ru-RU")} МНН</>
                      )}
                    </span>
                  </span>
                  {selected && (
                    <Check size={14} className="text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {marketPage && (
        <>
          <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
          <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{marketPage}</span>
        </>
      )}
    </div>
  );
}
