import { useState, type ReactNode } from "react";
import clsx from "clsx";
import type { BgGBreakdown, DashboardResponse } from "../../types/api";
import {
  fmtGrowth, fmtPct, fmtPrice, fmtShare, fmtUsd, plural, titleCase,
} from "../../lib/format";
import {
  NEG, POS, countryBar, countryMeta, heatIndigo,
} from "../../lib/palette";
import { ProgressBar } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";
import { CountryChip, GrowthChip, Pill } from "../ui/chips";
import { Segmented } from "../ui/Segmented";

const BRAND = "oklch(0.52 0.16 268)";
const GENERIC = "oklch(0.62 0.11 195)";
const HOSPITAL = "oklch(0.72 0.14 60)";
const FORM_HUES = [268, 195, 155, 45, 300, 20, 230, 100];
const REGIONS_COLLAPSED = 8;

export function StructureTab({
  data, t,
}: {
  data: DashboardResponse;
  t: number;
}) {
  const { zone2 } = data;
  const maxForm = Math.max(...zone2.forms.map((f) => f.share), 1e-9);
  const ret = zone2.ret_share ?? 0;
  const hos = zone2.hos_share ?? 0;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-6">
      <Card anim="tab" index={0} className="flex flex-col gap-[22px]">
        {zone2.bg_g_breakdown ? (
          <BrandGeneric bg={zone2.bg_g_breakdown} years={data.years} t={t} />
        ) : (
          <>
            <CardTitle>Бренд и генерик</CardTitle>
            <span className="text-sm text-faint">
              В БДП нет признака бренд/генерик для этого МНН
            </span>
          </>
        )}
      </Card>

      <div className="flex flex-col gap-6">
        <Card anim="tab" index={1} className="flex flex-col gap-3.5">
          <CardTitle>Секторы</CardTitle>
          <div className="flex flex-wrap gap-7">
            <SectorFigure color={BRAND} label="Розница (RET)" share={zone2.ret_share} />
            <SectorFigure color={HOSPITAL} label="Госпиталь (HOS)" share={zone2.hos_share} />
          </div>
          {ret + hos > 0 && (
            <div className="flex h-3 gap-[3px]">
              <div
                className="rounded-[6px_2px_2px_6px]"
                style={{ flex: `${ret} 1 0%`, background: BRAND }}
              />
              <div
                className="rounded-[2px_6px_6px_2px]"
                style={{ flex: `${hos} 1 0%`, background: HOSPITAL }}
              />
            </div>
          )}
        </Card>

        <Card anim="tab" index={2} className="flex flex-col gap-2">
          <CardTitle className="pb-1.5">Лекарственные формы</CardTitle>
          {zone2.forms.map((f, i) => {
            const color = `oklch(0.56 0.15 ${FORM_HUES[i % FORM_HUES.length]})`;
            return (
              <div
                key={f.name}
                className="grid grid-cols-[minmax(0,1fr)_90px_50px] items-center gap-3 py-2 text-sm"
              >
                <span className="flex min-w-0 flex-col gap-[7px]">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-[9px] shrink-0 rounded-[3px]"
                      style={{ background: color }}
                    />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <ProgressBar
                    value={(f.share / maxForm) * t}
                    color={color}
                    height={8}
                  />
                </span>
                <span className="whitespace-nowrap text-right font-semibold">
                  {fmtUsd(f.usd)}
                </span>
                <span className="text-right text-[13px] text-muted-2">
                  {fmtShare(f.share)}
                </span>
              </div>
            );
          })}
          {zone2.forms.length === 0 && (
            <span className="text-sm text-faint">Нет данных о формах</span>
          )}
        </Card>
      </div>
    </div>
  );
}

function BrandGeneric({
  bg, years, t,
}: {
  bg: BgGBreakdown;
  years: number[];
  t: number;
}) {
  const brand = bg.bg_share;
  const profile =
    brand >= 0.6
      ? "Преимущественно бренд · от 60%"
      : brand <= 0.4
        ? "Преимущественно генерик · до 40% бренд"
        : "Смешанный портфель · 40–60% бренд";

  const known = bg.bg_share_by_year
    .map((share, i) => ({ share, year: years[i] }))
    .filter((p): p is { share: number; year: number } =>
      p.share != null && !!p.year);
  const first = known[0];
  const last = known[known.length - 1];
  const shift = known.length > 1 ? (last.share - first.share) * 100 : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="whitespace-nowrap text-[17px] font-semibold tracking-[-0.01em]">
          Бренд и генерик
        </span>
        <Pill
          style={{
            background: "oklch(0.95 0.035 268)", color: "oklch(0.4 0.12 268)",
          }}
        >
          {profile}
        </Pill>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex h-11 gap-[3px] overflow-hidden rounded-xl">
          {brand > 0 && (
            <Segment flex={brand} background={BRAND} label="Бренд" share={brand} />
          )}
          {bg.g_share > 0 && (
            <Segment
              flex={bg.g_share} background={GENERIC} label="Генерик"
              share={bg.g_share} alignEnd
            />
          )}
        </div>
        {shift != null && (
          <span className="text-[13px] text-muted-2">
            Доля бренда за {first.year}→{last.year}:{" "}
            <b
              className="font-semibold"
              style={{ color: shift < 0 ? NEG : POS }}
            >
              {shift < 0 ? "−" : "+"}
              {Math.abs(shift).toFixed(0)} п.п.
            </b>
            {Math.abs(shift) >= 1 && (
              shift < 0
                ? " — генерики забирают рынок"
                : " — бренд укрепляет позиции"
            )}
          </span>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
        <Asp background="oklch(0.97 0.02 268)" dot={BRAND} label="ASP бренда">
          {fmtPrice(bg.asp_bg)}
        </Asp>
        <Asp background="oklch(0.97 0.02 195)" dot={GENERIC} label="ASP генерика">
          {fmtPrice(bg.asp_g)}
        </Asp>
        <Asp
          background="#f6f6f3"
          label={
            bg.asp_gap_pct != null && bg.asp_gap_pct < 0
              ? "Бренд дешевле на"
              : "Бренд дороже на"
          }
        >
          {bg.asp_gap_pct == null
            ? "—"
            : fmtGrowth(Math.abs(bg.asp_gap_pct)).replace("+", "")}
        </Asp>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] text-muted-2">Доля бренда по годам</span>
        <div className="flex h-[110px] items-end gap-4">
          {bg.bg_share_by_year.map((share, i) => (
            <div
              key={i}
              className="flex h-full flex-1 flex-col justify-end gap-1.5"
            >
              <span className="text-sm font-semibold">{fmtPct(share)}</span>
              <div
                style={{
                  height: Math.max(2, (share ?? 0) * 60 * t),
                  background: i === bg.bg_share_by_year.length - 1
                    ? BRAND
                    : "oklch(0.86 0.05 268)",
                  borderRadius: "8px 8px 3px 3px",
                }}
              />
              <span className="text-xs text-faint">{years[i] || "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Segment({
  flex, background, label, share, alignEnd = false,
}: {
  flex: number;
  background: string;
  label: string;
  share: number;
  alignEnd?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex min-w-0 flex-col justify-center overflow-hidden px-3.5 text-white",
        alignEnd && "items-end",
      )}
      style={{ flex: `${flex} 1 0%`, background }}
    >
      <span className="text-base font-bold leading-tight">{fmtPct(share)}</span>
      <span className="text-[11px] opacity-85">{label}</span>
    </div>
  );
}

function Asp({
  background, dot, label, children,
}: {
  background: string;
  dot?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-3.5 py-3"
      style={{ background }}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted">
        {dot && (
          <span className="size-2 rounded-[2px]" style={{ background: dot }} />
        )}
        {label}
      </span>
      <span className="text-[22px] font-semibold">{children}</span>
    </div>
  );
}

function SectorFigure({
  color, label, share,
}: {
  color: string;
  label: string;
  share: number | null;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-2">
        <span className="size-2 rounded-[2px]" style={{ background: color }} />
        {label}
      </span>
      <span className="text-[28px] font-semibold tracking-[-0.02em]">
        {fmtPct(share)}
      </span>
    </span>
  );
}

type GeoMode = "usd" | "un";

const GEO_GRID =
  "grid gap-2.5 grid-cols-[30px_minmax(0,1fr)_84px_56px_56px_60px]";

function giniLevel(gini: number | null) {
  if (gini == null) return null;
  if (gini < 0.3) {
    return {
      label: "Равномерное распределение",
      background: "oklch(0.94 0.05 155)", color: "oklch(0.38 0.11 155)",
    };
  }
  if (gini < 0.5) {
    return {
      label: "Умеренная неравномерность",
      background: "oklch(0.95 0.06 85)", color: "oklch(0.42 0.1 70)",
    };
  }
  return {
    label: "Сильная неравномерность",
    background: "oklch(0.95 0.035 25)", color: "oklch(0.45 0.14 25)",
  };
}

export function GeographyTab({
  data, selectedCountry, onCountry, t,
}: {
  data: DashboardResponse;
  selectedCountry: string | null;
  onCountry: (country: string) => void;
  t: number;
}) {
  const [mode, setMode] = useState<GeoMode>("usd");
  const [allRegions, setAllRegions] = useState(false);
  const { zone2 } = data;

  const mainShare = (c: (typeof zone2.countries)[number]) =>
    (mode === "usd" ? c.share : c.un_share) ?? 0;
  const otherShare = (c: (typeof zone2.countries)[number]) =>
    (mode === "usd" ? c.un_share : c.share) ?? 0;
  const maxShare = Math.max(...zone2.countries.map(mainShare), 1e-9);

  const regional = zone2.regional_distribution;
  const regions = regional?.regions ?? [];
  const shown = allRegions ? regions : regions.slice(0, REGIONS_COLLAPSED);
  const hidden = regions.length - REGIONS_COLLAPSED;
  const gini = giniLevel(regional?.gini ?? null);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-6">
      <Card anim="tab" index={0} className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-[17px] font-semibold tracking-[-0.01em]">
              Страны производства
            </span>
            <span className="text-xs text-faint">
              клик — детальный анализ в контексте МНН
            </span>
          </span>
          <Segmented
            size="sm"
            ariaLabel="Показатель доли"
            value={mode}
            onChange={setMode}
            options={[
              { value: "usd", label: "USD" },
              { value: "un", label: "Упаковки" },
            ]}
          />
        </div>
        <div className={`${GEO_GRID} border-b border-line pb-2 text-[11px] text-faint`}>
          <span />
          <span>Страна</span>
          <span className="text-right">USD</span>
          <span className="text-right">{mode === "usd" ? "Доля $" : "Доля уп."}</span>
          <span className="text-right">{mode === "usd" ? "Доля уп." : "Доля $"}</span>
          <span className="text-right">г/г</span>
        </div>
        {zone2.countries.map((c) => {
          const meta = countryMeta(c.name);
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => onCountry(c.name)}
              className={clsx(
                GEO_GRID,
                "tr-soft -mx-2 items-center rounded-ctl border-0 px-2 py-[9px] text-left text-sm text-fg hover:bg-[#f4f5fa]",
                selectedCountry === c.name ? "bg-accent-tint" : "bg-transparent",
              )}
            >
              <CountryChip country={c.name} className="px-0!" />
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="truncate">{titleCase(c.name)}</span>
                <ProgressBar
                  value={(mainShare(c) / maxShare) * t}
                  color={countryBar(meta.hue)}
                />
              </span>
              <span className="whitespace-nowrap text-right font-semibold">
                {fmtUsd(c.usd)}
              </span>
              <span className="text-right text-[13px] font-semibold">
                {fmtShare(mainShare(c))}
              </span>
              <span className="text-right text-[13px] text-muted-2">
                {fmtShare(otherShare(c))}
              </span>
              <GrowthChip
                value={c.growth}
                size="table"
                className="justify-self-end px-1.5!"
              />
            </button>
          );
        })}
      </Card>

      <Card anim="tab" index={1} className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-[17px] font-semibold tracking-[-0.01em]">
              Регионы
            </span>
            <span className="text-xs text-faint">
              доля продаж МНН · чем темнее, тем больше
            </span>
          </span>
          {gini && (
            <Pill style={{ background: gini.background, color: gini.color }}>
              {gini.label}
            </Pill>
          )}
        </div>
        {regions.length === 0 ? (
          <span className="text-sm text-faint">
            Продажи сосредоточены в одном регионе или регионы не указаны
          </span>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-1.5">
            {shown.map((r) => (
              <div
                key={r.name}
                title={`${titleCase(r.name)} · ${fmtUsd(r.usd)}`}
                className="flex min-h-[76px] flex-col justify-between gap-2 rounded-xl px-3 py-2.5"
                style={heatIndigo(r.share * 100, 24)}
              >
                <span className="line-clamp-2 text-xs leading-tight">
                  {titleCase(r.name)}
                </span>
                <span className="flex items-baseline justify-between gap-1.5">
                  <span className="text-lg font-bold">{fmtShare(r.share)}</span>
                  <span className="whitespace-nowrap text-[11px] opacity-80">
                    {fmtUsd(r.usd)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setAllRegions((v) => !v)}
            className="self-start border-0 bg-transparent px-0 pb-0 pt-1 text-[13px] font-medium text-accent hover:text-accent-hover"
          >
            {allRegions
              ? "Свернуть"
              : `+ ещё ${hidden} ${plural(hidden, "регион", "региона", "регионов")}`}
          </button>
        )}
      </Card>
    </div>
  );
}
