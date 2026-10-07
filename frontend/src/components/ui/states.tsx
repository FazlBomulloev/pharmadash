import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

export function Loading({
  className, label = "Загрузка…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      className={clsx(
        "flex items-center justify-center gap-2 text-sm text-faint",
        className,
      )}
    >
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  );
}

export function ErrorNote({
  children, className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={clsx("rounded-inner px-4 py-3 text-sm", className)}
      style={{
        background: "oklch(0.97 0.02 25)",
        color: "oklch(0.45 0.15 25)",
      }}
    >
      {children}
    </div>
  );
}

export function EmptyCard({
  title, description, children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="anim-rise flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-14 text-center">
      <span className="text-xl font-semibold tracking-[-0.01em]">{title}</span>
      {description && (
        <span className="max-w-md text-sm text-muted-2">{description}</span>
      )}
      {children}
    </div>
  );
}
