import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from "recharts";
import { Target, ShieldOff } from "lucide-react";
import clsx from "clsx";
import type {
  OverviewDecision as DecisionData,
  OverviewDecisionItem,
} from "../../types/api";
import ScopeChip from "../common/ScopeChip";

const COLOR_MAP: Record<string, string> = {
  green: "#10b981",
  yellow: "#fbbf24",
  orange: "#f97316",
  red: "#ef4444",
};

const COLOR_LABEL: Record<string, string> = {
  green: "Highly Attractive",
  yellow: "Attractive",
  orange: "Conditional",
  red: "Unattractive",
};

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function OverviewDecision({
  data, marketId,
}: {
  data: DecisionData;
  marketId: number;
}) {
  const navigate = useNavigate();
  const pieData = Object.entries(data.distribution).map(([color, count]) => ({
    name: COLOR_LABEL[color] ?? color,
    value: count,
    color: COLOR_MAP[color] ?? "#94a3b8",
  }));
  const total = pieData.reduce((s, x) => s + x.value, 0);

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        Сводка Decision Engine
        <ScopeChip scope="market" />
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">
            Распределение МНН ({total})
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                dataKey="value"
                nameKey="name"
                stroke="none"
              >
                {pieData.map((d, idx) => (
                  <Cell key={idx} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded"
                    style={{ background: d.color }}
                  />
                  {d.name}
                </span>
                <span className="font-semibold text-slate-700">
                  {d.value}
                  <span className="text-slate-400 ml-1">
                    ({total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <DecisionList
          title="Топ возможности"
          icon={Target}
          items={data.top_opportunities}
          marketId={marketId}
          onClickItem={(mnn) =>
            navigate(
              `/market/${marketId}/dashboard?mnn=${encodeURIComponent(mnn)}`,
            )
          }
          iconColor="text-emerald-600 bg-emerald-50"
        />

        <DecisionList
          title="Избегать"
          icon={ShieldOff}
          items={data.top_avoid}
          marketId={marketId}
          onClickItem={(mnn) =>
            navigate(
              `/market/${marketId}/dashboard?mnn=${encodeURIComponent(mnn)}`,
            )
          }
          iconColor="text-red-600 bg-red-50"
        />
      </div>
    </section>
  );
}

function DecisionList({
  title, icon: Icon, items, onClickItem, iconColor,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: OverviewDecisionItem[];
  marketId: number;
  onClickItem: (mnn: string) => void;
  iconColor: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <span
          className={clsx(
            "inline-flex items-center justify-center w-6 h-6 rounded",
            iconColor,
          )}
        >
          <Icon size={14} />
        </span>
        {title}
      </h4>
      <div className="space-y-1.5">
        {items.map((item) => (
          <button
            key={item.mnn}
            onClick={() => onClickItem(item.mnn)}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors group"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: COLOR_MAP[item.color] ?? "#94a3b8" }}
            />
            <span className="flex-1 truncate text-sm text-slate-700 group-hover:text-indigo-600">
              {item.mnn}
            </span>
            <span className="text-xs font-semibold text-slate-600">
              {item.total_score.toFixed(0)}
            </span>
            <span className="text-[11px] text-slate-400 w-14 text-right">
              {fmtUsd(item.usd)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
