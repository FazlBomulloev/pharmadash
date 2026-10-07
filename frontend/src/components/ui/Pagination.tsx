import clsx from "clsx";
import { fmtInt } from "../../lib/format";
import { Segmented } from "./Segmented";

/** Номера страниц: первая, текущая ±1, последняя и «…» между ними. */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const list = [...wanted]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/** Подвал таблицы с серверной пагинацией. */
export function Pagination({
  page, pageSize, total, sizes = [15, 30, 50], onPage, onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  sizes?: number[];
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="whitespace-nowrap text-[13px] text-muted-2">
          {fmtInt(from)}–{fmtInt(to)} из {fmtInt(total)}
        </span>
        <Segmented
          ariaLabel="Строк на странице"
          size="sm"
          value={pageSize}
          onChange={onPageSize}
          options={sizes.map((s) => ({ value: s, label: `По ${s}` }))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <NavButton disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Назад
        </NavButton>
        {pageWindow(page, pages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-[13px] text-faintest">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPage(p)}
              className={clsx(
                "tr-soft h-8 min-w-8 rounded-lg border-0 px-2 text-[13px]",
                p === page
                  ? "bg-ink font-bold text-white"
                  : "bg-transparent text-fg-2 hover:bg-[#f2f2ef]",
              )}
            >
              {p}
            </button>
          ),
        )}
        <NavButton disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Вперёд →
        </NavButton>
      </div>
    </div>
  );
}

function NavButton({
  disabled, onClick, children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "tr-soft h-8 whitespace-nowrap rounded-lg border-0 bg-[#f2f2ef] px-3 text-[13px] font-medium",
        disabled
          ? "cursor-default text-[#b5b8be]"
          : "text-fg-2 hover:bg-[#e8e8e4]",
      )}
    >
      {children}
    </button>
  );
}
