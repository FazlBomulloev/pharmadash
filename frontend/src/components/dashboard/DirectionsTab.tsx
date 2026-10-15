import { useMemo, useState } from "react";
import type {
  DashboardResponse, DirectionShareRow, MnnDirectionsForm,
} from "../../types/api";
import { fmtGrowth, fmtShare, fmtUsd } from "../../lib/format";
import {
  DIRECTION_COLORS, DIRECTION_OTHER_COLOR, DIRECTION_REST_COLOR, growthTone,
} from "../../lib/palette";
import { Donut } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";

const UNALLOCATED = "Не распределено";
const OTHER = "Прочие направления";
// Больше шести сегментов в кольце перестают читаться, поэтому хвост
// сворачивается. Столько же тонов в наборе.
const MAX_SLICES = DIRECTION_COLORS.length;

type ColorMap = Map<string, string>;

/**
 * Цвет закреплён за направлением на весь МНН, а не за местом в конкретной
 * форме: иначе «Дерматология» меняла бы цвет от кольца к кольцу и формы
 * нельзя было бы сравнивать глазами.
 */
function buildColors(rows: DirectionShareRow[]): ColorMap {
  const map: ColorMap = new Map([
    [UNALLOCATED, DIRECTION_REST_COLOR],
    [OTHER, DIRECTION_OTHER_COLOR],
  ]);
  let i = 0;
  for (const r of rows) {
    if (map.has(r.name)) continue;
    map.set(
      r.name,
      i < MAX_SLICES ? DIRECTION_COLORS[i] : DIRECTION_OTHER_COLOR,
    );
    i += 1;
  }
  return map;
}

/** Хвост за пределами шести тонов сворачивается в одну долю. */
function foldTail(rows: DirectionShareRow[]): DirectionShareRow[] {
  const named = rows.filter((r) => r.name !== UNALLOCATED);
  const rest = rows.filter((r) => r.name === UNALLOCATED);
  if (named.length <= MAX_SLICES) return [...named, ...rest];

  const head = named.slice(0, MAX_SLICES);
  const tail = named.slice(MAX_SLICES);
  return [
    ...head,
    {
      name: OTHER,
      usd: tail.reduce((a, r) => a + r.usd, 0),
      share: tail.reduce((a, r) => a + r.share, 0),
      growth: null,
      cagr: null,
    },
    ...rest,
  ];
}

export function DirectionsTab({ data }: { data: DashboardResponse }) {
  const block = data.directions;
  const colors = useMemo(
    () => buildColors(block.total.rows), [block.total.rows],
  );

  if (block.forms.length === 0) {
    return (
      <Card className="flex flex-col gap-2">
        <CardTitle>Кто выписывает</CardTitle>
        <span className="text-sm text-faint">
          Для выбранного фильтра нет данных
        </span>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">
          Кто выписывает
        </h2>
        <span className="text-xs text-faint">
          оценка по долям назначений · доза влияет на сумму, не на состав ·
          CAGR за 2 года
        </span>
      </div>

      <div className="flex flex-wrap gap-5">
        {block.forms.map((f) => (
          <FormDonut key={f.form} form={f} colors={colors} />
        ))}
      </div>
    </div>
  );
}

function FormDonut({
  form, colors,
}: {
  form: MnnDirectionsForm;
  colors: ColorMap;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const rows = useMemo(() => foldTail(form.rows), [form.rows]);
  const slices = rows.filter((r) => r.share > 0);

  return (
    <Card className="flex max-w-[520px] flex-[1_1_330px] flex-col gap-3 px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold tracking-wide">{form.form}</span>
        <span className="text-[13px] font-medium tabular-nums">
          {fmtUsd(form.usd)}
        </span>
      </div>

      {!form.in_reference ? (
        <span className="py-6 text-center text-[13px] text-faint">
          ⌀ Нет в справочнике направлений
        </span>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Donut
              slices={slices.map((r) => ({
                key: r.name,
                value: r.share,
                color: colors.get(r.name) ?? DIRECTION_OTHER_COLOR,
                label: `${r.name} · ${fmtShare(r.share)} · ${fmtUsd(r.usd)}`,
              }))}
              hovered={hovered}
              onHover={setHovered}
              center={
                <>
                  <span
                    className="text-[13px] font-semibold tabular-nums"
                    style={{ color: growthTone(form.cagr) }}
                  >
                    {fmtGrowth(form.cagr)}
                  </span>
                  <span className="text-[10px] text-faint">CAGR</span>
                </>
              }
            />

            <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1.5 p-0">
              {rows.map((r) => {
                const muted = r.name === UNALLOCATED || r.name === OTHER;
                return (
                  <li
                    key={r.name}
                    onMouseEnter={() => setHovered(r.name)}
                    onMouseLeave={() => setHovered(null)}
                    className="grid grid-cols-[8px_minmax(0,1fr)_42px] items-center gap-2 text-[13px]"
                    style={{
                      opacity: hovered && hovered !== r.name ? 0.45 : 1,
                      transition: "opacity .15s",
                    }}
                  >
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{
                        background: colors.get(r.name) ?? DIRECTION_OTHER_COLOR,
                      }}
                    />
                    <span
                      className={`truncate ${muted ? "text-muted-2 italic" : ""}`}
                      title={`${r.name} · ${fmtUsd(r.usd)}`}
                    >
                      {r.name}
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {fmtShare(r.share)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-baseline justify-between border-t border-[#f3f3f0] pt-2 text-[12px] text-muted-2">
            <span>
              г/г{" "}
              <b
                className="font-semibold tabular-nums"
                style={{ color: growthTone(form.growth) }}
              >
                {fmtGrowth(form.growth)}
              </b>
            </span>
            <span className="tabular-nums">
              {rows.filter((r) => r.name !== UNALLOCATED && r.name !== OTHER)
                .length}{" "}
              направл.
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
