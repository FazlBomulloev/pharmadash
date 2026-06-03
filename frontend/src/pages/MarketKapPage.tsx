import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { getKap, exportKapUrl } from "../api/client";
import type { KapRow, TableResponse } from "../types/api";
import DataTable from "../components/tables/DataTable";
import { useDebounce } from "../hooks/useDebounce";
import { TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const s = (v * 100).toFixed(1);
  return v > 0 ? `+${s}%` : `${s}%`;
}

function GrowthCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const isUp = value > 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
        isUp
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700",
      )}
    >
      {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {fmtPct(value)}
    </span>
  );
}

export default function MarketKapPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const [data, setData] = useState<TableResponse<KapRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedSearch = useDebounce(search, 300);
  const limit = 50;

  const fetchData = useCallback(async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const res = await getKap(parseInt(marketId), {
        offset,
        limit,
        search: debouncedSearch || undefined,
        sort_by: sorting[0]?.id,
        sort_dir: sorting[0]?.desc ? "desc" : "asc",
      });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [marketId, offset, limit, debouncedSearch, sorting]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch]);

  const columns: ColumnDef<KapRow, unknown>[] = [
    { accessorKey: "mnn", header: "МНН", enableSorting: true },
    { accessorKey: "lf_avp", header: "ЛФ", enableSorting: true },
    {
      accessorKey: "competitors_count",
      header: "Конкуренты",
      enableSorting: true,
    },
    {
      accessorKey: "main_competitor_total",
      header: "Осн. конкурент",
      enableSorting: false,
    },
    {
      accessorKey: "usd_hos_y3",
      header: `USD HOS ${data?.years?.[2] ?? "Y3"}`,
      cell: ({ getValue }) => fmtNum(getValue() as number),
      enableSorting: true,
    },
    {
      accessorKey: "usd_ret_y3",
      header: `USD RET ${data?.years?.[2] ?? "Y3"}`,
      cell: ({ getValue }) => fmtNum(getValue() as number),
      enableSorting: true,
    },
    {
      accessorKey: "usd_growth",
      header: "USD рост",
      cell: ({ getValue }) => (
        <GrowthCell value={getValue() as number | null} />
      ),
      enableSorting: true,
    },
    {
      accessorKey: "un_growth",
      header: "UN рост",
      cell: ({ getValue }) => (
        <GrowthCell value={getValue() as number | null} />
      ),
      enableSorting: true,
    },
    {
      accessorKey: "bg_count",
      header: "БГ",
      enableSorting: true,
    },
    {
      accessorKey: "g_count",
      header: "Г",
      enableSorting: true,
    },
    {
      accessorKey: "bg_share",
      header: "Доля БГ",
      cell: ({ getValue }) => fmtPct(getValue() as number | null),
      enableSorting: true,
    },
  ];

  return (
    <DataTable
      title="Конкурентный анализ продукта (КАП)"
      data={data?.rows ?? []}
      columns={columns}
      total={data?.total ?? 0}
      offset={offset}
      limit={limit}
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      onPageChange={setOffset}
      onSortChange={(id, dir) =>
        setSorting([{ id, desc: dir === "desc" }])
      }
      sorting={sorting}
      exportUrl={marketId ? exportKapUrl(parseInt(marketId)) : undefined}
    />
  );
}
