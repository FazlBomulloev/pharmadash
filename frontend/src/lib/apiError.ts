export function apiErrorText(e: unknown, fallback: string): string {
  const detail = (
    e as { response?: { data?: { detail?: unknown } } }
  )?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const text = detail
      .map((d: { msg?: string }) => (d.msg ?? "").replace(/^Value error, /, ""))
      .filter(Boolean)
      .join("; ");
    if (text) return text;
  }
  return fallback;
}
