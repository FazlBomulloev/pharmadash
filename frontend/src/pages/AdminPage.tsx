import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileSpreadsheet,
  Columns3,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  Database,
  DollarSign,
  ShieldCheck,
  FlaskConical,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import {
  createMarket,
  uploadFile,
  getColumns,
  applyMapping,
  getMarkets,
} from "../api/client";
import type {
  Market,
  UploadResponse,
  MappingResult,
} from "../types/api";
import UnrecognizedBanner from "../components/common/UnrecognizedBanner";
import MarketReferencePage from "./MarketReferencePage";

type Tab = "bdp" | "pc" | "grls";
type MarketMode = "new" | "existing" | null;

const SYSTEM_FIELDS = [
  { key: "mnn", label: "МНН", required: true },
  { key: "tm", label: "Торговое наименование", required: true },
  { key: "producer", label: "Производитель", required: true },
  { key: "country_mfr", label: "Страна производства", required: false },
  { key: "lf_avp", label: "Лекарственная форма", required: true },
  { key: "strength", label: "Дозировка", required: false },
  { key: "atc", label: "АТХ код", required: false },
  { key: "bg_g", label: "БГ/Г", required: false },
  { key: "region", label: "Регион", required: true },
  { key: "sector", label: "Сектор (RET/HOS)", required: true },
  { key: "usd_y1", label: "Продажи USD (год 1)", required: true },
  { key: "usd_y2", label: "Продажи USD (год 2)", required: true },
  { key: "usd_y3", label: "Продажи USD (год 3)", required: true },
  { key: "un_y1", label: "Продажи UN (год 1)", required: true },
  { key: "un_y2", label: "Продажи UN (год 2)", required: true },
  { key: "un_y3", label: "Продажи UN (год 3)", required: true },
];

const bdpSteps = [
  { label: "Файл", icon: Upload },
  { label: "Лист", icon: FileSpreadsheet },
  { label: "Маппинг", icon: Columns3 },
  { label: "Готово", icon: CheckCircle2 },
];

export default function AdminPage() {
  const navigate = useNavigate();

  // ── Market picker ──────────────────────────────
  const [mode, setMode] = useState<MarketMode>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [existingMarkets, setExistingMarkets] = useState<Market[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);

  // Create-new-market form
  const [name, setName] = useState("");
  const [yearsStr, setYearsStr] = useState("2022,2023,2024");
  const [language, setLanguage] = useState<"ru" | "en">("ru");

  // ── Tabs ───────────────────────────────────────
  const [tab, setTab] = useState<Tab>("bdp");

  // ── BDP wizard state ──────────────────────────
  const [bdpStep, setBdpStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(
    null,
  );
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [columns, setColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<MappingResult | null>(null);

  const [error, setError] = useState("");

  useEffect(() => {
    if (mode === "existing" && existingMarkets.length === 0 && !loadingMarkets) {
      setLoadingMarkets(true);
      getMarkets()
        .then(setExistingMarkets)
        .catch(() => setError("Не удалось загрузить список рынков"))
        .finally(() => setLoadingMarkets(false));
    }
  }, [mode, existingMarkets.length, loadingMarkets]);

  function resetBdpWizard() {
    setBdpStep(0);
    setFile(null);
    setUploadData(null);
    setSelectedSheet("");
    setHeaderRow(1);
    setColumns([]);
    setMappings({});
    setResult(null);
  }

  function switchMarket() {
    setMarket(null);
    setMode(null);
    setTab("bdp");
    resetBdpWizard();
    setError("");
  }

  async function handleCreateMarket() {
    setError("");
    const years = yearsStr
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (!name.trim() || years.length < 2) {
      setError("Введите название и минимум 2 года");
      return;
    }
    try {
      const m = await createMarket({ name: name.trim(), years, language });
      setMarket(m);
      setTab("bdp");
      resetBdpWizard();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Ошибка создания рынка";
      setError(msg);
    }
  }

  async function handleUpload() {
    if (!market || !file) return;
    setError("");
    try {
      const data = await uploadFile(market.id, file);
      setUploadData(data);
      if (data.sheets.length > 0) {
        setSelectedSheet(data.sheets[0]);
      }
      setBdpStep(1);
    } catch {
      setError("Ошибка загрузки файла");
    }
  }

  async function handleSelectSheet() {
    if (!market) return;
    setError("");
    try {
      const data = await getColumns(market.id, selectedSheet, headerRow);
      setColumns(data.columns);
      setBdpStep(2);
    } catch {
      setError("Ошибка чтения колонок");
    }
  }

  async function handleApplyMapping() {
    if (!market) return;
    const required = SYSTEM_FIELDS.filter((f) => f.required);
    const missing = required.filter((f) => !mappings[f.key]);
    if (missing.length > 0) {
      setError(
        `Обязательные поля: ${missing.map((f) => f.label).join(", ")}`,
      );
      return;
    }

    setProcessing(true);
    setError("");
    try {
      const res = await applyMapping(market.id, {
        sheet_name: selectedSheet,
        header_row: headerRow,
        mappings: Object.entries(mappings).map(
          ([system_field, file_column]) => ({
            system_field,
            file_column,
          }),
        ),
      });
      setResult(res);
      setBdpStep(3);
    } catch {
      setError("Ошибка маппинга / трансформации");
    } finally {
      setProcessing(false);
    }
  }

  // ── Render: Market picker if no market ─────────
  if (!market) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            Загрузка данных
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Выберите рынок или создайте новый — затем загрузите БДП, ПЦ или ГРЛС
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
            <X size={16} />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModeCard
            active={mode === "new"}
            icon={Plus}
            title="Создать новый рынок"
            description="Определите название и годы, затем загрузите БДП"
            onClick={() => setMode("new")}
          />
          <ModeCard
            active={mode === "existing"}
            icon={FlaskConical}
            title="Использовать существующий"
            description="Догрузить БДП, ПЦ или ГРЛС в уже созданный рынок"
            onClick={() => setMode("existing")}
          />
        </div>

        {mode === "new" && (
          <div className="mt-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Название рынка
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="например: Кардиология 2024"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Годы (через запятую)
              </label>
              <input
                type="text"
                value={yearsStr}
                onChange={(e) => setYearsStr(e.target.value)}
                placeholder="2022,2023,2024"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                Язык МНН в источниках
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="ru"
                    checked={language === "ru"} onChange={() => setLanguage("ru")} />
                  <span className="text-sm">Русский</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value="en"
                    checked={language === "en"} onChange={() => setLanguage("en")} />
                  <span className="text-sm">Английский</span>
                </label>
              </div>
            </div>
            <button
              onClick={handleCreateMarket}
              className="w-full py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              Создать и перейти к загрузке
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {mode === "existing" && (
          <div className="mt-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            {loadingMarkets ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 justify-center py-6">
                <Loader2 size={16} className="animate-spin" />
                Загрузка списка рынков…
              </div>
            ) : existingMarkets.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                Пока нет ни одного рынка. Создайте новый.
              </p>
            ) : (
              <div className="space-y-2">
                {existingMarkets.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMarket(m)}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors text-left group"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100 group-hover:text-indigo-700">
                        {m.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {m.years.join(", ")}
                        {m.mnn_count != null && (
                          <> · {m.mnn_count.toLocaleString("ru-RU")} МНН</>
                        )}
                        {m.has_pc && <> · ПЦ ✓</>}
                        {m.has_grls && <> · ГРЛС ✓</>}
                      </p>
                    </div>
                    <ArrowRight
                      size={18}
                      className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render: tabs when market chosen ────────────
  return (
    <div className="max-w-4xl mx-auto">
      <MarketContextBar market={market} onSwitch={switchMarket} />

      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
        <TabButton
          active={tab === "bdp"}
          icon={Database}
          label="БДП"
          onClick={() => setTab("bdp")}
        />
        <TabButton
          active={tab === "pc"}
          icon={DollarSign}
          label="Предельные цены"
          hint={market.has_pc ? "загружено" : undefined}
          onClick={() => setTab("pc")}
        />
        <TabButton
          active={tab === "grls"}
          icon={ShieldCheck}
          label="ГРЛС"
          hint={market.has_grls ? "загружено" : undefined}
          onClick={() => setTab("grls")}
        />
      </div>

      {error && tab === "bdp" && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <X size={16} />
          {error}
        </div>
      )}

      {tab === "bdp" && (
        <div>
          <BdpStepper step={bdpStep} />
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
            {bdpStep === 0 && (
              <BdpUploadStep
                file={file}
                onFile={setFile}
                onNext={handleUpload}
              />
            )}
            {bdpStep === 1 && uploadData && (
              <BdpSheetStep
                sheets={uploadData.sheets}
                selectedSheet={selectedSheet}
                headerRow={headerRow}
                onSheetChange={setSelectedSheet}
                onRowChange={setHeaderRow}
                onBack={() => setBdpStep(0)}
                onNext={handleSelectSheet}
              />
            )}
            {bdpStep === 2 && (
              <BdpMappingStep
                columns={columns}
                mappings={mappings}
                onChange={setMappings}
                onBack={() => setBdpStep(1)}
                onApply={handleApplyMapping}
                processing={processing}
              />
            )}
            {bdpStep === 3 && result && (
              <BdpDoneStep
                market={market}
                result={result}
                onOpenDashboard={() =>
                  navigate(`/market/${market.id}/dashboard`)
                }
                onLoadAnother={resetBdpWizard}
              />
            )}
          </div>
        </div>
      )}

      {tab === "pc" && (
        <MarketReferencePage source="pc" marketId={market.id} />
      )}

      {tab === "grls" && (
        <MarketReferencePage source="grls" marketId={market.id} />
      )}
    </div>
  );
}

// ═══════════════════════ Sub-components ═══════════════════════

function ModeCard({
  active, icon: Icon, title, description, onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "text-left p-5 rounded-xl border-2 transition-all",
        active
          ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 hover:bg-indigo-50/30",
      )}
    >
      <Icon
        size={22}
        className={clsx(
          "mb-3",
          active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500",
        )}
      />
      <p className={clsx(
        "font-semibold mb-1",
        active ? "text-indigo-700 dark:text-indigo-300" : "text-slate-800 dark:text-slate-100",
      )}>
        {title}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        {description}
      </p>
    </button>
  );
}

function MarketContextBar({
  market, onSwitch,
}: {
  market: Market;
  onSwitch: () => void;
}) {
  return (
    <div className="mb-6 flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
          <FlaskConical size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
            Активный рынок
          </p>
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            {market.name}
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500 ml-2">
              {market.years.join(", ")}
            </span>
          </p>
        </div>
      </div>
      <button
        onClick={onSwitch}
        className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 px-3 py-1.5 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1"
      >
        Сменить рынок
        <ChevronDown size={12} />
      </button>
    </div>
  );
}

function TabButton({
  active, icon: Icon, label, hint, onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:border-slate-300",
      )}
    >
      <Icon size={16} />
      {label}
      {hint && (
        <span className={clsx(
          "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
          active ? "bg-indigo-100 text-indigo-700 dark:text-indigo-300" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
        )}>
          {hint}
        </span>
      )}
    </button>
  );
}

function BdpStepper({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between mb-6">
      {bdpSteps.map((s, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                i < step
                  ? "bg-emerald-500 text-white"
                  : i === step
                    ? "bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg shadow-indigo-200"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
              )}
            >
              {i < step ? <CheckCircle2 size={18} /> : <s.icon size={16} />}
            </div>
            <span
              className={clsx(
                "text-sm font-medium hidden sm:block",
                i <= step ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500",
              )}
            >
              {s.label}
            </span>
          </div>
          {i < bdpSteps.length - 1 && (
            <div
              className={clsx(
                "flex-1 h-px mx-4",
                i < step ? "bg-emerald-300" : "bg-slate-200 dark:bg-slate-700",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function BdpUploadStep({
  file, onFile, onNext,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Загрузка файла БДП
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Excel (.xlsx). Перезаписывает существующий БДП рынка.
        </p>
      </div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className={clsx(
          "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
          file
            ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30"
            : "border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50/30",
        )}
        onClick={() =>
          document.getElementById("bdp-file-input")?.click()
        }
      >
        <input
          id="bdp-file-input"
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileSpreadsheet size={40} className="text-emerald-500 dark:text-emerald-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{file.name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {(file.size / 1024 / 1024).toFixed(1)} МБ
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={40} className="text-slate-400 dark:text-slate-500" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Перетащите файл или нажмите для выбора
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Только .xlsx файлы</p>
          </div>
        )}
      </div>
      <button
        onClick={onNext}
        disabled={!file}
        className="w-full py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        Загрузить
        <ArrowRight size={18} />
      </button>
    </div>
  );
}

function BdpSheetStep({
  sheets, selectedSheet, headerRow, onSheetChange, onRowChange, onBack, onNext,
}: {
  sheets: string[];
  selectedSheet: string;
  headerRow: number;
  onSheetChange: (s: string) => void;
  onRowChange: (n: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Выбор листа
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Укажите лист и строку заголовков
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
          Лист
        </label>
        <select
          value={selectedSheet}
          onChange={(e) => onSheetChange(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm bg-white dark:bg-slate-900"
        >
          {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
          Строка заголовков
        </label>
        <input
          type="number"
          min={1}
          value={headerRow}
          onChange={(e) => onRowChange(parseInt(e.target.value, 10) || 1)}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
        />
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          Назад
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
        >
          Далее
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function BdpMappingStep({
  columns, mappings, onChange, onBack, onApply, processing,
}: {
  columns: string[];
  mappings: Record<string, string>;
  onChange: (m: Record<string, string>) => void;
  onBack: () => void;
  onApply: () => void;
  processing: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Маппинг полей
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Сопоставьте поля системы с колонками файла
        </p>
      </div>
      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
        {SYSTEM_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-4">
            <label className="w-52 text-sm text-slate-700 dark:text-slate-200 flex-shrink-0">
              {f.label}
              {f.required && <span className="text-red-400 dark:text-red-500 ml-0.5">*</span>}
            </label>
            <select
              value={mappings[f.key] ?? ""}
              onChange={(e) =>
                onChange({ ...mappings, [f.key]: e.target.value })
              }
              className={clsx(
                "flex-1 px-3 py-2 rounded-lg border text-sm bg-white dark:bg-slate-900 outline-none transition-all",
                mappings[f.key]
                  ? "border-emerald-300 dark:border-emerald-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  : "border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
              )}
            >
              <option value="">— не выбрано —</option>
              {columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          Назад
        </button>
        <button
          onClick={onApply}
          disabled={processing}
          className="flex-1 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Обработка...
            </>
          ) : (
            <>
              Применить
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function BdpDoneStep({
  market, result, onOpenDashboard, onLoadAnother,
}: {
  market: Market;
  result: MappingResult;
  onOpenDashboard: () => void;
  onLoadAnother: () => void;
}) {
  return (
    <div className="text-center space-y-6 py-4">
      <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mx-auto">
        <CheckCircle2 size={40} className="text-emerald-500 dark:text-emerald-400" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
          БДП загружен!
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Рынок «{market.name}» готов к анализу
        </p>
      </div>
      <div className="max-w-xs mx-auto">
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {result.bdp_count}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">БДП строк</p>
        </div>
      </div>
      {result.unrecognized && Object.keys(result.unrecognized).length > 0 && (
        <div className="text-left space-y-2">
          {Object.entries(result.unrecognized).map(([ft, vals]) => vals.length > 0 && (
            <UnrecognizedBanner key={ft} fieldType={ft} values={vals} />
          ))}
        </div>
      )}
      <div className="flex gap-3 justify-center">
        <button
          onClick={onLoadAnother}
          className="px-6 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors"
        >
          Загрузить ещё
        </button>
        <button
          onClick={onOpenDashboard}
          className="px-6 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          Открыть дашборд
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
