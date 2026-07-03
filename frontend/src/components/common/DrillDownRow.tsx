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
            ? "bg-indigo-50/60"
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
        <tr className="bg-slate-50/40">
          <td colSpan={colSpan} className="p-0">
            <div className="border-l-4 border-indigo-500 bg-slate-50/80 rounded-r-lg mx-2 my-2 p-4 md:p-5 transition-all duration-200 ease-out">
              {children}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
