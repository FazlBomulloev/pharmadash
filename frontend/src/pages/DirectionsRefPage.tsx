import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getDirectionRows, getDirectionsMeta } from "../api/client";
import type { DirectionRowsResponse } from "../types/api";
import { useDebounce } from "../hooks/useDebounce";
import { useFetch } from "../hooks/useFetch";
import { fmtInt, fmtShare } from "../lib/format";
import { Page } from "../components/layout/Layout";
import { PageHeader } from "../components/ui/Card";
import { Pagination } from "../components/ui/Pagination";
import { Select } from "../components/ui/Select";
import { EmptyCard, ErrorNote, Loading } from "../components/ui/states";

export default function DirectionsRefPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(searchParams.get("q") ?? "");
  const q = useDebounce(draft, 300);

  const direction = searchParams.get("direction") ?? "";
  const lf = searchParams.get("lf") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const perPage = parseInt(searchParams.get("per_page") ?? "30", 10) || 30;

  const patch = useCallback(
    (next: Record<string, string>) => {
      const out: Record<string, string> = {};
      const base = { direction, lf, page: String(page), per_page: String(perPage) };
      Object.entries({ ...base, ...next }).forEach(([k, v]) => {
        if (v && v !== "1" ) out[k] = v;
        else if (v && k !== "page") out[k] = v;
      });
      setSearchParams(out, { replace: true });
    },
    [direction, lf, page, perPage, setSearchParams],
  );

  const meta = useFetch(
    () => getDirectionsMeta(),
    [],
    "Не удалось загрузить сведения о справочнике",
  );

  const rows = useFetch<DirectionRowsResponse>(
    (signal) => getDirectionRows(
      { q, direction: direction || null, lf: lf || null, page, per_page: perPage },
      signal,
    ),
    [q, direction, lf, page, perPage],
    "Не удалось загрузить справочник",
  );

  const subtitle = useMemo(() => {
    const m = meta.data;
    if (!m || m.rows_count === 0) return "Справочник не загружен";
    const when = m.uploaded_at
      ? new Date(m.uploaded_at).toLocaleDateString("ru-RU")
      : "—";
    return `Загружен ${when} · ${fmtInt(m.rows_count)} строк · `
      + `${fmtInt(m.pairs_count)} пар МНН×ЛФ · ${m.directions.length} направлений`;
  }, [meta.data]);

  if (meta.data && meta.data.rows_count === 0) {
    return (
      <Page>
        <PageHeader title="Справочник направлений" subtitle={subtitle} />
        <EmptyCard
          title="Справочник пуст"
          description="Загрузите файл в разделе «Загрузка данных»"
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Справочник направлений" subtitle={subtitle}>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            patch({ page: "1" });
          }}
          placeholder="Поиск по МНН…"
          aria-label="Поиск по МНН"
          className="h-9 w-64 rounded-ctl border border-seg bg-white px-3 text-sm text-fg outline-none focus:border-line-strong"
        />
        <Select
          value={direction}
          allLabel="Все направления"
          align="right"
          width={260}
          onChange={(v) => patch({ direction: v, page: "1" })}
          options={(meta.data?.directions ?? []).map((d) => ({
            value: d, label: d,
          }))}
        />
        <Select
          value={lf}
          allLabel="Все ЛФ"
          align="right"
          onChange={(v) => patch({ lf: v, page: "1" })}
          options={(meta.data?.forms ?? []).map((f) => ({
            value: f, label: f,
          }))}
        />
      </PageHeader>

      {rows.error && <ErrorNote>{rows.error}</ErrorNote>}
      {!rows.data && rows.loading && <Loading className="h-64" />}

      {rows.data && (
        <div
          className="flex flex-col rounded-card bg-surface transition-opacity duration-200"
          style={rows.loading ? { opacity: 0.55 } : undefined}
        >
          <div className="grid grid-cols-[minmax(0,2fr)_110px_minmax(0,1fr)_80px] gap-3 px-4 pb-2 pt-4 text-[11px] text-faint">
            <span>МНН</span>
            <span>ЛФ</span>
            <span>Направление</span>
            <span className="text-right">Доля</span>
          </div>
          {rows.data.items.map((r) => (
            <div
              key={`${r.mnn}|${r.lf}|${r.direction}`}
              className="grid grid-cols-[minmax(0,2fr)_110px_minmax(0,1fr)_80px] items-center gap-3 border-t border-[#f3f3f0] px-4 py-2 text-sm"
            >
              <span className="truncate" title={r.mnn}>{r.mnn}</span>
              <span className="text-[13px] text-muted-2">{r.lf}</span>
              <span className="truncate" title={r.direction}>
                {r.direction}
              </span>
              <span className="text-right font-medium">
                {fmtShare(r.share)}
              </span>
            </div>
          ))}
          {rows.data.items.length === 0 && (
            <span className="px-4 py-6 text-sm text-faint">
              Ничего не найдено
            </span>
          )}
          <Pagination
            page={rows.data.page}
            pageSize={rows.data.per_page}
            total={rows.data.total}
            sizes={[30, 50, 100]}
            onPage={(p) => patch({ page: String(p) })}
            onPageSize={(s) => patch({ per_page: String(s), page: "1" })}
          />
        </div>
      )}
    </Page>
  );
}
