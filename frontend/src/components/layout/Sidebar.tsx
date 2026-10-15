import { useEffect, useState } from "react";
import {
  NavLink, useLocation, useNavigate, useParams,
} from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";
import clsx from "clsx";
import { getMarkets, logout } from "../../api/client";
import type { Market } from "../../types/api";
import { useOutsideClose } from "../../hooks/useDismiss";
import { useSession } from "../../hooks/useSession";
import { yearsRange } from "../../lib/format";
import { Logo } from "./Logo";

const MARKET_NAV = [
  { label: "Обзор", page: "overview" },
  { label: "Дашборд МНН", page: "dashboard" },
  { label: "Скоринг", page: "scoring" },
  { label: "Цены аптек (БДЦ)", page: "pharmacies" },
  { label: "Настройки", page: "settings" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return clsx(
    "tr-soft block rounded-lg px-2.5 py-2 text-sm",
    isActive
      ? "bg-seg font-semibold text-fg hover:text-fg"
      : "text-muted hover:bg-[#f0f0ed] hover:text-fg",
  );
}

export default function Sidebar() {
  const { marketId } = useParams<{ marketId: string }>();
  const { pathname } = useLocation();
  const [markets, setMarkets] = useState<Market[]>([]);

  const section = pathname.split("/")[1] ?? "";
  useEffect(() => {
    let cancelled = false;
    getMarkets()
      .then((list) => {
        if (!cancelled) setMarkets(list);
      })
      .catch(() => {
      });
    return () => {
      cancelled = true;
    };
  }, [section, marketId]);

  const current = markets.find((m) => String(m.id) === marketId);

  return (
    <aside className="sticky top-0 flex h-(--screen-h) w-56 shrink-0 flex-col gap-6 border-r border-seg bg-sidebar px-3 py-5">
      <NavLink
        to="/"
        aria-label="EPI, Evolet Pharma Intelligence — на список рынков"
        className="tr-soft flex items-center justify-center rounded-ctl bg-ink px-2 py-3.5 hover:bg-ink-hover"
      >
        <Logo />
      </NavLink>

      {marketId && (
        <nav className="flex flex-col gap-0.5" aria-label="Разделы рынка">
          <MarketSwitcher
            marketId={marketId}
            current={current}
            markets={markets}
          />
          {MARKET_NAV.map((item) => (
            <NavLink
              key={item.page}
              to={`/market/${marketId}/${item.page}`}
              className={navClass}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}

      <nav className="mt-auto flex flex-col gap-0.5" aria-label="Общие разделы">
        <NavLink to="/" end className={navClass}>
          Все рынки
        </NavLink>
        <NavLink to="/admin" className={navClass}>
          Загрузка данных
        </NavLink>
        <NavLink to="/directions" className={navClass}>
          Справочник направлений
        </NavLink>
      </nav>

      <CurrentUser />
    </aside>
  );
}

function CurrentUser() {
  const { user, clear } = useSession();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function leave() {
    setBusy(true);
    try {
      await logout();
    } finally {
      clear();
      window.location.replace("/login");
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-seg pt-3">
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-[13px] font-medium text-fg">
          {user.username}
        </span>
        <span className="truncate text-[11px] text-faint">{user.role}</span>
      </span>
      <button
        type="button"
        onClick={leave}
        disabled={busy}
        aria-label="Выйти"
        title="Выйти"
        className="tr-soft ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-faint hover:bg-[#f0f0ed] hover:text-fg disabled:opacity-50"
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}

function MarketSwitcher({
  marketId, current, markets,
}: {
  marketId: string;
  current: Market | undefined;
  markets: Market[];
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));

  const page = pathname.split("/")[3] ?? "overview";
  const regions = current?.regions?.length ?? 0;

  return (
    <div ref={ref} className="relative mb-2">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="tr-soft flex w-full items-center justify-between gap-2 rounded-[9px] border border-seg bg-white px-2.5 py-[9px] text-left hover:border-line-strong"
      >
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[13px] font-semibold text-fg">
            {current?.name ?? `Рынок ${marketId}`}
          </span>
          {current && (
            <span className="whitespace-nowrap text-[11px] text-faint">
              {yearsRange(current.years)}
              {regions > 0 && ` · ${regions} рег.`}
            </span>
          )}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[#9a9ea6]" />
      </button>
      {open && (
        <div
          role="listbox"
          className="anim-pop absolute inset-x-0 top-[calc(100%+6px)] z-40 flex max-h-72 flex-col overflow-y-auto rounded-xl border border-seg bg-white p-1.5 shadow-pop"
        >
          {markets.map((m) => {
            const active = String(m.id) === marketId;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setOpen(false);
                  if (!active) navigate(`/market/${m.id}/${page}`);
                }}
                className={clsx(
                  "tr-soft truncate rounded-lg border-0 px-2.5 py-2 text-left text-[13px] text-fg hover:bg-canvas",
                  active ? "bg-canvas font-medium" : "bg-transparent",
                )}
              >
                {m.name}
              </button>
            );
          })}
          {markets.length === 0 && (
            <span className="px-2.5 py-2 text-[13px] text-faint">
              Нет рынков
            </span>
          )}
        </div>
      )}
    </div>
  );
}
