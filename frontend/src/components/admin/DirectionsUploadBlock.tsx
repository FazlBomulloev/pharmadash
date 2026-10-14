import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { getDirectionsMeta, uploadDirectionsFile } from "../../api/client";
import type { DirectionUploadReport } from "../../types/api";
import { apiErrorText } from "../../lib/apiError";
import { fmtInt } from "../../lib/format";
import { Card, CardTitle } from "../ui/Card";
import { ErrorNote } from "../ui/states";

export function DirectionsUploadBlock() {
  const [report, setReport] = useState<DirectionUploadReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<string>("");

  useEffect(() => {
    getDirectionsMeta()
      .then((m) => setMeta(
        m.rows_count === 0
          ? "Справочник не загружен"
          : `Загружен ${
              m.uploaded_at
                ? new Date(m.uploaded_at).toLocaleDateString("ru-RU")
                : "—"
            } · ${fmtInt(m.rows_count)} строк · ${m.directions.length} направлений`,
      ))
      .catch(() => setMeta(""));
  }, [report]);

  async function pick(file: File) {
    setBusy(true);
    setError("");
    try {
      setReport(await uploadDirectionsFile(file));
    } catch (e) {
      setError(apiErrorText(e, "Не удалось загрузить справочник"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle note={meta}>Справочник направлений</CardTitle>
      <span className="text-[13px] text-muted-2">
        Файл .xlsx с листом «Длинный формат»: колонки МНН, ЛФ, Направление,
        Процент. Новая заливка полностью заменяет прежний справочник —
        он общий для всех рынков.
      </span>
      <label className="tr-soft flex h-10 w-fit cursor-pointer items-center gap-2 rounded-ctl bg-ink px-4 text-sm font-medium text-white hover:bg-ink-hover">
        <Upload size={15} />
        {busy ? "Загрузка…" : "Выбрать файл"}
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
      </label>

      {error && <ErrorNote>{error}</ErrorNote>}

      {report && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-ctl bg-canvas px-4 py-3 text-[13px]">
          <Stat label="Строк принято" value={fmtInt(report.rows_accepted)} />
          <Stat label="Направлений" value={fmtInt(report.directions_count)} />
          <Stat label="Пар МНН×ЛФ" value={fmtInt(report.pairs_count)} />
          <Stat label="Форм" value={fmtInt(report.forms_count)} />
          <Stat label="Отброшено строк" value={fmtInt(report.rows_skipped)} />
          <Stat label="Дубликатов" value={fmtInt(report.rows_duplicate)} />
          <Stat
            label="Пар с суммой ≠ 100%"
            value={fmtInt(report.pairs_incomplete)}
            warn={report.pairs_incomplete > 0}
          />
          <Stat
            label="Пар выше 100% (отброшено)"
            value={fmtInt(report.pairs_over_100)}
            warn={report.pairs_over_100 > 0}
          />
        </div>
      )}
    </Card>
  );
}

function Stat({
  label, value, warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-faint">{label}</span>
      <b className={warn ? "font-semibold text-[#b4541f]" : "font-semibold"}>
        {value}
        {warn ? " ⚠" : ""}
      </b>
    </span>
  );
}
