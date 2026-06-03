import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
} from "lucide-react";
import clsx from "clsx";
import LoadingSpinner from "../common/LoadingSpinner";

interface Props<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  total: number;
  offset: number;
  limit: number;
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onPageChange: (offset: number) => void;
  onSortChange: (id: string, dir: "asc" | "desc") => void;
  sorting: SortingState;
  exportUrl?: string;
  title?: string;
}

export default function DataTable<T>({
  data,
  columns,
  total,
  offset,
  limit,
  loading,
  search,
  onSearchChange,
  onPageChange,
  onSortChange,
  sorting,
  exportUrl,
  title,
}: Props<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    state: { sorting },
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      if (next.length > 0) {
        onSortChange(
          next[0].id,
          next[0].desc ? "desc" : "asc",
        );
      }
    },
  });

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {title && (
          <h2 className="text-lg font-semibold text-slate-800">
            {title}
          </h2>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск МНН..."
              className="pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all w-64"
            />
          </div>
          {exportUrl && (
            <a
              href={exportUrl}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Download size={16} />
              XLSX
            </a>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={clsx(
                        "px-4 py-3 text-left font-semibold text-slate-600 bg-slate-50/80 whitespace-nowrap",
                        header.column.getCanSort() &&
                          "cursor-pointer select-none hover:text-indigo-600",
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1.5">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getCanSort() && (
                          <span className="text-slate-400">
                            {header.column.getIsSorted() === "asc" ? (
                              <ChevronUp size={14} />
                            ) : header.column.getIsSorted() ===
                              "desc" ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronsUpDown size={14} />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-16"
                  >
                    <LoadingSpinner />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-16 text-center text-slate-400"
                  >
                    Нет данных
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3 text-slate-700 whitespace-nowrap"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
          <p className="text-sm text-slate-500">
            Показано {offset + 1}–{Math.min(offset + limit, total)} из{" "}
            {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(offset - limit)}
              className="p-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-slate-600 min-w-[80px] text-center">
              {page} / {totalPages || 1}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(offset + limit)}
              className="p-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
