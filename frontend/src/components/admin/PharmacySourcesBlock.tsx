import { useState } from "react";
import clsx from "clsx";
import {
  getMarkets, getPharmacySources, updatePharmacySources,
} from "../../api/client";
import type { Market, PharmacySource } from "../../types/api";
import { apiErrorText } from "../../lib/apiError";
import { useFetch } from "../../hooks/useFetch";
import { Card, CardTitle } from "../ui/Card";
import { ErrorNote, Loading } from "../ui/states";

export function PharmacySourcesBlock() {
  const markets = useFetch<Market[]>(() => getMarkets(), []);
  const sources = useFetch<PharmacySource[]>(() => getPharmacySources(), []);

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle note="у каждого рынка свои аптечные сети">
        Источники цен аптек
      </CardTitle>
      <span className="text-[13px] text-muted-2">
        Раздел «Цены аптек» рынка показывает только отмеченные сети. Цены
        собираются по всем сетям, привязка влияет лишь на то, где их видно.
      </span>
      {(markets.error || sources.error) && (
        <ErrorNote>{markets.error || sources.error}</ErrorNote>
      )}
      {(!markets.data || !sources.data) && <Loading className="h-20" />}
      {markets.data && sources.data && markets.data.map((m) => (
        <MarketSources key={m.id} market={m} sources={sources.data!} />
      ))}
    </Card>
  );
}

function MarketSources({
  market, sources,
}: {
  market: Market;
  sources: PharmacySource[];
}) {
  const [saved, setSaved] = useState<string[]>(market.pharmacy_sources ?? []);
  const [picked, setPicked] = useState<string[]>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = [...picked].sort().join() !== [...saved].sort().join();

  function toggle(slug: string) {
    setPicked((prev) => (
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    ));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const next = await updatePharmacySources(market.id, picked);
      setSaved(next.pharmacy_sources ?? []);
      setPicked(next.pharmacy_sources ?? []);
    } catch (e) {
      setError(apiErrorText(e, "Не удалось сохранить источники"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[160px] text-sm font-semibold">
          {market.name}
        </span>
        {sources.map((s) => {
          const active = picked.includes(s.slug);
          return (
            <button
              key={s.slug}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(s.slug)}
              className={clsx(
                "tr-soft h-8 whitespace-nowrap rounded-[9px] border px-3 text-[13px] font-medium",
                active
                  ? "border-fg bg-fg text-white"
                  : "border-line-strong bg-white text-fg hover:bg-[#fafaf8]",
              )}
            >
              {s.display_name}
            </button>
          );
        })}
        {dirty && (
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="tr-soft h-8 rounded-ctl border-0 bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
