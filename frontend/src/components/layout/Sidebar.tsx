import { NavLink, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  Table2,
  Upload,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

const navItems = [
  {
    label: "Рынки",
    icon: FlaskConical,
    to: "/",
    end: true,
  },
  {
    label: "Загрузка",
    icon: Upload,
    to: "/admin",
  },
];

function marketItems(marketId: string) {
  return [
    {
      label: "Дашборд",
      icon: LayoutDashboard,
      to: `/market/${marketId}/dashboard`,
    },
    {
      label: "АВП",
      icon: Table2,
      to: `/market/${marketId}/avp`,
    },
    {
      label: "КАП",
      icon: BarChart3,
      to: `/market/${marketId}/kap`,
    },
  ];
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { marketId } = useParams<{ marketId: string }>();

  return (
    <aside
      className={clsx(
        "flex flex-col bg-slate-900 text-slate-300 transition-all duration-300 border-r border-slate-800 relative",
        collapsed ? "w-[68px]" : "w-[240px]",
      )}
    >
      <div
        className={clsx(
          "flex items-center gap-3 px-5 h-16 border-b border-slate-800",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <FlaskConical size={18} className="text-white" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-white tracking-tight">
            PharmDash
          </span>
        )}
      </div>

      <nav className="flex-1 py-4 space-y-1 px-3">
        {!collapsed && (
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-3 mb-2">
            Навигация
          </p>
        )}
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                collapsed && "justify-center px-0",
              )
            }
          >
            <item.icon size={20} className="flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}

        {marketId && (
          <>
            <div className="my-4 border-t border-slate-800" />
            {!collapsed && (
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-3 mb-2">
                Рынок
              </p>
            )}
            {marketItems(marketId).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-indigo-600/20 text-indigo-400"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                    collapsed && "justify-center px-0",
                  )
                }
              >
                <item.icon size={20} className="flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-20 w-6 h-6 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-600 transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
