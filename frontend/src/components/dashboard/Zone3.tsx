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

function ScoreGauge({
  score,
  color,
}: {
  score: number;
  color: string;
}) {
  const circumference = 2 * Math.PI * 70;
  const filled = (score / 100) * circumference;
  const offset = circumference - filled;

  const colorMap: Record<string, string> = {
    green: "#10b981",
    yellow: "#f59e0b",
    orange: "#f97316",
    red: "#ef4444",
  };
  const strokeColor = colorMap[color] ?? "#6366f1";

  return (
    <div className="relative w-48 h-48 mx-auto">
      <svg
        className="w-full h-full -rotate-90"
        viewBox="0 0 160 160"
      >
        <circle
          cx="80"
          cy="80"
          r="70"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="10"
        />
        <circle
          cx="80"
          cy="80"
          r="70"
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-slate-800">
          {score.toFixed(0)}
        </span>
        <span className="text-sm text-slate-500">из 100</span>
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
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-700">
          {score.toFixed(1)} / {max}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
  green: "bg-emerald-50 border-emerald-200",
  yellow: "bg-amber-50 border-amber-200",
  orange: "bg-orange-50 border-orange-200",
  red: "bg-red-50 border-red-200",
};

const recTextColors: Record<string, string> = {
  green: "text-emerald-700",
  yellow: "text-amber-700",
  orange: "text-orange-700",
  red: "text-red-700",
};

export default function Zone3({ data }: { data: Zone3Data }) {
  const Icon = recIcons[data.recommendation_color] ?? AlertTriangle;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-800">
        Оценка привлекательности
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Gauge */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center">
          <ScoreGauge
            score={data.total_score}
            color={data.recommendation_color}
          />
          <div
            className={clsx(
              "mt-4 px-4 py-2 rounded-lg border flex items-center gap-2",
              recBgColors[data.recommendation_color] ?? "bg-slate-50 border-slate-200",
            )}
          >
            <Icon
              size={18}
              className={
                recTextColors[data.recommendation_color] ?? "text-slate-600"
              }
            />
            <span
              className={clsx(
                "text-sm font-semibold",
                recTextColors[data.recommendation_color] ?? "text-slate-600",
              )}
            >
              {recLabels[data.recommendation] ?? data.recommendation}
            </span>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">
            Декомпозиция оценки
          </h4>
          <div className="space-y-4">
            <ScoreBar
              label="Экономический"
              score={data.economic_score}
              max={50}
              color="bg-blue-500"
            />
            <ScoreBar
              label="Структурный"
              score={data.structure_score}
              max={30}
              color="bg-purple-500"
            />
            <ScoreBar
              label="Регуляторный"
              score={data.regulatory_score}
              max={20}
              color="bg-emerald-500"
            />
          </div>
        </div>

        {/* Drivers & Flags */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          {data.drivers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-emerald-500" />
                <h4 className="text-sm font-semibold text-slate-700">
                  Драйверы
                </h4>
              </div>
              <ul className="space-y-1.5">
                {data.drivers.map((d, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 flex items-start gap-1.5"
                  >
                    <ArrowRight
                      size={12}
                      className="text-emerald-400 mt-0.5 flex-shrink-0"
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
                <ShieldAlert size={14} className="text-red-500" />
                <h4 className="text-sm font-semibold text-slate-700">
                  Красные флаги
                </h4>
              </div>
              <ul className="space-y-1.5">
                {data.red_flags.map((f, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 flex items-start gap-1.5"
                  >
                    <AlertTriangle
                      size={12}
                      className="text-red-400 mt-0.5 flex-shrink-0"
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
                <ClipboardList size={14} className="text-blue-500" />
                <h4 className="text-sm font-semibold text-slate-700">
                  Следующие шаги
                </h4>
              </div>
              <ul className="space-y-1.5">
                {data.next_checks.map((c, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 flex items-start gap-1.5"
                  >
                    <span className="text-blue-400 mt-0.5 flex-shrink-0">
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
