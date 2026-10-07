const NBSP = "\u00a0";
const MINUS = "−";

function fixed(v: number, digits: number): string {
  return v.toFixed(digits).replace(".", ",");
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function scaled(abs: number): string {
  if (abs >= 1e9) return `${fixed(abs / 1e9, 2)}${NBSP}млрд`;
  if (abs >= 1e6) {
    return `${fixed(abs / 1e6, abs >= 1e8 ? 0 : 1)}${NBSP}млн`;
  }
  if (abs >= 1e3) return `${fixed(abs / 1e3, 0)}${NBSP}тыс`;
  return fixed(abs, 0);
}

export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? MINUS : ""}$${scaled(Math.abs(v))}`;
}

export function fmtDeltaUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? MINUS : "+"}$${scaled(Math.abs(v))}`;
}

export function fmtUnits(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? MINUS : ""}${scaled(Math.abs(v))}`;
}

export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${fixed(v, v >= 100 ? 0 : 2)}`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${fixed(v * 100, digits)}%`;
}

export function fmtShare(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return fmtPct(v, Math.abs(v) < 0.1 ? 1 : 0);
}

export function fmtGrowth(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const pct = v * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? MINUS : "";
  const abs = Math.abs(pct);
  return `${sign}${fixed(abs, abs >= 1000 ? 0 : 1)}%`;
}

export function fmtScore(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return fixed(v, digits);
}

export function fmtRub(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${fmtInt(v)}${NBSP}₽`;
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s
    .split(/(\s+|-|\/)/)
    .map((w) =>
      /^[A-ZА-ЯЁ]{4,}$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w,
    )
    .join("");
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function yearsRange(years: number[]): string {
  if (years.length === 0) return "—";
  const sorted = [...years].sort((a, b) => a - b);
  return sorted.length === 1
    ? String(sorted[0])
    : `${sorted[0]}–${sorted[sorted.length - 1]}`;
}

export function fmtDayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}
