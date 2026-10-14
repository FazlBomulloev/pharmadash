import type { DashboardResponse, DirectionShareRow } from "../../types/api";
import { fmtGrowth, fmtShare, fmtUsd } from "../../lib/format";
import { growthTone } from "../../lib/palette";
import { ProgressBar } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";

const BAR = "oklch(0.52 0.16 268)";
const BAR_DIM = "oklch(0.78 0.06 262)";

const ROW =
  "grid w-full max-w-[760px] grid-cols-[minmax(110px,1fr)_44px_minmax(70px,180px)_78px_56px_56px] items-center gap-2.5";

export function DirectionsTab({
  data, t,
}: {
  data: DashboardResponse;
  t: number;
}) {
  const block = data.directions;
  const single = data.applied_filter.lf;
  const forms = block.forms;
  const showTotal = !single && forms.length > 1
    && block.total.rows.length > 0;

  return (
    <Card className="flex flex-col gap-5">
      <CardTitle note="оценка по долям назначений · CAGR за 2 года">
        Кто выписывает
      </CardTitle>
      <span className="-mt-3.5 text-[13px] text-faint">
        Доза влияет на сумму, не на состав направлений
      </span>

      {showTotal && (
        <Section
          title={`${data.mnn} · все формы`}
          usd={block.total.usd}
          rows={block.total.rows}
          t={t}
          accent
        />
      )}

      {forms.map((f) => (
        <Section
          key={f.form}
          title={f.form}
          usd={f.usd}
          rows={f.rows}
          empty={!f.in_reference}
          t={t}
        />
      ))}

      {forms.length === 0 && (
        <span className="text-sm text-faint">
          Для выбранного фильтра нет данных
        </span>
      )}
    </Card>
  );
}

function Section({
  title, usd, rows, t, empty, accent,
}: {
  title: string;
  usd: number;
  rows: DirectionShareRow[];
  t: number;
  empty?: boolean;
  accent?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.share), 1e-9);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex w-full max-w-[760px] flex-wrap items-baseline justify-between gap-3 border-b border-[#ecece8] pb-1.5">
        <span className={accent ? "text-sm font-semibold" : "text-[13px] font-semibold"}>
          {title}
        </span>
        <span className="text-[13px] text-muted-2">{fmtUsd(usd)}</span>
      </div>

      {empty ? (
        <span className="py-1 text-[13px] text-faint">
          ⌀ Нет в справочнике направлений
        </span>
      ) : (
        <>
          <div className={`${ROW} pb-0.5 pt-1 text-[11px] text-faint`}>
            <span>Направление</span>
            <span className="text-right">доля</span>
            <span />
            <span className="text-right">USD</span>
            <span className="text-right">CAGR</span>
            <span className="text-right">г/г</span>
          </div>
          {rows.map((r) => {
            const rest = r.name === "Не распределено";
            return (
              <div
                key={r.name}
                className={`${ROW} py-[3px] text-[13px] ${rest ? "text-muted-2 italic" : ""}`}
              >
                <span className="truncate" title={r.name}>{r.name}</span>
                <span className="text-right font-medium">
                  {fmtShare(r.share)}
                </span>
                <ProgressBar
                  value={(r.share / max) * t}
                  color={rest ? BAR_DIM : BAR}
                  height={6}
                />
                <span className="text-right font-medium">{fmtUsd(r.usd)}</span>
                <span
                  className="text-right"
                  style={{ color: growthTone(r.cagr) }}
                >
                  {fmtGrowth(r.cagr)}
                </span>
                <span
                  className="text-right"
                  style={{ color: growthTone(r.growth) }}
                >
                  {fmtGrowth(r.growth)}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
