import { useState } from "react";
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
} from "lucide-react";
import clsx from "clsx";
import {
  createMarket,
  uploadFile,
  getColumns,
  applyMapping,
} from "../api/client";
import type {
  Market,
  UploadResponse,
  MappingResult,
} from "../types/api";
import UnrecognizedBanner from "../components/common/UnrecognizedBanner";

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

const steps = [
  { label: "Рынок", icon: Plus },
  { label: "Файл", icon: Upload },
  { label: "Лист", icon: FileSpreadsheet },
  { label: "Маппинг", icon: Columns3 },
  { label: "Готово", icon: CheckCircle2 },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [yearsStr, setYearsStr] = useState("2022,2023,2024");
  const [language, setLanguage] = useState<"ru" | "en">("ru");
  const [market, setMarket] = useState<Market | null>(null);

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
      setStep(1);
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
      setStep(2);
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
      setStep(3);
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
      setStep(4);
    } catch {
      setError("Ошибка маппинга / трансформации");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stepper */}
      <div className="flex items-center justify-between mb-8">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                  i < step
                    ? "bg-emerald-500 text-white"
                    : i === step
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                      : "bg-slate-100 text-slate-400",
                )}
              >
                {i < step ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <s.icon size={18} />
                )}
              </div>
              <span
                className={clsx(
                  "text-sm font-medium hidden sm:block",
                  i <= step ? "text-slate-700" : "text-slate-400",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={clsx(
                  "flex-1 h-px mx-4",
                  i < step ? "bg-emerald-300" : "bg-slate-200",
                )}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <X size={16} />
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        {/* Step 0: Create Market */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-1">
                Создание рынка
              </h2>
              <p className="text-sm text-slate-500">
                Укажите название и годы данных
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Название рынка
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="например: Кардиология 2024"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Годы (через запятую)
              </label>
              <input
                type="text"
                value={yearsStr}
                onChange={(e) => setYearsStr(e.target.value)}
                placeholder="2022,2023,2024"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              Создать
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-1">
                Загрузка файла БДП
              </h2>
              <p className="text-sm text-slate-500">
                Выберите Excel-файл (.xlsx)
              </p>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) setFile(f);
              }}
              className={clsx(
                "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
                file
                  ? "border-emerald-300 bg-emerald-50/50"
                  : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30",
              )}
              onClick={() =>
                document.getElementById("file-input")?.click()
              }
            >
              <input
                id="file-input"
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) =>
                  setFile(e.target.files?.[0] ?? null)
                }
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet
                    size={40}
                    className="text-emerald-500"
                  />
                  <p className="text-sm font-medium text-slate-700">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(1)} МБ
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={40} className="text-slate-400" />
                  <p className="text-sm text-slate-600">
                    Перетащите файл или нажмите для выбора
                  </p>
                  <p className="text-xs text-slate-400">
                    Только .xlsx файлы
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(0)}
                className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Назад
              </button>
              <button
                onClick={handleUpload}
                disabled={!file}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Загрузить
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select sheet */}
        {step === 2 && uploadData && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-1">
                Выбор листа
              </h2>
              <p className="text-sm text-slate-500">
                Укажите лист и строку заголовков
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Лист
              </label>
              <select
                value={selectedSheet}
                onChange={(e) => setSelectedSheet(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm bg-white"
              >
                {uploadData.sheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Строка заголовков
              </label>
              <input
                type="number"
                min={1}
                value={headerRow}
                onChange={(e) =>
                  setHeaderRow(parseInt(e.target.value, 10) || 1)
                }
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Назад
              </button>
              <button
                onClick={handleSelectSheet}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                Далее
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Mapping */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-1">
                Маппинг полей
              </h2>
              <p className="text-sm text-slate-500">
                Сопоставьте поля системы с колонками файла
              </p>
            </div>
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
              {SYSTEM_FIELDS.map((f) => (
                <div
                  key={f.key}
                  className="flex items-center gap-4"
                >
                  <label className="w-52 text-sm text-slate-700 flex-shrink-0">
                    {f.label}
                    {f.required && (
                      <span className="text-red-400 ml-0.5">*</span>
                    )}
                  </label>
                  <select
                    value={mappings[f.key] ?? ""}
                    onChange={(e) =>
                      setMappings((m) => ({
                        ...m,
                        [f.key]: e.target.value,
                      }))
                    }
                    className={clsx(
                      "flex-1 px-3 py-2 rounded-lg border text-sm bg-white outline-none transition-all",
                      mappings[f.key]
                        ? "border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        : "border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100",
                    )}
                  >
                    <option value="">— не выбрано —</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Назад
              </button>
              <button
                onClick={handleApplyMapping}
                disabled={processing}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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
        )}

        {/* Step 4: Done */}
        {step === 4 && result && market && (
          <div className="text-center space-y-6 py-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">
                Данные загружены!
              </h2>
              <p className="text-sm text-slate-500">
                Рынок «{market.name}» готов к анализу
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-slate-800">
                  {result.bdp_count}
                </p>
                <p className="text-xs text-slate-500 mt-1">БДП строк</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-slate-800">
                  {result.avp_count}
                </p>
                <p className="text-xs text-slate-500 mt-1">АВП строк</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-2xl font-bold text-slate-800">
                  {result.kap_count}
                </p>
                <p className="text-xs text-slate-500 mt-1">КАП строк</p>
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
                onClick={() => navigate("/")}
                className="px-6 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                К рынкам
              </button>
              <button
                onClick={() =>
                  navigate(`/market/${market.id}/dashboard`)
                }
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                Открыть дашборд
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
