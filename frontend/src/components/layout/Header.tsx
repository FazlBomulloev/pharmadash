import { useLocation } from "react-router-dom";

const titles: Record<string, string> = {
  "/": "Рынки",
  "/admin": "Загрузка данных",
};

function resolveTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname];
  if (pathname.includes("/dashboard")) return "Дашборд МНН";
  if (pathname.includes("/avp")) return "Таблица АВП";
  if (pathname.includes("/kap")) return "Таблица КАП";
  return "PharmDash";
}

export default function Header() {
  const { pathname } = useLocation();
  const title = resolveTitle(pathname);

  return (
    <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-sm flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full font-medium">
          v1.0
        </span>
      </div>
    </header>
  );
}
