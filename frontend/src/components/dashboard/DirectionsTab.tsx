import type { DashboardResponse, DirectionShareRow } from "../../types/api";
import { fmtShare, fmtUsd } from "../../lib/format";
import { ProgressBar } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";

const BAR = "oklch(0.52 0.16 268)";

export function DirectionsTab({
  data, t,
}: {
  data: DashboardResponse;
  t: number;
}) {
  const block = data.directions;
  const single = data.applied_filter.lf;
  const forms = block.forms;

  return (
    <Card className="flex flex-col gap-6">
      <CardTitle note="оценка по долям назначений">Кто выписывает</CardTitle>
      <span className="-mt-4 text-[13px] text-faint">
        Доза влияет на сумму, не на состав направлений
      </span>

      {!single && forms.length > 1 && block.total.rows.length > 0 && (
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
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#ecece8] pb-2">
        <span
          className={accent ? "text-[15px] font-semibold" : "text-sm font-semibold"}
        >
          {title}
        </span>
        <span className="text-[13px] text-muted-2">{fmtUsd(usd)}</span>
      </div>

      {empty ? (
        <span className="text-[13px] text-faint">
          ⌀ Нет в справочнике направлений
        </span>
      ) : (
        rows.map((r) => (
          <div
            key={r.name}
            className="grid grid-cols-[minmax(0,180px)_52px_minmax(0,1fr)_92px] items-center gap-3 py-0.5 text-sm"
          >
            <span className="truncate" title={r.name}>{r.name}</span>
            <span className="text-right text-[13px] font-medium">
              {fmtShare(r.share)}
            </span>
            <ProgressBar
              value={(r.share / max) * t}
              color={BAR}
              height={8}
            />
            <span className="text-right text-[13px] font-medium">
              {fmtUsd(r.usd)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
