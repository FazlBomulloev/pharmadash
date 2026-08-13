import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  FileCheck,
  DollarSign,
  Sigma,
  Map as MapIcon,
  Pill,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import type {
  Zone2Data, FormConcentration, RegionalDistribution,
  BgGBreakdown, GrlsExtra, BgGFlag,
} from "../../types/api";
import DrillDownRow from "../common/DrillDownRow";
import { ProducerDetailsLoader } from "../common/ProducerDetails";
import { CountryDetailsLoader } from "../common/CountryDetails";
import ScopeChip from "../common/ScopeChip";

const PIE_COLORS = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#6366f1",
];

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtUn(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

function concentrationLabel(hhi: number | null): {
  text: string;
  color: string;
} {
  if (hhi == null) return { text: "Нет данных", color: "text-slate-400" };
  if (hhi < 1500)
    return { text: "Низкая", color: "text-emerald-600" };
  if (hhi < 2500)
    return { text: "Умеренная", color: "text-amber-600" };
  return { text: "Высокая", color: "text-red-600" };
}

export default function Zone2({
  data, marketId, mnn, years,
}: {
  data: Zone2Data;
  marketId: number;
  mnn: string;
  years: number[];
}) {
  const [expandedProducer, setExpandedProducer] = useState<string | null>(null);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  const sectorData = [
    { name: "Розница (RET)", value: data.ret_share ?? 0 },
    { name: "Госпитальный (HOS)", value: data.hos_share ?? 0 },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        Структура рынка
        <ScopeChip scope="mnn" />
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sector Split */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Доля секторов
          </h4>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={sectorData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                dataKey="value"
                stroke="none"
              >
                <Cell fill="#4f46e5" />
                <Cell fill="#10b981" />
              </Pie>
              <Tooltip
                formatter={(value) => fmtPct(Number(value))}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-xs mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              RET {fmtPct(data.ret_share)}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              HOS {fmtPct(data.hos_share)}
            </div>
          </div>
        </div>

        {/* Regulatory */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Регуляторика
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <FileCheck size={20} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">ГРЛС</p>
                <p className="text-sm font-medium text-slate-700">{data.grls}</p>
              </div>
            </div>

            {data.pc_stats ? (
              <div className={clsx(
                "flex items-center gap-3 p-3 rounded-lg",
                data.pc_flag ? "bg-amber-50" : "bg-slate-50",
              )}>
                <DollarSign size={20} className={
                  data.pc_flag ? "text-amber-600" : "text-slate-400"
                } />
                <div>
                  <p className="text-xs text-slate-500">Предельная цена</p>
                  <p className="text-sm font-medium text-slate-700">
                    {data.pc_stats.min.toFixed(0)} – {data.pc_stats.max.toFixed(0)} &#8381;
                    <span className="text-xs text-slate-400 ml-1">
                      ({data.pc_stats.count} записей)
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <DollarSign size={20} className="text-slate-300" />
                <div>
                  <p className="text-xs text-slate-500">Предельная цена</p>
                  <p className="text-sm font-medium text-slate-400">Нет данных</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Concentration + Entropy + BG/G */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ConcentrationCard
          hhi={data.hhi}
          top3={data.top3_share}
          leader={data.leader_share}
          entropy={data.entropy_normalized}
        />
        {data.bg_g_breakdown && (
          <BgGCard data={data.bg_g_breakdown} years={years} />
        )}
        {data.regional_distribution && (
          <RegionalCard
            data={data.regional_distribution}
            className={!data.bg_g_breakdown ? "lg:col-span-2" : ""}
          />
        )}
      </div>

      {/* GRLS extended */}
      {data.grls_extra && data.grls_active_count > 0 && (
        <GrlsExtendedCard
          extra={data.grls_extra}
          activeCount={data.grls_active_count}
        />
      )}

      {/* Concentration by form */}
      <ConcentrationByForm items={data.concentration_by_form ?? []} />

      {/* Top Competitors */}
      {data.top_competitors.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-700">
              Топ-{data.top_competitors.length} производителей
            </h4>
            {data.total_producers > data.top_competitors.length && (
              <span className="text-xs text-slate-400">
                из {data.total_producers} всего
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="w-6"></th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">
                    #
                  </th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">
                    Производитель
                  </th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">
                    Страна
                  </th>
                  <th className="text-center py-2 px-3 text-slate-500 font-medium">
                    БГ/Г
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    USD
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    Доля
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    ASP
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    USD рост
                  </th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">
                    UN рост
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.top_competitors.map((c, i) => (
                  <DrillDownRow
                    key={c.corporation}
                    expanded={expandedProducer === c.corporation}
                    onToggle={() =>
                      setExpandedProducer((prev) =>
                        prev === c.corporation ? null : c.corporation,
                      )
                    }
                    colSpan={10}
                    columns={
                      <>
                        <td className="py-2.5 px-3 text-slate-400">
                          {i + 1}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor:
                                  PIE_COLORS[i % PIE_COLORS.length],
                              }}
                            />
                            {c.corporation}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 text-xs">
                          {c.country ?? "—"}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <BgGBadge flag={c.bg_g_flag} />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {fmtUsd(c.usd_last_year)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{
                                  width: `${Math.min(c.share * 100, 100)}%`,
                                }}
                              />
                            </div>
                            <span className="w-12 text-right">
                              {fmtPct(c.share)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {c.asp != null ? `$${c.asp.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <GrowthBadge value={c.usd_growth} />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <GrowthBadge value={c.un_growth} />
                        </td>
                      </>
                    }
                  >
                    <ProducerDetailsLoader
                      marketId={marketId}
                      name={c.corporation}
                      mnn={mnn}
                      scope="mnn"
                    />
                  </DrillDownRow>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Forms & Countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.forms.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-4">
              Лекарственные формы
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.forms.slice(0, 8)}
                layout="vertical"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(v: number) => fmtPct(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  interval={0}
                />
                <Tooltip
                  formatter={(value) => fmtPct(Number(value))}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="share"
                  fill="#6366f1"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.countries.length > 0 && (
          <CountriesPie
            countries={data.countries}
            marketId={marketId}
            mnn={mnn}
            expandedCountry={expandedCountry}
            onToggleCountry={(name) =>
              setExpandedCountry((prev) => (prev === name ? null : name))
            }
          />
        )}
      </div>
    </div>
  );
}

function CountriesPie({
  countries, marketId, mnn, expandedCountry, onToggleCountry,
}: {
  countries: Zone2Data["countries"];
  marketId: number;
  mnn: string;
  expandedCountry: string | null;
  onToggleCountry: (name: string) => void;
}) {
  const top = countries.slice(0, 8);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-4">
        Страны производства
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <CountryPieChart
          data={top}
          mode="usd"
          title="По продажам, USD"
        />
        <CountryPieChart
          data={top}
          mode="un"
          title="По продажам, UN"
        />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="w-6"></th>
              <th className="text-left py-2 px-3 font-medium">Страна</th>
              <th className="text-right py-2 px-3 font-medium">USD</th>
              <th className="text-right py-2 px-3 font-medium">Доля USD</th>
              <th className="text-right py-2 px-3 font-medium">Доля UN</th>
            </tr>
          </thead>
          <tbody>
            {countries.map((c, idx) => (
              <DrillDownRow
                key={c.name}
                expanded={expandedCountry === c.name}
                onToggle={() => onToggleCountry(c.name)}
                colSpan={5}
                columns={
                  <>
                    <td className="py-2 px-3 font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded flex-shrink-0"
                          style={{
                            background: PIE_COLORS[idx % PIE_COLORS.length],
                          }}
                        />
                        <span className="truncate">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right">{fmtUsd(c.usd)}</td>
                    <td className="py-2 px-3 text-right text-slate-500">
                      {fmtPct(c.share)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-500">
                      {fmtPct(c.un_share ?? null)}
                    </td>
                  </>
                }
              >
                <CountryDetailsLoader
                  marketId={marketId}
                  name={c.name}
                  mnn={mnn}
                  scope="mnn"
                />
              </DrillDownRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CountryPieChart({
  data,
  mode,
  title,
}: {
  data: Zone2Data["countries"];
  mode: "usd" | "un";
  title: string;
}) {
  const dataKey = mode === "usd" ? "share" : "un_share";
  const valueKey = mode === "usd" ? "usd" : "un";
  const fmtAbsolute = mode === "usd" ? fmtUsd : fmtUn;

  return (
    <div>
      <p className="text-xs font-medium text-slate-500 text-center mb-1">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={36}
            outerRadius={72}
            dataKey={dataKey}
            nameKey="name"
            stroke="none"
            label={({ value }) => {
              const s = Number(value ?? 0);
              return s >= 0.05 ? `${(s * 100).toFixed(0)}%` : "";
            }}
            labelLine={false}
          >
            {data.map((_, idx) => (
              <Cell
                key={idx}
                fill={PIE_COLORS[idx % PIE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, props) => {
              const pct = fmtPct(Number(value));
              const raw = Number(
                (props.payload as Record<string, number>)?.[valueKey] ?? 0,
              );
              return [`${pct} (${fmtAbsolute(raw)})`, props.payload?.name];
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-2 space-y-1 max-h-32 overflow-auto">
        {data.map((c, idx) => {
          const cAny = c as unknown as Record<string, number | string>;
          const share = Number(cAny[dataKey] ?? 0);
          const raw = Number(cAny[valueKey] ?? 0);
          return (
            <li key={c.name} className="flex items-center gap-2 text-[11px]">
              <span
                className="inline-block w-2 h-2 rounded flex-shrink-0"
                style={{
                  background: PIE_COLORS[idx % PIE_COLORS.length],
                }}
              />
              <span className="flex-1 text-slate-700 truncate">
                {c.name}
              </span>
              <span className="text-slate-500 font-medium">
                {fmtPct(share)}
              </span>
              <span className="text-slate-400 w-12 text-right">
                {fmtAbsolute(raw)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConcentrationByForm({
  items,
}: {
  items: FormConcentration[];
}) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-700">
          Концентрация рынка по формам
        </h4>
        <span className="text-xs text-slate-400">
          расчёт по всему МНН, без учёта фильтров
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="text-left py-2 px-3 font-medium">Форма</th>
              <th className="text-right py-2 px-3 font-medium">USD</th>
              <th className="text-right py-2 px-3 font-medium">Доля МНН</th>
              <th className="text-right py-2 px-3 font-medium">HHI</th>
              <th className="text-right py-2 px-3 font-medium">Лидер</th>
              <th className="text-right py-2 px-3 font-medium">Топ-3</th>
              <th className="text-right py-2 px-3 font-medium">
                Активн. конк.
              </th>
              <th className="text-left py-2 px-3 font-medium">Уровень</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => {
              const c = concentrationLabel(f.hhi);
              return (
                <tr
                  key={f.name}
                  className="border-b border-slate-100 hover:bg-slate-50/50"
                >
                  <td className="py-2.5 px-3 font-medium text-slate-700">
                    {f.name}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {fmtUsd(f.usd_total)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-500">
                    {fmtPct(f.share)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {Math.round(f.hhi)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {fmtPct(f.leader_share)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {fmtPct(f.top3_share)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {f.active_competitors}
                    <span className="text-xs text-slate-400 ml-1">
                      / {f.producer_count}
                    </span>
                  </td>
                  <td className={clsx("py-2.5 px-3 font-medium", c.color)}>
                    {c.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const isUp = value > 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isUp ? "text-emerald-600" : "text-red-600",
      )}
    >
      {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {(value * 100).toFixed(1)}%
    </span>
  );
}

function ConcentrationCard({
  hhi, top3, leader, entropy,
}: {
  hhi: number | null;
  top3: number | null;
  leader: number | null;
  entropy: number | null;
}) {
  const c = concentrationLabel(hhi);
  const entropyLabel =
    entropy == null
      ? { text: "—", color: "text-slate-400" }
      : entropy >= 0.75
        ? { text: "Сбалансированный", color: "text-emerald-600" }
        : entropy >= 0.4
          ? { text: "Умеренный дисбаланс", color: "text-amber-600" }
          : { text: "Доминирование лидера", color: "text-red-600" };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-4">
        Концентрация
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">HHI</p>
          <p className="text-2xl font-bold text-slate-800">
            {hhi != null ? Math.round(hhi) : "—"}
          </p>
          <p className={clsx("text-[11px] font-semibold mt-0.5", c.color)}>
            {c.text}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Sigma size={11} /> Энтропия
          </p>
          <p className="text-2xl font-bold text-slate-800">
            {entropy != null ? entropy.toFixed(2) : "—"}
          </p>
          <p className={clsx("text-[11px] font-semibold mt-0.5", entropyLabel.color)}>
            {entropyLabel.text}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 text-sm">
        <div>
          <p className="text-xs text-slate-500">Лидер</p>
          <p className="font-semibold text-slate-700">{fmtPct(leader)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Топ-3</p>
          <p className="font-semibold text-slate-700">{fmtPct(top3)}</p>
        </div>
      </div>
    </div>
  );
}

function BgGCard({
  data, years,
}: {
  data: BgGBreakdown;
  years: number[];
}) {
  const yearLabels = years.length
    ? years.slice(-3).map((y) => (y ? String(y) : "—"))
    : ["Y1", "Y2", "Y3"];
  while (yearLabels.length < 3) yearLabels.unshift("—");
  const trendData = yearLabels.map((y, k) => ({
    year: y,
    bg_share: data.bg_share_by_year?.[k] ?? null,
    g_share:
      data.bg_share_by_year?.[k] != null
        ? 1 - (data.bg_share_by_year[k] as number)
        : null,
  }));
  const first = data.bg_share_by_year?.[0];
  const last = data.bg_share_by_year?.[2];
  const bgShareTrend =
    first != null && last != null ? last - first : null;
  const trendTone =
    bgShareTrend == null
      ? "text-slate-400"
      : bgShareTrend > 0.02
      ? "text-indigo-600"
      : bgShareTrend < -0.02
      ? "text-emerald-600"
      : "text-slate-500";
  const trendArrow =
    bgShareTrend == null
      ? "—"
      : bgShareTrend > 0
      ? "↑"
      : bgShareTrend < 0
      ? "↓"
      : "—";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Pill size={14} className="text-indigo-500" />
          Бренд vs Генерик
        </h4>
        {bgShareTrend != null && (
          <span
            className={clsx(
              "text-[11px] font-medium tabular-nums",
              trendTone,
            )}
            title={`Δ доли бренда за ${yearLabels[0]}→${yearLabels[2]}`}
          >
            {trendArrow} {(Math.abs(bgShareTrend) * 100).toFixed(1)}пп
          </span>
        )}
      </div>

      {/* Stacked share bar (Y3) */}
      <div className="h-3 w-full rounded-full overflow-hidden bg-slate-100 flex">
        <div
          className="h-full bg-indigo-500 flex items-center justify-center text-[10px] text-white font-semibold"
          style={{ width: `${data.bg_share * 100}%` }}
        >
          {data.bg_share >= 0.12 ? `${(data.bg_share * 100).toFixed(0)}%` : ""}
        </div>
        <div
          className="h-full bg-emerald-500 flex items-center justify-center text-[10px] text-white font-semibold"
          style={{ width: `${data.g_share * 100}%` }}
        >
          {data.g_share >= 0.12 ? `${(data.g_share * 100).toFixed(0)}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-[11px] mt-1.5">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-indigo-500" />
          Бренд {fmtPct(data.bg_share)}
        </span>
        <span className="flex items-center gap-1 text-slate-500">
          {yearLabels[2]}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-500" />
          Генерик {fmtPct(data.g_share)}
        </span>
      </div>

      {/* Sparkline: BG share Y1 → Y3 */}
      {data.bg_share_by_year?.some((v) => v != null) && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            Динамика доли бренда
          </p>
          <ResponsiveContainer width="100%" height={60}>
            <LineChart
              data={trendData}
              margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            >
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={[0, 1]} />
              <Tooltip
                formatter={(v) =>
                  v == null ? "—" : fmtPct(Number(v))
                }
                labelFormatter={(l) => `Год ${l}`}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                  padding: "4px 8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="bg_share"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={{ r: 3, fill: "#4f46e5" }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ASP bg vs g */}
      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
        <AspTile
          label="ASP Бренд"
          value={data.asp_bg}
          accent="bg-indigo-500"
        />
        <AspTile
          label="ASP Генерик"
          value={data.asp_g}
          accent="bg-emerald-500"
        />
      </div>
      {data.asp_gap_pct != null && (
        <p
          className={clsx(
            "text-[11px] mt-2",
            data.asp_gap_pct > 0 ? "text-indigo-700" : "text-slate-500",
          )}
        >
          Бренд дороже генерика на{" "}
          <span className="font-bold">
            {(data.asp_gap_pct * 100).toFixed(0)}%
          </span>
        </p>
      )}
    </div>
  );
}

function AspTile({
  label, value, accent,
}: {
  label: string;
  value: number | null;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden bg-slate-50 rounded-lg px-2.5 py-2 ring-1 ring-slate-200/60">
      <div className={clsx("absolute inset-y-0 left-0 w-1", accent)} />
      <p className="text-[10px] uppercase tracking-wider text-slate-500 pl-1.5">
        {label}
      </p>
      <p className="text-sm font-bold text-slate-800 pl-1.5 tabular-nums">
        {value != null ? `$${value.toFixed(2)}` : "—"}
      </p>
    </div>
  );
}

function BgGBadge({ flag }: { flag: BgGFlag | null }) {
  if (!flag) {
    return <span className="text-slate-300 text-xs">—</span>;
  }
  const style =
    flag === "BG"
      ? "bg-indigo-100 text-indigo-700 ring-indigo-200"
      : flag === "G"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  const label = flag === "MIXED" ? "M" : flag;
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider ring-1 ring-inset",
        style,
      )}
      title={
        flag === "BG"
          ? "Бренд-генерик (доминирует)"
          : flag === "G"
          ? "Генерик (доминирует)"
          : "Смешанный портфель (40-60% бренд)"
      }
    >
      {label}
    </span>
  );
}

function RegionalCard({
  data, className,
}: {
  data: RegionalDistribution;
  className?: string;
}) {
  const giniLabel =
    data.gini == null
      ? { text: "—", color: "text-slate-400" }
      : data.gini > 0.7
        ? { text: "Локализован", color: "text-red-600" }
        : data.gini > 0.4
          ? { text: "Умеренная неравномерность", color: "text-amber-600" }
          : { text: "Равномерно", color: "text-emerald-600" };
  const top8 = data.regions.slice(0, 8);

  return (
    <div className={clsx("bg-white rounded-xl border border-slate-200 shadow-sm p-5", className)}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <MapIcon size={14} className="text-indigo-500" />
          Региональное распределение
        </h4>
        <div className="text-xs text-slate-500">
          Gini:{" "}
          <span className="font-semibold text-slate-700">
            {data.gini != null ? data.gini.toFixed(2) : "—"}
          </span>{" "}
          <span className={clsx("font-semibold", giniLabel.color)}>
            · {giniLabel.text}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={top8} layout="vertical">
          <XAxis
            type="number"
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => fmtPct(v)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10 }}
            width={120}
            interval={0}
          />
          <Tooltip
            formatter={(value, _n, p) => {
              const raw = (p.payload as { usd?: number })?.usd ?? 0;
              return [`${fmtPct(Number(value))} (${fmtUsd(raw)})`, "Доля"];
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Bar dataKey="share" fill="#6366f1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {data.regions.length > 8 && (
        <p className="text-[11px] text-slate-400 text-right mt-1">
          + ещё {data.regions.length - 8} регионов
        </p>
      )}
    </div>
  );
}

function GrlsExtendedCard({
  extra, activeCount,
}: {
  extra: GrlsExtra;
  activeCount: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
        <FileCheck size={14} className="text-indigo-500" />
        ГРЛС — динамика и окна
      </h4>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <CalendarClock size={12} /> Возраст рынка
          </p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {extra.market_age != null ? `${extra.market_age}` : "—"}
            {extra.market_age != null && (
              <span className="text-base font-normal text-slate-500 ml-1">
                {extra.market_age === 1 ? "год" :
                 extra.market_age < 5 ? "года" : "лет"}
              </span>
            )}
          </p>
          {extra.oldest_reg_year && (
            <p className="text-[11px] text-slate-400 mt-1">
              первая РУ: {extra.oldest_reg_year}
            </p>
          )}
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
            <AlertTriangle size={12} /> Окно истечения
          </p>
          <ExpiryRow label="1 год" value={extra.expiring_1y} total={activeCount} color="bg-red-500" />
          <ExpiryRow label="2 года" value={extra.expiring_2y} total={activeCount} color="bg-amber-500" />
          <ExpiryRow label="3 года" value={extra.expiring_3y} total={activeCount} color="bg-emerald-500" />
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Регистрации по годам
          </p>
          {extra.registrations_by_year.length > 0 ? (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={extra.registrations_by_year}>
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} width={20} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="count" fill="#4f46e5" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-slate-400 mt-2">Нет данных</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpiryRow({
  label, value, total, color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="mt-2 first:mt-3">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-700">
          {value}
          <span className="text-slate-400 ml-0.5">/ {total}</span>
        </span>
      </div>
      <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full", color)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
