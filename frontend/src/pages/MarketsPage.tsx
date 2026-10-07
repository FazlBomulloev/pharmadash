import { useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Plus } from "lucide-react";
import { deleteMarket, getMarkets } from "../api/client";
import type { Market } from "../types/api";
import { useEscape, useOutsideClose } from "../hooks/useDismiss";
import { useFetch } from "../hooks/useFetch";
import {
  fmtDayMonth, fmtGrowth, fmtInt, fmtUsd, plural, yearsRange,
} from "../lib/format";
import { CATEGORY_COLOR } from "../lib/palette";
import { Page } from "../components/layout/Layout";
import {
  CATEGORY_LABEL, CATEGORY_ORDER,
} from "../components/scoring/meta";
import { StackedBar } from "../components/ui/bars";
import { PageHeader } from "../components/ui/Card";
import { ErrorNote, Loading } from "../components/ui/states";
import { apiErrorText } from "../lib/apiError";

const DARK_BUTTON =
  "tr-soft rounded-[9px] bg-fg text-white hover:bg-[#2c2f36] hover:text-white";

export default function MarketsPage() {
  const { data, error, loading, setData } = useFetch<Market[]>(
    () => getMarkets(), [], "Не удалось загрузить список рынков",
  );
  const [confirm, setConfirm] = useState<Market | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function doDelete() {
    if (!confirm || !data) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteMarket(confirm.id);
      setData(data.filter((m) => m.id !== confirm.id));
      setConfirm(null);
    } catch (e) {
      setDeleteError(apiErrorText(e, "Не удалось удалить рынок"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Рынки" subtitle="Выберите рынок для анализа">
        <Link
          to="/admin"
          className={`${DARK_BUTTON} flex items-center gap-1.5 rounded-ctl! px-4 py-2.5 text-sm font-medium`}
        >
          <Plus size={16} /> Новый рынок
        </Link>
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && loading && <Loading className="h-64" />}

      {data && data.length === 0 && (
        <div className="anim-rise flex flex-col items-center gap-2.5 rounded-card border-[1.5px] border-dashed border-[#d6d6d1] bg-white px-6 py-16 text-center">
          <span className="text-lg font-semibold">Пока нет рынков</span>
          <span className="text-sm text-muted-2">
            Загрузите первый БДП, чтобы начать анализ
          </span>
          <Link
            to="/admin"
            className={`${DARK_BUTTON} mt-2 rounded-ctl! px-4 py-2.5 text-sm font-medium`}
          >
            Загрузить рынок
          </Link>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-5">
          {data.map((m, i) => (
            <MarketCard
              key={m.id}
              market={m}
              index={i}
              onDelete={() => {
                setDeleteError("");
                setConfirm(m);
              }}
            />
          ))}
          <Link
            to="/admin"
            className="anim-rise tr-soft flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-[#d6d6d1] text-sm font-medium text-muted hover:bg-white hover:text-fg"
            style={{ animationDelay: `${120 + 90 * data.length}ms` }}
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-seg text-fg">
              <Plus size={22} />
            </span>
            Новый рынок
          </Link>
        </div>
      )}

      {confirm && (
        <ConfirmDelete
          name={confirm.name}
          busy={deleting}
          error={deleteError}
          onCancel={() => setConfirm(null)}
          onConfirm={doDelete}
        />
      )}
    </Page>
  );
}

function MarketCard({
  market: m, index, onDelete,
}: {
  market: Market;
  index: number;
  onDelete: () => void;
}) {
  const hasBdp = m.usd_last != null;
  const regions = m.regions?.length ?? 0;
  const mnn = m.mnn_count ?? 0;
  const overview = `/market/${m.id}/overview`;
  const growth = m.usd_growth ?? null;

  return (
    <div
      className="anim-rise relative flex flex-col rounded-card bg-surface"
      style={{ animationDelay: `${120 + 90 * index}ms` }}
    >
      <Link
        to={hasBdp ? overview : `/admin?market=${m.id}`}
        className="tr-soft flex flex-col gap-3.5 rounded-t-card bg-ink px-6 pb-5 pt-[22px] text-white hover:bg-ink-hover hover:text-white"
      >
        <span className="flex items-center justify-between gap-2.5">
          <span className="min-w-0 truncate text-[19px] font-semibold tracking-[-0.01em]">
            {m.name}
          </span>
          <span
            className="shrink-0 rounded-full px-2 py-[3px] text-[11px] font-semibold"
            style={
              hasBdp
                ? {
                    background: "oklch(0.78 0.16 155 / 0.18)",
                    color: "oklch(0.86 0.14 155)",
                  }
                : {
                    background: "oklch(1 0 0 / 0.12)",
                    color: "oklch(0.84 0.04 268)",
                  }
            }
          >
            {hasBdp ? "БДП загружен" : "БДП не загружен"}
          </span>
        </span>
        <span className="flex flex-col gap-1.5">
          <span className="text-[40px] font-semibold leading-none tracking-[-0.04em]">
            {hasBdp ? fmtUsd(m.usd_last) : "—"}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-ink-fg-2">
            {growth != null && (
              <span
                className="font-semibold"
                style={{
                  color: growth < 0
                    ? "oklch(0.78 0.14 25)"
                    : "oklch(0.84 0.14 155)",
                }}
              >
                {fmtGrowth(growth)} г/г
              </span>
            )}
            <span>
              {hasBdp ? "продажи за последний год" : "загрузите БДП для анализа"}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-ink-fg-2">
          <span>{yearsRange(m.years)}</span>
          {regions > 0 && (
            <span>
              {regions} {plural(regions, "регион", "региона", "регионов")}
            </span>
          )}
          {mnn > 0 && <span>{fmtInt(mnn)} МНН</span>}
        </span>
      </Link>

      <div className="flex flex-col gap-3.5 px-6 py-[18px]">
        {m.categories && (
          <Link
            to={`/market/${m.id}/scoring`}
            className="flex flex-col gap-2 text-fg hover:text-fg"
          >
            <span className="text-xs text-faint">Скоринг МНН</span>
            <StackedBar
              height={32}
              gap={2}
              radius={8}
              minWidth={40}
              textClass="text-[13px] font-bold"
              segments={CATEGORY_ORDER.map((c) => ({
                key: c,
                value: m.categories![c],
                color: CATEGORY_COLOR[c].bg,
                fg: CATEGORY_COLOR[c].fg,
                label: fmtInt(m.categories![c]),
                title: CATEGORY_LABEL[c],
              }))}
            />
          </Link>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-xs text-faint">
            {m.bdp_loaded_at
              ? `БДП от ${fmtDayMonth(m.bdp_loaded_at)}`
              : `Создан ${fmtDayMonth(m.created_at)}`}
          </span>
          <div className="flex items-center gap-1.5">
            {hasBdp && (
              <Link
                to={overview}
                className={`${DARK_BUTTON} px-[13px] py-[7px] text-[13px] font-medium`}
              >
                Открыть →
              </Link>
            )}
            <CardMenu marketId={m.id} name={m.name} onDelete={onDelete} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CardMenu({
  marketId, name, onDelete,
}: {
  marketId: number;
  name: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));
  const item =
    "tr-soft rounded-lg px-2.5 py-2 text-[13px] text-fg hover:bg-canvas hover:text-fg";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Действия с рынком «${name}»`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="tr-soft flex size-[34px] items-center justify-center rounded-lg border-0 bg-transparent text-muted-2 hover:bg-[#f2f2ef]"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="anim-pop absolute right-0 top-[calc(100%+4px)] z-20 flex w-[200px] flex-col rounded-xl border border-seg bg-white p-1.5 shadow-pop"
        >
          <Link role="menuitem" to={`/admin?market=${marketId}`} className={item}>
            Перезагрузить БДП
          </Link>
          <Link
            role="menuitem"
            to={`/market/${marketId}/settings`}
            className={item}
          >
            Настройки рынка
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="tr-soft rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[13px] text-[oklch(0.5_0.17_25)] hover:bg-[oklch(0.97_0.02_25)]"
          >
            Удалить рынок…
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmDelete({
  name, busy, error, onCancel, onConfirm,
}: {
  name: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscape(true, onCancel);
  return (
    <>
      <div
        className="anim-overlay fixed inset-0 z-40 bg-[rgba(22,24,29,.28)]"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="anim-pop fixed left-1/2 top-1/2 z-[41] flex w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(16,24,40,.2)]"
      >
        <span id="confirm-delete-title" className="text-lg font-semibold">
          Удалить «{name}»?
        </span>
        <span className="text-sm leading-normal text-muted">
          Будут удалены БДП, маппинг полей и настройки скоринга этого рынка.
          Действие нельзя отменить.
        </span>
        {error && <span className="text-sm text-neg">{error}</span>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="tr-soft rounded-[9px] border-0 bg-[#f2f2ef] px-3.5 py-[9px] text-sm font-medium hover:bg-[#e8e8e4]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="tr-soft rounded-[9px] border-0 bg-[oklch(0.55_0.19_25)] px-3.5 py-[9px] text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
          >
            {busy ? "Удаление…" : "Удалить"}
          </button>
        </div>
      </div>
    </>
  );
}
