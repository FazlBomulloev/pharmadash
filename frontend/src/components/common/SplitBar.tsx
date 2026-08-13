import clsx from "clsx";

interface Segment {
  name: string;
  value: number;
  color: string;
}

interface Props {
  title?: string;
  segments: Segment[];
  totalHint?: string;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * Horizontal stacked bar for 2–3 categories that share a whole.
 * Replaces small pie/donut charts when angle-reading is worse than length.
 */
export default function SplitBar({ title, segments, totalHint }: Props) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const items = segments.map((seg) => ({
    ...seg,
    share: total > 0 ? seg.value / total : 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      {(title || totalHint) && (
        <div className="flex items-baseline justify-between mb-2">
          {title && (
            <h4 className="text-xs font-semibold text-slate-600">{title}</h4>
          )}
          {totalHint && (
            <span className="text-[11px] text-slate-400">{totalHint}</span>
          )}
        </div>
      )}
      <div
        className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100"
        role="img"
        aria-label={items
          .map((i) => `${i.name}: ${fmtPct(i.share)}`)
          .join(", ")}
      >
        {items.map((seg, i) => (
          <div
            key={seg.name}
            className={clsx(
              "h-full flex items-center justify-center text-[10px] font-semibold text-white",
              seg.color,
              i > 0 && "border-l-2 border-white",
            )}
            style={{ width: `${seg.share * 100}%` }}
            title={`${seg.name}: ${fmtPct(seg.share)}`}
          >
            {seg.share >= 0.12 ? `${Math.round(seg.share * 100)}%` : ""}
          </div>
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((seg) => (
          <li
            key={seg.name}
            className="flex items-center gap-2 text-[11px]"
          >
            <span
              className={clsx(
                "inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0",
                seg.color,
              )}
            />
            <span className="flex-1 text-slate-600 truncate">{seg.name}</span>
            <span className="font-semibold text-slate-700 tabular-nums">
              {fmtPct(seg.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
