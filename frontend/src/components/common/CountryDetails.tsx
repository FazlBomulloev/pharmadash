import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, ArrowRight, Flag,
  DollarSign, Package, Users, Pill, ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import { getCountryDetails } from "../../api/client";
import type { CountryDetails as CountryDetailsData } from "../../types/api";
import LoadingSpinner from "./LoadingSpinner";
import type { DrillScope } from "./ProducerDetails";

/* ─────────────── formatters (local copies) ─────────────── */

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtUn(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}
function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function signed(v: number | null): string {
  if (v == null) return "—";
  const s = (v * 100).toFixed(1);
  return v >= 0 ? `+${s}%` : `${s}%`;
}

/* ─────────────── Loader ─────────────── */

export function CountryDetailsLoader({
  marketId, name, mnn, scope,
}: {
  marketId: number;
  name: string;
  mnn?: string | null;
  scope: DrillScope;
}) {
  const [data, setData] = useState<CountryDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    getCountryDetails(marketId, name, scope === "mnn" ? (mnn ?? null) : null)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          (e as { response?: { data?: { detail?: string } } })
            ?.response?.data?.detail ?? "Не удалось загрузить данные страны";
        setError(String(msg));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [marketId, name, mnn, scope]);

  if (loading) {
    return (
      <div className="py-6 flex flex-col items-center gap-2 text-slate-500">
        <LoadingSpinner size="md" />
        <span className="text-xs">Загрузка…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
        {error}
      </div>
    );
  }
  if (!data) return null;
  return <CountryDetails data={data} scope={scope} marketId={marketId} />;
}

/* ─────────────── Main content panel ─────────────── */

export default function CountryDetails({
  data, scope, marketId,
}: {
  data: CountryDetailsData;
  scope: DrillScope;
  marketId: number;
}) {
  const navigate = useNavigate();
  const kpi = data.kpi;
  const yl = kpi.years_labels;
  const shareLabel = scope === "mnn" ? "Доля в МНН" : "Доля рынка";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200/70">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 ring-1 ring-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <Flag size={18} className="text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h5 className="text-base font-bold text-slate-900 truncate leading-tight">
            {data.name}
          </h5>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/15">
              {scope === "mnn" ? "в контексте МНН" : "на всём рынке"}
            </span>
            <span className="text-[11px] text-slate-400">Страна производства</span>
          </div>
        </div>
      </div>

      {/* KPI mini row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniKpi label={`USD ${yl[2] ?? "Y3"}`} value={fmtUsd(kpi.usd_y3)} icon={DollarSign} />
        <MiniKpi label={`UN ${yl[2] ?? "Y3"}`} value={fmtUn(kpi.un_y3)} icon={Package} />
        <MiniKpi label={shareLabel} value={fmtPct(kpi.share_of_market)} icon={Flag} />
        <MiniKpi label="Производителей" value={String(kpi.producers_count)} icon={Users} />
        <MiniKpi label="МНН" value={String(kpi.mnns_count)} icon={Pill} />
        <MiniKpi label="USD рост" value={signed(kpi.usd_growth)} tone={growthTone(kpi.usd_growth)} icon={TrendingUp} />
      </div>

      {/* Share dynamics Y1 → Y3 */}
      {(kpi.share_y1 != null || kpi.share_y2 != null || kpi.share_y3 != null) && (
        <div className="grid grid-cols-3 gap-3">
          <ShareStep label={yl[0] ?? "Y1"} value={kpi.share_y1} />
          <ShareStep label={yl[1] ?? "Y2"} value={kpi.share_y2} />
          <ShareStep label={yl[2] ?? "Y3"} value={kpi.share_y3} />
        </div>
      )}

      {/* Producers of country */}
      {data.producers.length > 0 && (
        <Section title="Производители страны">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-medium">Производитель</th>
                  <th className="text-right py-2 px-3 font-medium">USD</th>
                  <th className="text-right py-2 px-3 font-medium">Доля в стране</th>
                  <th className="text-right py-2 px-3 font-medium">Доля рынка</th>
                  <th className="text-right py-2 px-3 font-medium">Y/Y</th>
                </tr>
              </thead>
              <tbody>
                {data.producers.map((p) => (
                  <tr key={p.name} className="border-b border-slate-100 last:border-b-0 hover:bg-white">
                    <td className="py-1.5 px-3 font-medium text-slate-700 truncate max-w-[220px]">{p.name}</td>
                    <td className="py-1.5 px-3 text-right">{fmtUsd(p.usd_y3)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-500">{fmtPct(p.share_in_country)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-500">{fmtPct(p.share_in_market)}</td>
                    <td className="py-1.5 px-3 text-right"><Growth value={p.growth} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* MNN portfolio (market scope only) */}
      {scope === "market" && data.mnn_portfolio && data.mnn_portfolio.length > 0 && (
        <Section title="Портфель МНН страны">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-medium">МНН</th>
                  <th className="text-right py-2 px-3 font-medium">USD</th>
                  <th className="text-right py-2 px-3 font-medium">Доля в стране</th>
                  <th className="text-right py-2 px-3 font-medium">Y/Y</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {data.mnn_portfolio.map((m) => (
                  <tr
                    key={m.mnn}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/market/${marketId}/dashboard?mnn=${encodeURIComponent(m.mnn)}`);
                    }}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-indigo-50/40 cursor-pointer"
                  >
                    <td className="py-1.5 px-3 font-medium text-slate-700 truncate max-w-[240px]">{m.mnn}</td>
                    <td className="py-1.5 px-3 text-right">{fmtUsd(m.usd_y3)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-500">{fmtPct(m.share_in_country)}</td>
                    <td className="py-1.5 px-3 text-right"><Growth value={m.growth} /></td>
                    <td className="py-1.5 pr-3 text-right"><ArrowRight size={12} className="text-slate-300 inline" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Forms × TM (native details/summary) */}
      {data.forms_breakdown.length > 0 && (
        <Section title="Формы × ТМ">
          <div className="space-y-2">
            {data.forms_breakdown.map((f) => (
              <details
                key={f.form}
                className="group rounded-lg border border-slate-200 bg-white"
              >
                <summary className="cursor-pointer list-none px-3 py-2 flex items-center gap-2 text-sm hover:bg-slate-50/50 rounded-lg">
                  <ChevronDown
                    size={14}
                    className="text-slate-400 transition-transform group-open:rotate-0 -rotate-90"
                  />
                  <span className="font-medium text-slate-700 flex-1 truncate">
                    {f.form || "—"}
                  </span>
                  <span className="text-xs text-slate-500 w-20 text-right">
                    {fmtUsd(f.usd_y3)}
                  </span>
                  <span className="text-xs text-slate-400 w-14 text-right">
                    {fmtPct(f.share_in_country)}
                  </span>
                </summary>
                {f.tms.length > 0 && (
                  <div className="border-t border-slate-100 px-3 pb-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                          <th className="text-left py-1.5 font-medium">ТМ</th>
                          <th className="text-right py-1.5 font-medium">USD</th>
                          <th className="text-right py-1.5 font-medium">Доля в форме</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.tms.map((t) => (
                          <tr key={t.tm} className="border-t border-slate-50">
                            <td className="py-1 text-slate-700 truncate max-w-[220px]">{t.tm}</td>
                            <td className="py-1 text-right">{fmtUsd(t.usd_y3)}</td>
                            <td className="py-1 text-right text-slate-500">{fmtPct(t.share_in_form)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ─────────────── helpers ─────────────── */

function growthTone(v: number | null): "up" | "down" | "flat" {
  if (v == null || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

function MiniKpi({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone?: "up" | "down" | "flat";
}) {
  const toneCls =
    tone === "up" ? "text-emerald-600" :
    tone === "down" ? "text-red-600" :
    "text-slate-900";
  const accentBar =
    tone === "up" ? "bg-emerald-400" :
    tone === "down" ? "bg-red-400" :
    "bg-emerald-400/60";
  const iconBg =
    tone === "up" ? "bg-emerald-500/10 text-emerald-600" :
    tone === "down" ? "bg-red-500/10 text-red-600" :
    "bg-emerald-500/10 text-emerald-600";
  return (
    <div className="relative overflow-hidden bg-white rounded-lg ring-1 ring-slate-200/70 shadow-sm hover:shadow transition-shadow px-3 py-2.5">
      <div className={clsx("absolute inset-x-0 top-0 h-0.5", accentBar)} />
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <span className={clsx("w-4 h-4 rounded-md flex items-center justify-center", iconBg)}>
          <Icon size={10} />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <p className={clsx("text-lg font-bold mt-1 leading-none tabular-nums", toneCls)}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h6 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
        <span className="w-0.5 h-3 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
        {title}
      </h6>
      {children}
    </div>
  );
}

function Growth({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300">—</span>;
  const isUp = value >= 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isUp ? "text-emerald-600" : "text-red-600",
      )}
    >
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {signed(value)}
    </span>
  );
}

function ShareStep({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-white/70 rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{fmtPct(value)}</p>
    </div>
  );
}
