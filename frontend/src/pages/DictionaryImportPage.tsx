import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileSpreadsheet, Columns3, CheckCircle2,
  ArrowRight, ArrowLeft, Loader2, X,
} from "lucide-react";
import clsx from "clsx";
import {
  getDictTypes,
  uploadDictImport,
  getDictImportColumns,
  applyDictImport,
} from "../api/client";
import type { DictionaryType, UploadResponse, DictionaryImportResult } from "../types/api";

const DICT_FIELDS = [
  { key: "value_en", label: "Value EN", required: false },
  { key: "value_ru", label: "Value RU", required: false },
  { key: "canonical", label: "Canonical", required: false },
  { key: "aliases", label: "Aliases (;)", required: false },
  { key: "notes", label: "Заметки", required: false },
];

export default function DictionaryImportPage() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<DictionaryType[]>([]);
  const [fieldType, setFieldType] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [columns, setColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<DictionaryImportResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDictTypes().then((t) => {
      setTypes(t);
      if (t.length > 0) setFieldType(t[0].type);
    });
  }, []);

  async function handleUpload() {
    if (!file) return;
    setError("");
    try {
      const data = await uploadDictImport(file);
      setUploadData(data);
      if (data.sheets.length > 0) setSelectedSheet(data.sheets[0]);
      setStep(2);
    } catch { setError("Ошибка загрузки"); }
  }

  async function handleSelectSheet() {
    setError("");
    try {
      const data = await getDictImportColumns(selectedSheet, headerRow);
      setColumns(data.columns);
      setStep(3);
    } catch { setError("Ошибка чтения колонок"); }
  }

  async function handleApply() {
    setProcessing(true);
    setError("");
    try {
      const res = await applyDictImport(fieldType, {
        sheet_name: selectedSheet,
        header_row: headerRow,
        mappings: Object.entries(mappings).map(([system_field, file_column]) => ({ system_field, file_column })),
      }, overwrite);
      setResult(res);
      setStep(4);
    } catch { setError("Ошибка импорта"); }
    finally { setProcessing(false); }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Массовый импорт словаря</h2>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <X size={16} /> {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
        {step === 0 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Настройки импорта</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Тип словаря</label>
              <select value={fieldType} onChange={(e) => setFieldType(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-900">
                {types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              <span className="text-sm text-slate-700 dark:text-slate-200">Перезаписывать существующие записи</span>
            </label>
            <button onClick={() => setStep(1)} className="w-full py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium flex items-center justify-center gap-2">
              Далее <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Выбор файла</h3>
            <div
              className={clsx("border-2 border-dashed rounded-xl p-12 text-center cursor-pointer",
                file ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-300 dark:border-slate-700")}
              onClick={() => document.getElementById("dict-file")?.click()}>
              <input id="dict-file" type="file" accept=".xlsx" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? <p className="text-sm font-medium">{file.name}</p> : <p className="text-sm text-slate-600 dark:text-slate-300">Выберите .xlsx</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm flex items-center gap-2">
                <ArrowLeft size={16} /> Назад
              </button>
              <button onClick={handleUpload} disabled={!file}
                className="flex-1 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium disabled:opacity-40 flex items-center justify-center gap-2">
                Загрузить <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && uploadData && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Лист и заголовки</h3>
            <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-900">
              {uploadData.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="number" min={1} value={headerRow} onChange={(e) => setHeaderRow(parseInt(e.target.value) || 1)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm" />
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm flex items-center gap-2">
                <ArrowLeft size={16} /> Назад
              </button>
              <button onClick={handleSelectSheet}
                className="flex-1 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium flex items-center justify-center gap-2">
                Далее <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Маппинг колонок</h3>
            <div className="space-y-3">
              {DICT_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-4">
                  <label className="w-40 text-sm text-slate-700 dark:text-slate-200">{f.label}</label>
                  <select value={mappings[f.key] ?? ""} onChange={(e) => setMappings((m) => ({ ...m, [f.key]: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-900">
                    <option value="">— не выбрано —</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm flex items-center gap-2">
                <ArrowLeft size={16} /> Назад
              </button>
              <button onClick={handleApply} disabled={processing}
                className="flex-1 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium flex items-center justify-center gap-2">
                {processing ? <><Loader2 size={18} className="animate-spin" /> Импорт...</> : <>Применить <ArrowRight size={18} /></>}
              </button>
            </div>
          </div>
        )}

        {step === 4 && result && (
          <div className="text-center space-y-6 py-4">
            <CheckCircle2 size={48} className="text-emerald-500 dark:text-emerald-400 mx-auto" />
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Импорт завершён</h3>
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-4"><p className="text-2xl font-bold">{result.created}</p><p className="text-xs text-slate-500 dark:text-slate-400">Создано</p></div>
              <div className="bg-blue-50 rounded-lg p-4"><p className="text-2xl font-bold">{result.updated}</p><p className="text-xs text-slate-500 dark:text-slate-400">Обновлено</p></div>
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4"><p className="text-2xl font-bold">{result.skipped}</p><p className="text-xs text-slate-500 dark:text-slate-400">Пропущено</p></div>
            </div>
            <button onClick={() => navigate("/admin/dictionary")}
              className="px-6 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium">К словарю</button>
          </div>
        )}
      </div>
    </div>
  );
}
