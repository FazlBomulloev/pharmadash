import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Search } from "lucide-react";
import {
  getMarkets, getPharmacySources, updatePharmacySources,
} from "../../api/client";
import type { Market, PharmacySource } from "../../types/api";
import { apiErrorText } from "../../lib/apiError";
import { fmtInt, plural } from "../../lib/format";
import { useFetch } from "../../hooks/useFetch";
import { Card, CardTitle } from "../ui/Card";
import { SidePanel } from "../ui/SidePanel";
import { ErrorNote, Loading } from "../ui/states";

const NO_COUNTRY = "Без страны";
const SUMMARY_NAMES = 3;

export function PharmacySourcesBlock() {
  const markets = useFetch<Market[]>(() => getMarkets(), []);
  const sources = useFetch<PharmacySource[]>(() => getPharmacySources(), []);
  // Сохранённые наборы держим здесь, чтобы строка рынка обновлялась сразу
  // после сохранения в панели, без перезагрузки списка рынков.
  const [saved, setSaved] = useState<Record<number, string[]>>({});
  const [editing, setEditing] = useState<Market | null>(null);

  const byslug = useMemo(
    () => new Map((sources.data ?? []).map((s) => [s.slug, s])),
    [sources.data],
  );
  const picked = (m: Market) => saved[m.id] ?? m.pharmacy_sources ?? [];

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle note="у каждого рынка свои аптечные сети">
        Источники цен аптек
      </CardTitle>
      <span className="text-[13px] text-muted-2">
        Раздел «Цены аптек» рынка показывает только выбранные сети. Цены
        собираются по всем сетям, выбор влияет лишь на то, где их видно.
      </span>
      {(markets.error || sources.error) && (
        <ErrorNote>{markets.error || sources.error}</ErrorNote>
      )}
      {(!markets.data || !sources.data) && <Loading className="h-20" />}
      {markets.data && sources.data && (
        <div className="flex flex-col">
          {markets.data.map((m) => {
            const names = picked(m)
              .map((slug) => byslug.get(slug)?.display_name ?? slug);
            return (
              <div
                key={m.id}
                className="grid grid-cols-[minmax(120px,200px)_minmax(0,1fr)_auto] items-center gap-4 border-t border-line py-3"
              >
                <span className="truncate text-sm font-semibold">{m.name}</span>
                <span className="min-w-0 truncate text-[13px] text-muted-2">
                  {names.length === 0 ? (
                    <span className="text-faint">аптеки не выбраны</span>
                  ) : (
                    <>
                      <b className="font-medium text-fg">
                        {names.length}{" "}
                        {plural(names.length, "аптека", "аптеки", "аптек")}
                      </b>
                      {" · "}
                      {names.slice(0, SUMMARY_NAMES).join(", ")}
                      {names.length > SUMMARY_NAMES
                        && ` и ещё ${names.length - SUMMARY_NAMES}`}
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  className="tr-soft h-8 whitespace-nowrap rounded-[9px] border border-line-strong bg-white px-3 text-[13px] font-medium text-fg hover:bg-[#fafaf8]"
                >
                  Изменить
                </button>
              </div>
            );
          })}
        </div>
      )}
      {editing && sources.data && (
        <SourcesPanel
          market={editing}
          sources={sources.data}
          initial={picked(editing)}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setSaved((prev) => ({ ...prev, [editing.id]: next }));
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function SourcesPanel({
  market, sources, initial, onClose, onSaved,
}: {
  market: Market;
  sources: PharmacySource[];
  initial: string[];
  onClose: () => void;
  onSaved: (sources: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = picked.size !== initial.length
    || initial.some((s) => !picked.has(s));

  // Страны с уже выбранными сетями — сверху: обычно рынок = одна страна.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, PharmacySource[]>();
    for (const s of sources) {
      const country = s.country || NO_COUNTRY;
      const hit = !q || s.display_name.toLowerCase().includes(q)
        || country.toLowerCase().includes(q);
      if (!hit) continue;
      map.set(country, [...(map.get(country) ?? []), s]);
    }
    const initialSet = new Set(initial);
    return [...map.entries()]
      .map(([country, list]) => ({
        country,
        list: [...list].sort((a, b) => a.display_name.localeCompare(b.display_name)),
        mine: list.some((s) => initialSet.has(s.slug)),
      }))
      .sort((a, b) => (
        Number(b.mine) - Number(a.mine) || a.country.localeCompare(b.country)
      ));
  }, [sources, query, initial]);

  function toggle(slug: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleGroup(list: PharmacySource[]) {
    const all = list.every((s) => picked.has(s.slug));
    setPicked((prev) => {
      const next = new Set(prev);
      for (const s of list) {
        if (all) next.delete(s.slug);
        else next.add(s.slug);
      }
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const next = await updatePharmacySources(market.id, [...picked]);
      onSaved(next.pharmacy_sources ?? []);
    } catch (e) {
      setError(apiErrorText(e, "Не удалось сохранить источники"));
      setBusy(false);
    }
  }

  return (
    <SidePanel
      onClose={onClose}
      width={460}
      gap={18}
      eyebrow="Источники цен аптек"
      title={`Рынок «${market.name}»`}
      headerExtra={
        <span className="text-[13px] text-muted-2">
          Выбрано {picked.size} из {sources.length}{" "}
          {plural(sources.length, "аптечной сети", "аптечных сетей", "аптечных сетей")}
        </span>
      }
    >
      <label className="flex h-9 items-center gap-2 rounded-ctl border border-seg bg-white px-3 focus-within:border-line-strong">
        <Search size={14} className="shrink-0 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Аптека или страна…"
          aria-label="Поиск аптеки"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-fg outline-none placeholder:text-faintest"
        />
      </label>

      {groups.length === 0 && (
        <span className="py-6 text-center text-sm text-muted-2">
          Ничего не найдено
        </span>
      )}

      {groups.map(({ country, list }) => {
        const count = list.filter((s) => picked.has(s.slug)).length;
        return (
          <section key={country} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                {country}
                <span className="ml-1.5 font-normal normal-case tracking-normal text-faint">
                  {count} из {list.length}
                </span>
              </span>
              <button
                type="button"
                onClick={() => toggleGroup(list)}
                className="tr-soft border-0 bg-transparent p-0 text-xs font-medium text-accent hover:text-accent-hover"
              >
                {count === list.length ? "Снять все" : "Выбрать все"}
              </button>
            </div>
            {list.map((s) => {
              const on = picked.has(s.slug);
              return (
                <button
                  key={s.slug}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(s.slug)}
                  className={clsx(
                    "tr-soft flex items-center gap-3 rounded-ctl border px-3 py-2.5 text-left",
                    on
                      ? "border-fg bg-[#fafaf8]"
                      : "border-line bg-white hover:border-line-strong",
                  )}
                >
                  <span
                    className={clsx(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border",
                      on ? "border-fg bg-fg text-white" : "border-line-strong bg-white",
                    )}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {s.display_name}
                  </span>
                  <span className="whitespace-nowrap text-xs text-faint">
                    {s.items_count
                      ? `${fmtInt(s.items_count)} цен · ${s.currency}`
                      : s.currency}
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="sticky bottom-0 -mx-7 -mb-10 flex justify-end gap-2.5 border-t border-line bg-white px-7 py-4">
        <button
          type="button"
          onClick={onClose}
          className="tr-soft h-9 rounded-ctl border border-line-strong bg-white px-4 text-[13px] font-medium text-fg hover:bg-[#fafaf8]"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={save}
          className="tr-soft h-9 rounded-ctl border-0 bg-accent px-4 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </SidePanel>
  );
}
