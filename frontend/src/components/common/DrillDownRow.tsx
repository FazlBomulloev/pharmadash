import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";

export interface DrillDownRowProps {
  expanded: boolean;
  onToggle: () => void;
  /** Rendered as-is inside the base row. Include your <td> cells (without the chevron cell). */
  columns: ReactNode;
  /** Content of the expansion panel. */
  children: ReactNode;
  /** Total number of <td> in the base row INCLUDING the chevron column added by this component. */
  colSpan: number;
  rowClassName?: string;
}

export default function DrillDownRow({
  expanded,
  onToggle,
  columns,
  children,
  colSpan,
  rowClassName,
}: DrillDownRowProps) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={clsx(
          "border-b border-slate-100 cursor-pointer transition-colors select-none",
          expanded
            ? "bg-indigo-50/70"
            : "hover:bg-slate-50/60",
          rowClassName,
        )}
      >
        <td className="py-2.5 pl-3 pr-1 w-6">
          <ChevronRight
            size={14}
            className={clsx(
              "transition-transform duration-200 ease-out",
              expanded ? "rotate-90 text-indigo-500" : "text-slate-400",
            )}
          />
        </td>
        {columns}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={colSpan} className="p-0">
            <div className="mx-2 my-2 relative overflow-hidden rounded-xl ring-1 ring-slate-200/70 shadow-inner bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
              {/* left accent gradient */}
              <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-indigo-400 via-indigo-500 to-violet-500" />
              {/* subtle top highlight */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200/60 to-transparent" />
              <div className="relative p-5 md:p-6">{children}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
