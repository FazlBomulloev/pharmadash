import { useId } from "react";
import { fmtGrowth } from "../../lib/format";

const W = 600;
const H = 200;
const TOP = 34;
const BOTTOM = 168;

/** Гладкая кривая через точки (монотонные кубические сегменты). */
function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mid = (x0 + x1) / 2;
    d += ` C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
  }
  return d;
}

/**
 * График в тёмном hero: продажи по годам, подсветка выбранного года,
 * под графиком — кнопки годов (клик = выбор года в фильтре).
 *
 * В БДП продажи хранятся по годам, поэтому точка — год.
 */
export function HeroTrend({
  years, values, selectedYear, onPick, format, t = 1,
}: {
  years: number[];
  values: number[];
  selectedYear: number | null;
  onPick: (year: number) => void;
  format: (v: number) => string;
  /** Прогресс прорисовки 0…1. */
  t?: number;
}) {
  const gradientId = useId();
  const clipId = useId();
  const n = years.length;
  if (n === 0) return null;

  const band = W / n;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const spread = max - min;
  const y = (v: number) =>
    spread > 0 ? BOTTOM - ((v - min) / spread) * (BOTTOM - TOP) : (TOP + BOTTOM) / 2;

  const centers = values.map(
    (v, i) => [band * (i + 0.5), y(v)] as [number, number],
  );
  // Линия дотягивается до краёв графика на уровне крайних точек.
  const points: [number, number][] = [
    [0, centers[0][1]], ...centers, [W, centers[n - 1][1]],
  ];
  const line = smoothPath(points);
  const area = `${line} L${W},${H} L0,${H} Z`;
  const selectedIdx = years.indexOf(selectedYear ?? years[n - 1]);

  return (
    <>
      <div className="relative min-h-[210px] flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="oklch(0.78 0.12 268)" stopOpacity="0.45" />
              <stop offset="1" stopColor="oklch(0.78 0.12 268)" stopOpacity="0" />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x="0" y="-20" width={W * t} height={H + 40} />
            </clipPath>
          </defs>
          {selectedIdx >= 0 && (
            <rect
              x={band * selectedIdx} y="0" width={band} height={H}
              fill="oklch(1 0 0 / 0.05)"
            />
          )}
          {years.slice(1).map((year, i) => (
            <line
              key={year}
              x1={band * (i + 1)} x2={band * (i + 1)} y1="0" y2={H}
              stroke="oklch(1 0 0 / 0.12)" strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={`url(#${gradientId})`} fillOpacity={t} />
          {/* Прорисовка слева направо — через обрезку: штриховой приём
              (pathLength + dasharray) ломается при растяжении SVG. */}
          <path
            d={line} fill="none" stroke="#fff" strokeWidth="2.5"
            strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            clipPath={`url(#${clipId})`}
          />
        </svg>
        {/* Точки годов — HTML, чтобы не растягивались вместе с SVG. */}
        {centers.map(([cx, cy], i) => (
          <span
            key={years[i]}
            className="absolute size-[9px] rounded-full border-2 border-white bg-ink"
            style={{
              left: `${(cx / W) * 100}%`,
              top: `${(cy / H) * 100}%`,
              translate: "-50% -50%",
              opacity: t,
              scale: i === selectedIdx ? "1.3" : "1",
            }}
          />
        ))}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {years.map((year, i) => {
          const growth =
            i > 0 && values[i - 1] > 0
              ? (values[i] - values[i - 1]) / values[i - 1]
              : null;
          const active = i === selectedIdx;
          return (
            <button
              key={year}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(year)}
              className="tr-soft flex flex-col items-center gap-0.5 rounded-ctl border-0 bg-transparent px-1 py-2 text-white hover:bg-[oklch(1_0_0/0.06)]"
              style={{ opacity: active ? 1 : 0.6 }}
            >
              <span className={active ? "text-[13px] font-bold" : "text-[13px] font-medium"}>
                {year}
              </span>
              <span className="whitespace-nowrap text-xs text-ink-fg-2">
                {format(values[i])}
                {growth != null && (
                  <span
                    className="ml-1 font-semibold"
                    style={{
                      color: growth < 0
                        ? "oklch(0.78 0.14 25)"
                        : "oklch(0.84 0.14 155)",
                    }}
                  >
                    {fmtGrowth(growth)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
