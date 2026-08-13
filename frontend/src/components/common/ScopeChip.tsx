import clsx from "clsx";

type Scope = "market" | "mnn";

const STYLES: Record<Scope, { bg: string; label: string; title: string }> = {
  market: {
    bg: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700",
    label: "РЫНОК",
    title: "Метрика рассчитана по всему рынку",
  },
  mnn: {
    bg: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-indigo-200 dark:ring-indigo-900",
    label: "МНН",
    title: "Метрика рассчитана в разрезе выбранного МНН",
  },
};

export default function ScopeChip({ scope }: { scope: Scope }) {
  const s = STYLES[scope];
  return (
    <span
      title={s.title}
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.08em] uppercase rounded ring-1 ring-inset",
        s.bg,
      )}
    >
      {s.label}
    </span>
  );
}
