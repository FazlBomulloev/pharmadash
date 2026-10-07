import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Upload } from "lucide-react";
import clsx from "clsx";
import {
  applyMapping, createMarket, getColumns, getMarket, getMarketOverview,
  getMarkets, getSheetPreview, uploadFile,
} from "../api/client";
import type {
  ColumnsResponse, MappingResult, Market, UploadResponse,
} from "../types/api";
import { useFetch } from "../hooks/useFetch";
import { autoMap, bdpFields } from "../lib/bdpFields";
import { fmtInt, fmtUsd, plural, yearsRange } from "../lib/format";
import { Page } from "../components/layout/Layout";
import { Card, PageHeader } from "../components/ui/Card";
import { Segmented } from "../components/ui/Segmented";
import { apiErrorText } from "../lib/apiError";

const STEPS = ["Рынок", "Файл", "Лист", "Маппинг", "Готово"];
const PREVIEW_COLUMNS = 8;

const PRIMARY =
  "tr-soft rounded-ctl border-0 bg-accent px-[18px] py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-default disabled:opacity-50";
const SECONDARY =
  "tr-soft rounded-ctl border-0 bg-[#f2f2ef] px-4 py-2.5 text-sm font-medium text-fg hover:bg-[#e8e8e4]";
const FIELD =
  "h-10 rounded-ctl border border-line-strong px-3 text-sm outline-none focus:border-accent";

type Kind = "new" | "existing";

interface DoneStats {
  mnn: number | null;
  producers: number | null;
  usd: number | null;
  year: number | null;
  priority: number | null;
}

function parseYears(text: string): number[] {
  return text
    .split(/[,\s;]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
}

function fileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

export default function AdminPage() {
  const [searchParams] = useSearchParams();
  const presetId = parseInt(searchParams.get("market") ?? "", 10);
  const markets = useFetch<Market[]>(() => getMarkets(), []);

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>(
    Number.isFinite(presetId) ? "existing" : "new",
  );
  const [name, setName] = useState("");
  const [yearsText, setYearsText] = useState("");
  const [language, setLanguage] = useState<"ru" | "en">("ru");
  const [existingId, setExistingId] = useState<number | null>(
    Number.isFinite(presetId) ? presetId : null,
  );
  const [market, setMarket] = useState<Market | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [sheet, setSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [columns, setColumns] = useState<ColumnsResponse | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<MappingResult | null>(null);
  const [stats, setStats] = useState<DoneStats | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fields = useMemo(() => bdpFields(market?.years ?? []), [market]);
  const missing = fields.filter((f) => f.required && !mappings[f.key]);

  const preview = useFetch(
    () => market && sheet && step === 2
      ? getSheetPreview(market.id, sheet)
      : Promise.resolve(null),
    [market?.id, sheet, step],
    "Не удалось прочитать лист",
  );

  async function attempt(fallback: string, action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(apiErrorText(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  function goTo(target: number) {
    setError("");
    setStep(target);
  }

  function restart() {
    setStep(0);
    setKind("new");
    setName("");
    setYearsText("");
    setExistingId(null);
    setMarket(null);
    setFile(null);
    setUpload(null);
    setSheet("");
    setHeaderRow(1);
    setColumns(null);
    setMappings({});
    setAuto(new Set());
    setResult(null);
    setStats(null);
    setError("");
    markets.reload();
  }

  async function submitMarket() {
    if (kind === "existing") {
      const chosen = markets.data?.find((m) => m.id === existingId);
      if (!chosen) {
        setError("Выберите рынок");
        return;
      }
      setMarket(chosen);
      goTo(1);
      return;
    }
    const years = parseYears(yearsText);
    if (!name.trim() || years.length < 2) {
      setError("Введите название и минимум 2 года");
      return;
    }
    if (market && market.name === name.trim()) {
      goTo(1);
      return;
    }
    await attempt("Не удалось создать рынок", async () => {
      setMarket(await createMarket({ name: name.trim(), years, language }));
      setStep(1);
    });
  }

  async function submitFile() {
    if (!market || !file) return;
    await attempt("Ошибка загрузки файла", async () => {
      const data = await uploadFile(market.id, file);
      setUpload(data);
      setSheet(data.sheets[0] ?? "");
      setHeaderRow(1);
      setStep(2);
    });
  }

  async function submitSheet() {
    if (!market) return;
    await attempt("Ошибка чтения колонок", async () => {
      const data = await getColumns(market.id, sheet, headerRow);
      const guessed = autoMap(data.columns, market.years);
      setColumns(data);
      setMappings(guessed);
      setAuto(new Set(Object.keys(guessed)));
      setStep(3);
    });
  }

  async function submitMapping() {
    if (!market || missing.length > 0) return;
    await attempt("Ошибка маппинга или обработки файла", async () => {
      const res = await applyMapping(market.id, {
        sheet_name: sheet,
        header_row: headerRow,
        mappings: Object.entries(mappings)
          .filter(([, column]) => column)
          .map(([system_field, file_column]) => ({ system_field, file_column })),
      });
      setResult(res);
      const [card, overview] = await Promise.all([
        getMarket(market.id).catch(() => null),
        getMarketOverview(market.id).catch(() => null),
      ]);
      setStats({
        mnn: card?.mnn_count ?? null,
        producers: overview?.header.producer_count ?? null,
        usd: card?.usd_last ?? null,
        year: market.years[market.years.length - 1] ?? null,
        priority: card?.categories?.priority ?? null,
      });
      setStep(4);
    });
  }

  function setMapping(field: string, column: string) {
    setMappings((prev) => ({ ...prev, [field]: column }));
    setAuto((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  const sheetColumns = upload?.columns[sheet]?.length ?? 0;
  const done: { title: string; summary: string }[] = [
    {
      title: "Рынок",
      summary: market
        ? `${market.name} · ${yearsRange(market.years)}`
        : "",
    },
    {
      title: "Файл",
      summary: file
        ? `${file.name} · ${fileSize(file.size)}`
        : "",
    },
    { title: "Лист", summary: `${sheet} · строка заголовков ${headerRow}` },
    {
      title: "Маппинг",
      summary: `Сопоставлено ${Object.values(mappings).filter(Boolean).length} из ${fields.length} полей`,
    },
  ];

  return (
    <Page maxWidth={940}>
      <PageHeader title="Загрузка данных" />

      <Stepper step={step} />

      {step < 4 && done.slice(0, step).map((d, i) => (
        <div
          key={d.title}
          className="flex items-center gap-3.5 rounded-inner bg-surface px-[18px] py-3.5"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cat-priority text-white">
            <Check size={13} strokeWidth={3} />
          </span>
          <span className="whitespace-nowrap text-sm font-semibold">{d.title}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted">
            {d.summary}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => goTo(i)}
            className="border-0 bg-transparent text-[13px] font-medium text-accent hover:text-accent-hover"
          >
            Изменить
          </button>
        </div>
      ))}

      {step === 0 && (
        <StepCard n={1} title="Рынок">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
            <Choice
              active={kind === "new"}
              title="Создать новый"
              sub="Название, годы и язык МНН — затем загрузка БДП"
              onClick={() => { setKind("new"); setError(""); }}
            />
            <Choice
              active={kind === "existing"}
              title="Использовать существующий"
              sub="Перезагрузить БДП в уже созданный рынок"
              onClick={() => { setKind("existing"); setError(""); }}
            />
          </div>

          {kind === "new" ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted">Название рынка</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="например: Кардиология 2024"
                  className={FIELD}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted">Годы, минимум 2</span>
                <input
                  value={yearsText}
                  onChange={(e) => setYearsText(e.target.value)}
                  placeholder="2022, 2023, 2024"
                  inputMode="numeric"
                  className={FIELD}
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted">
                  Язык МНН в источнике
                </span>
                <Segmented
                  ariaLabel="Язык МНН в источнике"
                  className="h-10 [&>button]:flex-1"
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: "ru", label: "Русский" },
                    { value: "en", label: "Английский" },
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(markets.data ?? []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={existingId === m.id}
                  onClick={() => setExistingId(m.id)}
                  className={clsx(
                    "tr-soft flex items-center justify-between gap-3 rounded-ctl border-[1.5px] px-3.5 py-3 text-left",
                    existingId === m.id
                      ? "border-accent bg-accent-tint"
                      : "border-seg bg-white hover:bg-[#fafaf8]",
                  )}
                >
                  <span className="truncate text-sm font-semibold text-fg">
                    {m.name}
                  </span>
                  <span className="whitespace-nowrap text-[13px] text-muted-2">
                    {yearsRange(m.years)}
                    {!!m.mnn_count && ` · ${fmtInt(m.mnn_count)} МНН`}
                  </span>
                </button>
              ))}
              {markets.data?.length === 0 && (
                <span className="text-sm text-muted-2">
                  Пока нет ни одного рынка — создайте новый
                </span>
              )}
              {!markets.data && (
                <span className="text-sm text-faint">
                  {markets.error || "Загрузка списка рынков…"}
                </span>
              )}
              <span className="pt-1 text-xs text-[oklch(0.5_0.15_25)]">
                Новый файл перезапишет текущий БДП рынка
              </span>
            </div>
          )}
          <Actions error={error}>
            <button type="button" disabled={busy} onClick={submitMarket} className={PRIMARY}>
              Продолжить →
            </button>
          </Actions>
        </StepCard>
      )}

      {step === 1 && (
        <StepCard n={2} title="Файл БДП" note="Excel .xlsx">
          <Dropzone
            file={file}
            onFile={(f) => { setFile(f); setError(""); }}
            onReject={() => setError("Допустим только формат .xlsx")}
          />
          <Actions error={error} onBack={() => goTo(0)} busy={busy}>
            {file && (
              <button type="button" disabled={busy} onClick={submitFile} className={PRIMARY}>
                {busy ? "Загрузка…" : "Загрузить →"}
              </button>
            )}
          </Actions>
        </StepCard>
      )}

      {step === 2 && upload && (
        <StepCard n={3} title="Лист и строка заголовков">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
            {upload.sheets.map((s) => {
              const count = upload.columns[s]?.length ?? 0;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={s === sheet}
                  onClick={() => { setSheet(s); setHeaderRow(1); }}
                  className={clsx(
                    "tr-soft flex flex-col gap-[3px] rounded-ctl border-[1.5px] px-3.5 py-3 text-left",
                    s === sheet
                      ? "border-accent bg-accent-tint"
                      : "border-seg bg-white hover:bg-[#fafaf8]",
                  )}
                >
                  <span className="truncate text-sm font-semibold text-fg">{s}</span>
                  <span className="text-xs text-muted-2">
                    {count} {plural(count, "колонка", "колонки", "колонок")}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-muted">
              Нажмите на строку с заголовками колонок · сейчас строка {headerRow}
            </span>
            <SheetPreview
              rows={preview.data?.rows ?? null}
              error={preview.error}
              headerRow={headerRow}
              onPick={setHeaderRow}
            />
            {sheetColumns > PREVIEW_COLUMNS && (
              <span className="text-xs text-faint">
                Показаны первые {PREVIEW_COLUMNS} колонок из {sheetColumns}
              </span>
            )}
          </div>
          <Actions error={error} onBack={() => goTo(1)} busy={busy}>
            <button type="button" disabled={busy || !sheet} onClick={submitSheet} className={PRIMARY}>
              Далее →
            </button>
          </Actions>
        </StepCard>
      )}

      {step === 3 && columns && (
        <StepCard
          n={4}
          title="Маппинг полей"
          sub={`Автоматически сопоставлено ${auto.size} из ${fields.length} полей. Проверьте по примерам значений.`}
        >
          <div className="flex flex-col">
            {fields.map((f) => {
              const column = mappings[f.key] ?? "";
              const lacking = f.required && !column;
              const samples = column ? columns.samples[column] ?? [] : [];
              return (
                <div
                  key={f.key}
                  className="grid grid-cols-[minmax(150px,200px)_minmax(150px,200px)_minmax(0,1fr)] items-center gap-4 border-t border-[#f3f3f0] py-[9px]"
                >
                  <span className="text-sm">
                    {f.label}
                    {f.required && <span className="text-neg"> *</span>}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <select
                      value={column}
                      aria-label={`Колонка для поля «${f.label}»`}
                      onChange={(e) => setMapping(f.key, e.target.value)}
                      className="h-[34px] min-w-0 flex-1 rounded-lg border bg-white px-2 text-[13px] text-fg outline-none focus:border-accent"
                      style={{
                        borderColor: lacking ? "oklch(0.6 0.19 25)" : "#e3e3df",
                      }}
                    >
                      <option value="">— не выбрано —</option>
                      {columns.columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <span className="w-[26px] text-[10px] font-semibold text-accent">
                      {auto.has(f.key) && column ? "авто" : ""}
                    </span>
                  </span>
                  <span
                    className={clsx(
                      "truncate text-xs",
                      lacking ? "text-neg" : "text-faint",
                    )}
                    title={samples.join(" · ")}
                  >
                    {lacking
                      ? "обязательное поле — выберите колонку"
                      : samples.join(" · ") || (column ? "нет значений" : "")}
                  </span>
                </div>
              );
            })}
          </div>
          <Actions
            error={
              error || (missing.length > 0
                ? `Не сопоставлено обязательных полей: ${missing.length}`
                : "")
            }
            onBack={() => goTo(2)}
            busy={busy}
          >
            <button
              type="button"
              disabled={busy || missing.length > 0}
              onClick={submitMapping}
              className={PRIMARY}
            >
              {busy ? "Обработка файла…" : "Применить и обработать →"}
            </button>
          </Actions>
        </StepCard>
      )}

      {step === 4 && market && result && (
        <section className="anim-tab flex flex-col gap-6 rounded-hero bg-ink px-8 py-[30px] text-white">
          <div className="flex flex-col gap-2.5">
            <span
              className="flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                background: "oklch(0.78 0.16 155 / 0.18)",
                color: "oklch(0.86 0.14 155)",
              }}
            >
              <Check size={13} strokeWidth={3} /> БДП загружен
            </span>
            <span className="text-pretty text-[30px] font-semibold leading-[1.15] tracking-[-0.025em]">
              Рынок «{market.name}» готов к анализу
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
            <Tile label="Строк БДП">{fmtInt(result.bdp_count)}</Tile>
            <Tile label="МНН">{fmtInt(stats?.mnn)}</Tile>
            <Tile label="Производителей">{fmtInt(stats?.producers)}</Tile>
            <Tile label={`Рынок ${stats?.year ?? ""}`}>{fmtUsd(stats?.usd)}</Tile>
            <Tile label="Приоритет" accent>
              {stats?.priority == null ? "—" : `${fmtInt(stats.priority)} МНН`}
            </Tile>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to={`/market/${market.id}/overview`}
              className="tr-soft rounded-ctl bg-white px-[18px] py-[11px] text-sm font-semibold text-fg hover:bg-seg hover:text-fg"
            >
              Открыть обзор рынка →
            </Link>
            <button
              type="button"
              onClick={restart}
              className="tr-soft rounded-ctl border-0 bg-[oklch(1_0_0/0.1)] px-4 py-[11px] text-sm font-medium text-white hover:bg-[oklch(1_0_0/0.18)]"
            >
              Загрузить ещё
            </button>
          </div>
        </section>
      )}
    </Page>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="anim-head grid grid-cols-5 gap-2">
      {STEPS.map((label, i) => {
        const isDone = i < step || step === STEPS.length - 1;
        const isCurrent = i === step && !isDone;
        return (
          <div key={label} className="flex min-w-0 flex-col gap-2">
            <span
              className="h-1.5 rounded-[3px]"
              style={{
                background: isDone
                  ? "oklch(0.58 0.15 155)"
                  : isCurrent ? "oklch(0.47 0.14 262)" : "#e2e3e7",
                transition: "background .3s",
              }}
            />
            <span
              className={clsx(
                "flex items-center gap-1.5 truncate text-xs",
                isCurrent ? "font-semibold text-fg" : "text-muted-2",
              )}
            >
              <span
                className="flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={
                  isDone
                    ? { background: "oklch(0.58 0.15 155)", color: "#fff" }
                    : isCurrent
                      ? { background: "oklch(0.47 0.14 262)", color: "#fff" }
                      : { background: "#e2e3e7", color: "#6b6f78" }
                }
              >
                {isDone ? <Check size={10} strokeWidth={3.5} /> : i + 1}
              </span>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StepCard({
  n, title, note, sub, children,
}: {
  n: number;
  title: string;
  note?: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <Card anim="tab" className="flex flex-col gap-5 px-6!">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span className="flex size-[26px] items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
            {n}
          </span>
          <span className="whitespace-nowrap text-[17px] font-semibold">
            {title}
          </span>
          {note && <span className="text-[13px] text-faint">{note}</span>}
        </div>
        {sub && (
          <span className="pl-[38px] text-[13px] leading-normal text-muted-2">
            {sub}
          </span>
        )}
      </div>
      {children}
    </Card>
  );
}

function Actions({
  error, onBack, busy, children,
}: {
  error: string;
  onBack?: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {onBack && (
        <button type="button" disabled={busy} onClick={onBack} className={SECONDARY}>
          Назад
        </button>
      )}
      <span role="alert" className="min-w-0 flex-1 text-[13px] text-neg">
        {error}
      </span>
      {children}
    </div>
  );
}

function Choice({
  active, title, sub, onClick,
}: {
  active: boolean;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "tr-soft flex flex-col gap-1 rounded-xl border-[1.5px] p-4 text-left",
        active
          ? "border-accent bg-accent-tint"
          : "border-seg bg-white hover:bg-[#fafaf8]",
      )}
    >
      <span className="text-[15px] font-semibold text-fg">{title}</span>
      <span className="text-[13px] text-muted-2">{sub}</span>
    </button>
  );
}

function Dropzone({
  file, onFile, onReject,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  onReject: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".xlsx")) {
      onReject();
      return;
    }
    onFile(candidate);
  }

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
  }, [file]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      {file ? (
        <div className="flex items-center gap-3.5 rounded-xl border border-[#ecece8] bg-[#fafaf8] px-4 py-3.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
            style={{
              background: "oklch(0.94 0.05 155)", color: "oklch(0.38 0.11 155)",
            }}
          >
            XLSX
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold">{file.name}</span>
            <span className="text-xs text-faint">{fileSize(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onFile(null)}
            className="border-0 bg-transparent text-[13px] text-muted-2 hover:text-fg"
          >
            Убрать
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            accept(e.dataTransfer.files[0]);
          }}
          className="tr-soft flex flex-col items-center gap-2 rounded-inner border-[1.5px] border-dashed px-6 py-11 hover:border-accent hover:bg-[oklch(0.98_0.01_262)]"
          style={{
            borderColor: over ? "oklch(0.47 0.14 262)" : "oklch(0.82 0.05 268)",
            background: over ? "oklch(0.97 0.015 262)" : "oklch(0.985 0.008 268)",
          }}
        >
          <span
            className="flex size-[52px] items-center justify-center rounded-[14px] text-accent"
            style={{ background: "oklch(0.95 0.035 268)" }}
          >
            <Upload size={24} />
          </span>
          <span className="text-[15px] font-semibold text-fg">
            Перетащите файл или нажмите для выбора
          </span>
          <span className="text-[13px] text-faint">Только .xlsx</span>
        </button>
      )}
    </>
  );
}

function SheetPreview({
  rows, error, headerRow, onPick,
}: {
  rows: string[][] | null;
  error: string;
  headerRow: number;
  onPick: (row: number) => void;
}) {
  if (error) return <span className="text-[13px] text-neg">{error}</span>;
  if (!rows) return <span className="text-[13px] text-faint">Чтение листа…</span>;
  if (rows.length === 0) {
    return <span className="text-[13px] text-muted-2">Лист пуст</span>;
  }
  const width = Math.min(
    Math.max(...rows.map((r) => r.length), 1), PREVIEW_COLUMNS,
  );
  return (
    <div className="overflow-auto rounded-ctl border border-[#ecece8]">
      {rows.map((cells, i) => {
        const active = i + 1 === headerRow;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(i + 1)}
            className={clsx(
              "tr-soft grid w-full border-0 border-t border-[#f3f3f0] text-left first:border-t-0 hover:bg-[#f7f7f4]",
              active ? "bg-accent-tint font-semibold" : "bg-white font-normal",
            )}
            style={{
              gridTemplateColumns: `36px repeat(${width}, minmax(130px, 1fr))`,
              minWidth: 36 + width * 130,
            }}
          >
            <span className="bg-[#fafaf8] px-2.5 py-2 text-xs font-normal text-[#9a9ea6]">
              {i + 1}
            </span>
            {Array.from({ length: width }, (_, c) => (
              <span key={c} className="truncate px-2.5 py-2 text-[13px] text-fg">
                {cells[c] ?? ""}
              </span>
            ))}
          </button>
        );
      })}
    </div>
  );
}

function Tile({
  label, accent = false, children,
}: {
  label: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-inner px-4 py-3.5"
      style={{
        background: accent ? "oklch(0.58 0.15 155)" : "oklch(1 0 0 / 0.07)",
      }}
    >
      <span
        className="text-xs"
        style={{
          color: accent ? "oklch(0.97 0.03 155)" : "oklch(0.84 0.04 268)",
        }}
      >
        {label}
      </span>
      <span className="whitespace-nowrap text-2xl font-semibold">{children}</span>
    </div>
  );
}
