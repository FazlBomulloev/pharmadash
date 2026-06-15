import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Upload,
  FileSpreadsheet,
  Columns3,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  uploadReference,
  getReferenceColumns,
  applyReferenceMapping,
} from "../api/client";
import type { UploadResponse, ReferenceMappingResult } from "../types/api";
import UnrecognizedBanner from "../components/common/UnrecognizedBanner";

const PC_FIELDS = [
  { key: "mnn", label: "МНН", required: true },
  { key: "tm", label: "Торговое наименование", required: false },
  { key: "lf", label: "Лекарственная форма", required: false },
  { key: "owner", label: "Владелец", required: false },
  { key: "pack_qty", label: "Количество в упаковке", required: false },
  { key: "price_rub_no_vat", label: "Предельная цена без НДС", required: true },
  { key: "price_reg_date", label: "Дата регистрации цены", required: false },
  { key: "price_effective_date", label: "Дата вступления в силу", required: false },
];

const GRLS_FIELDS = [
  { key: "mnn", label: "МНН", required: true },
  { key: "tm", label: "Торговое наименование", required: false },
  { key: "ru_holder", label: "Юр. лицо РУ", required: false },
  { key: "lf_full", label: "Формы выпуска", required: false },
  { key: "dosage", label: "Дозировка", required: false },
  { key: "jnvlp", label: "Флаг ЖНВЛП", required: true },
  { key: "ru_number", label: "Номер РУ", required: false },
  { key: "reg_date", label: "Дата регистрации", required: false },
  { key: "expire_date", label: "Дата окончания", required: false },
  { key: "cancel_date", label: "Дата аннулирования", required: false },
  { key: "status", label: "Статус РУ (если пусто — берётся из имени файла архива)", required: false },
];

const steps = [
  { label: "Файл", icon: Upload },
  { label: "Лист", icon: FileSpreadsheet },
  { label: "Маппинг", icon: Columns3 },
  { label: "Готово", icon: CheckCircle2 },
];

export default function MarketReferencePage({ source }: { source: "pc" | "grls" }) {
  const { marketId } = useParams<{ marketId: string }>();
  const mid = Number(marketId);
  const fields = source === "pc" ? PC_FIELDS : GRLS_FIELDS;
  const title = source === "pc" ? "Предельные цены (РС)" : "ГРЛС";
  const accept = source === "grls" ? ".xlsx,.zip" : ".xlsx";

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [columns, setColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ReferenceMappingResult | null>(null);
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!file) return;
    setError("");
    try {
      const data = await uploadReference(mid, source, file);
      setUploadData(data);
      if (data.sheets.length > 0) setSelectedSheet(data.sheets[0]);
      setStep(1);
    } catch {
      setError("Ошибка загрузки файла");
    }
  }

  async function handleSelectSheet() {
    setError("");
    try {
      const data = await getReferenceColumns(mid, source, selectedSheet, headerRow);
      setColumns(data.columns);
      setStep(2);
    } catch {
      setError("Ошибка чтения колонок");
    }
  }

  async function handleApplyMapping() {
    const required = fields.filter((f) => f.required);
    const missing = required.filter((f) => !mappings[f.key]);
    if (missing.length > 0) {
      setError(`Обязательные поля: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setProcessing(true);
    setError("");
    try {
      const res = await applyReferenceMapping(mid, source, {
        sheet_name: selectedSheet,
        header_row: headerRow,
        mappings: Object.entries(mappings).map(([system_field, file_column]) => ({
          system_field,
          file_column,
        })),
      });
      setResult(res);
      setStep(3);
    } catch {
      setError("Ошибка маппинга");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                i < step ? "bg-emerald-500 text-white"
                  : i === step ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                    : "bg-slate-100 text-slate-400",
              )}>
                {i < step ? <CheckCircle2 size={20} /> : <s.icon size={18} />}
              </div>
              <span className={clsx("text-sm font-medium hidden sm:block", i <= step ? "text-slate-700" : "text-slate-400")}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={clsx("flex-1 h-px mx-4", i < step ? "bg-emerald-300" : "bg-slate-200")} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <X size={16} /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-1">Загрузка {title}</h2>
              <p className="text-sm text-slate-500">Выберите файл ({accept})</p>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
              className={clsx(
                "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
                file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 hover:border-indigo-400",
              )}
              onClick={() => document.getElementById("ref-file-input")?.click()}
            >
              <input id="ref-file-input" type="file" accept={accept} className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet size={40} className="text-emerald-500" />
                  <p className="text-sm font-medium text-slate-700">{file.name}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={40} className="text-slate-400" />
                  <p className="text-sm text-slate-600">Перетащите файл или нажмите</p>
                </div>
              )}
            </div>
            <button onClick={handleUpload} disabled={!file}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2">
              Загрузить <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 1 && uploadData && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-800">Выбор листа</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Лист</label>
              <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm bg-white">
                {uploadData.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Строка заголовков</label>
              <input type="number" min={1} value={headerRow}
                onChange={(e) => setHeaderRow(parseInt(e.target.value, 10) || 1)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm flex items-center gap-2">
                <ArrowLeft size={16} /> Назад
              </button>
              <button onClick={handleSelectSheet}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium flex items-center justify-center gap-2">
                Далее <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-800">Маппинг полей {title}</h2>
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-4">
                  <label className="w-52 text-sm text-slate-700 flex-shrink-0">
                    {f.label} {f.required && <span className="text-red-400">*</span>}
                  </label>
                  <select value={mappings[f.key] ?? ""} onChange={(e) => setMappings((m) => ({ ...m, [f.key]: e.target.value }))}
                    className={clsx("flex-1 px-3 py-2 rounded-lg border text-sm bg-white",
                      mappings[f.key] ? "border-emerald-300" : "border-slate-300")}>
                    <option value="">— не выбрано —</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm flex items-center gap-2">
                <ArrowLeft size={16} /> Назад
              </button>
              <button onClick={handleApplyMapping} disabled={processing}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-medium flex items-center justify-center gap-2">
                {processing ? <><Loader2 size={18} className="animate-spin" /> Обработка...</> : <>Применить <ArrowRight size={18} /></>}
              </button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div className="text-center space-y-6 py-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} className="text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800">{title} загружены!</h2>
            <p className="text-sm text-slate-500">
              {source === "pc" ? `${result.pc_count} записей` : `${result.grls_count} записей`}
            </p>
            {result.unrecognized && Object.keys(result.unrecognized).length > 0 && (
              <div className="text-left space-y-2">
                {Object.entries(result.unrecognized).map(([ft, vals]) => vals.length > 0 && (
                  <UnrecognizedBanner key={ft} fieldType={ft} values={vals} />
                ))}
              </div>
            )}
            <button onClick={() => { setStep(0); setFile(null); setResult(null); setMappings({}); }}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">
              Загрузить ещё
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
