import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Zap,
  ShieldAlert,
  ClipboardList,
} from "lucide-react";
import clsx from "clsx";
import type { Zone3Data } from "../../types/api";
import ScopeChip from "../common/ScopeChip";

const FILL_COLOR: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

/**
 * Horizontal bullet chart 0-100 with recommendation-zone
 * tick marks at 35 / 55 / 75 (matches RECOMMENDATION_RANGES).
 */
function ScoreBullet({
  score, color,
}: {
  score: number;
  color: string;
}) {
  const clamped = Math.min(100, Math.max(0, score));
  const ticks = [35, 55, 75];

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-4xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          {score.toFixed(0)}
          <span className="text-lg font-normal text-slate-400 dark:text-slate-500 ml-1">
            / 100
          </span>
        </span>
      </div>
      <div className="relative h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        {/* zone dividers */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full w-px bg-white/80 dark:bg-slate-950/60"
            style={{ left: `${t}%` }}
            aria-hidden
          />
        ))}
        {/* fill */}
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-700 ease-out",
            FILL_COLOR[color] ?? "bg-slate-400",
          )}
          style={{ width: `${clamped}%` }}
        />
        {/* marker */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-slate-100 rounded-full ring-2 ring-slate-800 dark:ring-slate-200 shadow-md transition-all duration-700"
          style={{ left: `${clamped}%` }}
          aria-hidden
        />
      </div>
      <div className="relative mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
        {[0, 35, 55, 75, 100].map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2"
            style={{ left: `${t}%` }}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="relative mt-5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
        <span className="absolute left-[17%] -translate-x-1/2">Un</span>
        <span className="absolute left-[45%] -translate-x-1/2">Cond</span>
        <span className="absolute left-[65%] -translate-x-1/2">Attr</span>
        <span className="absolute left-[87%] -translate-x-1/2">High</span>
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  score,
  max,
  color,
}: {
  label: string;
  score: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
          {score.toFixed(1)} / {max}
        </span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const recLabels: Record<string, string> = {
  "Highly Attractive": "Очень привлекателен",
  Attractive: "Привлекателен",
  "Conditionally Attractive": "Условно привлекателен",
  Unattractive: "Непривлекателен",
};

const recIcons: Record<string, typeof CheckCircle2> = {
  green: CheckCircle2,
  yellow: AlertTriangle,
  orange: AlertTriangle,
  red: XCircle,
};

const recBgColors: Record<string, string> = {
  green: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  yellow: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
  orange: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900",
  red: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900",
};

const recTextColors: Record<string, string> = {
  green: "text-emerald-700 dark:text-emerald-300",
  yellow: "text-amber-700 dark:text-amber-300",
  orange: "text-orange-700 dark:text-orange-300",
  red: "text-red-700 dark:text-red-300",
};

export default function Zone3({ data }: { data: Zone3Data }) {
  const Icon = recIcons[data.recommendation_color] ?? AlertTriangle;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
        Оценка привлекательности
        <ScopeChip scope="mnn" />
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score bullet */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 pb-10 flex flex-col justify-between gap-4">
          <ScoreBullet
            score={data.total_score}
            color={data.recommendation_color}
          />
          <div
            className={clsx(
              "px-4 py-2 rounded-lg border flex items-center gap-2 self-start",
              recBgColors[data.recommendation_color] ?? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
            )}
          >
            <Icon
              size={18}
              className={
                recTextColors[data.recommendation_color] ?? "text-slate-600 dark:text-slate-300"
              }
            />
            <span
              className={clsx(
                "text-sm font-semibold",
                recTextColors[data.recommendation_color] ?? "text-slate-600 dark:text-slate-300",
              )}
            >
              {recLabels[data.recommendation] ?? data.recommendation}
            </span>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
            Декомпозиция оценки
          </h4>
          <div className="space-y-4">
            <ScoreBar
              label="Экономический"
              score={data.economic_score}
              max={50}
              color="bg-blue-500 dark:bg-blue-400"
            />
            <ScoreBar
              label="Структурный"
              score={data.structure_score}
              max={30}
              color="bg-purple-500 dark:bg-purple-400"
            />
            <ScoreBar
              label="Регуляторный"
              score={data.regulatory_score}
              max={15}
              color="bg-emerald-500 dark:bg-emerald-400"
            />
          </div>
        </div>

        {/* Drivers & Flags */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
          {data.drivers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-emerald-500 dark:text-emerald-400" />
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Драйверы
                </h4>
              </div>
              <ul className="space-y-1.5">
                {data.drivers.map((d, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5"
                  >
                    <ArrowRight
                      size={12}
                      className="text-emerald-400 dark:text-emerald-500 mt-0.5 flex-shrink-0"
                    />
                    {d.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.red_flags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert size={14} className="text-red-500 dark:text-red-400" />
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Красные флаги
                </h4>
              </div>
              <ul className="space-y-1.5">
                {data.red_flags.map((f, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5"
                  >
                    <AlertTriangle
                      size={12}
                      className="text-red-400 dark:text-red-500 mt-0.5 flex-shrink-0"
                    />
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.next_checks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList size={14} className="text-blue-500 dark:text-blue-400" />
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Следующие шаги
                </h4>
              </div>
              <ul className="space-y-1.5">
                {data.next_checks.map((c, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5"
                  >
                    <span className="text-blue-400 dark:text-blue-500 mt-0.5 flex-shrink-0">
                      {i + 1}.
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
