import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, ArrowRight, Building2,
  DollarSign, Package, LineChart, PieChart as PieIcon, MapPin,
} from "lucide-react";
import clsx from "clsx";
import { getProducerDetails } from "../../api/client";
import type {
  ProducerDetails as ProducerDetailsData, BgGFlag,
} from "../../types/api";
import LoadingSpinner from "./LoadingSpinner";

export type DrillScope = "market" | "mnn";

/* ─────────────── formatters ─────────────── */

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

/* ─────────────── Loader wrapper (fetches, renders spinner/error/panel) ─────────────── */

export function ProducerDetailsLoader({
  marketId, name, mnn, scope,
}: {
  marketId: number;
  name: string;
  mnn?: string | null;
  scope: DrillScope;
}) {
  const [data, setData] = useState<ProducerDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    getProducerDetails(marketId, name, scope === "mnn" ? (mnn ?? null) : null)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          (e as { response?: { data?: { detail?: string } } })
            ?.response?.data?.detail ?? "Не удалось загрузить данные производителя";
        setError(String(msg));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [marketId, name, mnn, scope]);

  if (loading) {
    return (
      <div className="py-6 flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
        <LoadingSpinner size="md" />
        <span className="text-xs">Загрузка…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm">
        {error}
      </div>
    );
  }
  if (!data) return null;
  return <ProducerDetails data={data} scope={scope} marketId={marketId} />;
}

/* ─────────────── Main content panel ─────────────── */

export default function ProducerDetails({
  data, scope, marketId,
}: {
  data: ProducerDetailsData;
  scope: DrillScope;
  marketId: number;
}) {
  const navigate = useNavigate();
  const kpi = data.kpi;
  const shareLabel = scope === "mnn" ? "Доля в МНН" : "Доля рынка";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200/70 dark:border-slate-700/70">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 ring-1 ring-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <Building2 size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h5 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
            {data.name}
          </h5>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-500/15">
              {scope === "mnn" ? "в контексте МНН" : "на всём рынке"}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Производитель</span>
            {kpi.top_country && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                <MapPin size={10} className="text-slate-400 dark:text-slate-500" />
                {kpi.top_country}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPI mini row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniKpi label={`USD ${kpi.years_labels[2] ?? "Y3"}`} value={fmtUsd(kpi.usd_y3)} icon={DollarSign} />
        <MiniKpi label={`UN ${kpi.years_labels[2] ?? "Y3"}`} value={fmtUn(kpi.un_y3)} icon={Package} />
        <MiniKpi label="USD рост" value={signed(kpi.usd_growth)} tone={growthTone(kpi.usd_growth)} icon={LineChart} />
        <MiniKpi label="CAGR 2y" value={signed(kpi.usd_cagr_2y)} tone={growthTone(kpi.usd_cagr_2y)} icon={LineChart} />
        <MiniKpi label="ASP" value={kpi.asp_y3 != null ? `$${kpi.asp_y3.toFixed(2)}` : "—"} icon={DollarSign} />
        <MiniKpi label={shareLabel} value={fmtPct(kpi.share_of_market)} icon={PieIcon} />
      </div>

      {/* MNN portfolio (market scope only) — с ТМ и формой */}
      {scope === "market" && data.mnn_portfolio && data.mnn_portfolio.length > 0 && (
        <Section title="Портфель МНН × ТМ × форма">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 px-3 font-medium">МНН</th>
                  <th className="text-left py-2 px-3 font-medium">ТМ</th>
                  <th className="text-left py-2 px-3 font-medium">Форма</th>
                  <th className="text-center py-2 px-3 font-medium">БГ/Г</th>
                  <th className="text-right py-2 px-3 font-medium">USD</th>
                  <th className="text-right py-2 px-3 font-medium">Доля в произв-е</th>
                  <th className="text-right py-2 px-3 font-medium">Доля рынка</th>
                  <th className="text-right py-2 px-3 font-medium">Конкур.</th>
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
                    className="border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 cursor-pointer"
                  >
                    <td className="py-1.5 px-3 font-medium text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{m.mnn}</td>
                    <td className="py-1.5 px-3 text-slate-600 dark:text-slate-300 truncate max-w-[160px]">{m.tm ?? "—"}</td>
                    <td className="py-1.5 px-3 text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{m.form ?? "—"}</td>
                    <td className="py-1.5 px-3 text-center"><BgGBadge flag={m.bg_g_flag} /></td>
                    <td className="py-1.5 px-3 text-right text-slate-800 dark:text-slate-100">{fmtUsd(m.usd_y3)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-500 dark:text-slate-400">{fmtPct(m.share_in_producer)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-500 dark:text-slate-400">{fmtPct(m.share_in_market)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-700 dark:text-slate-200">{m.competitors_in_mnn}</td>
                    <td className="py-1.5 px-3 text-right"><Growth value={m.growth} /></td>
                    <td className="py-1.5 pr-3 text-right"><ArrowRight size={12} className="text-slate-300 dark:text-slate-600 inline" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* TM × form (mnn-scope only — на market scope это уже включено выше) */}
      {scope === "mnn" && data.tm_breakdown.length > 0 && (
        <Section title="ТМ × форма">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 px-3 font-medium">ТМ</th>
                  <th className="text-left py-2 px-3 font-medium">Форма</th>
                  <th className="text-center py-2 px-3 font-medium">БГ/Г</th>
                  <th className="text-right py-2 px-3 font-medium">USD</th>
                  <th className="text-right py-2 px-3 font-medium">UN</th>
                  <th className="text-right py-2 px-3 font-medium">Доля произв-я</th>
                </tr>
              </thead>
              <tbody>
                {data.tm_breakdown.map((t, i) => (
                  <tr key={`${t.tm}-${t.form}-${i}`} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-white dark:hover:bg-slate-800/40">
                    <td className="py-1.5 px-3 font-medium text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{t.tm}</td>
                    <td className="py-1.5 px-3 text-slate-600 dark:text-slate-300">{t.form || "—"}</td>
                    <td className="py-1.5 px-3 text-center">
                      <BgGBadge flag={t.bg_g_flag} />
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-800 dark:text-slate-100">{fmtUsd(t.usd_y3)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-500 dark:text-slate-400">{fmtUn(t.un_y3)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-500 dark:text-slate-400">{fmtPct(t.share_in_producer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Sector + top regions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Сектор (RET / HOS)">
          <SectorBar retShare={data.sector_split.ret_share} hosShare={data.sector_split.hos_share} />
          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            <div className="flex justify-between px-2 py-1.5 rounded bg-white/60 dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">RET USD</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{fmtUsd(data.sector_split.ret_usd)}</span>
            </div>
            <div className="flex justify-between px-2 py-1.5 rounded bg-white/60 dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">HOS USD</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{fmtUsd(data.sector_split.hos_usd)}</span>
            </div>
          </div>
        </Section>

        <Section title="Топ-регионы">
          {data.top_regions.length > 0 ? (
            <ul className="space-y-1.5">
              {data.top_regions.map((r) => (
                <li key={r.region} className="flex items-center gap-2 text-xs">
                  <MapPin size={11} className="text-indigo-400 dark:text-indigo-300 flex-shrink-0" />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{r.region}</span>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{fmtPct(r.share_in_producer)}</span>
                  <span className="text-slate-400 dark:text-slate-500 w-14 text-right">{fmtUsd(r.usd_y3)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">Нет данных</p>
          )}
        </Section>
      </div>
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
    tone === "up" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "down" ? "text-red-600 dark:text-red-400" :
    "text-slate-900 dark:text-slate-100";
  const accentBar =
    tone === "up" ? "bg-emerald-400" :
    tone === "down" ? "bg-red-400" :
    "bg-indigo-400/60";
  const iconBg =
    tone === "up" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
    tone === "down" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
    "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";
  return (
    <div className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-lg ring-1 ring-slate-200/70 dark:ring-slate-700/70 shadow-sm hover:shadow transition-shadow px-3 py-2.5">
      <div className={clsx("absolute inset-x-0 top-0 h-0.5", accentBar)} />
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
      <h6 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
        <span className="w-0.5 h-3 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
        {title}
      </h6>
      {children}
    </div>
  );
}

function BgGBadge({ flag }: { flag: BgGFlag | null }) {
  if (!flag) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
  const style =
    flag === "BG"
      ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-900"
      : flag === "G"
      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900"
      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700";
  const label = flag === "MIXED" ? "M" : flag;
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center min-w-[26px] px-1 py-0.5 rounded-md text-[10px] font-bold tracking-wider ring-1 ring-inset",
        style,
      )}
      title={
        flag === "BG"
          ? "Бренд-генерик"
          : flag === "G"
          ? "Генерик"
          : "Смешанный"
      }
    >
      {label}
    </span>
  );
}

function Growth({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const isUp = value >= 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {signed(value)}
    </span>
  );
}

function SectorBar({ retShare, hosShare }: { retShare: number; hosShare: number }) {
  const ret = Math.max(0, Math.min(1, retShare));
  const hos = Math.max(0, Math.min(1, hosShare));
  const total = ret + hos;
  const retPct = total > 0 ? (ret / total) * 100 : 0;
  const hosPct = total > 0 ? (hos / total) * 100 : 0;
  return (
    <div>
      <div className="h-4 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex">
        <div className="h-full bg-indigo-500 flex items-center justify-center text-[10px] text-white font-medium" style={{ width: `${retPct}%` }}>
          {retPct >= 15 ? `${retPct.toFixed(0)}%` : ""}
        </div>
        <div className="h-full bg-emerald-500 flex items-center justify-center text-[10px] text-white font-medium" style={{ width: `${hosPct}%` }}>
          {hosPct >= 15 ? `${hosPct.toFixed(0)}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-[11px] mt-1.5 text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-indigo-500" /> RET {fmtPct(retShare)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-500" /> HOS {fmtPct(hosShare)}
        </span>
      </div>
    </div>
  );
}
