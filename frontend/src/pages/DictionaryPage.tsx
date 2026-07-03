import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Search, Upload,
  RefreshCw, AlertTriangle, Sparkles,
} from "lucide-react";
import clsx from "clsx";
import {
  getDictTypes,
  getDictEntries,
  createDictEntry,
  deleteDictEntry,
  addDictAlias,
  deleteDictAlias,
  getDictUnrecognized,
  recanonicalizeDict,
} from "../api/client";
import type {
  DictionaryType, DictionaryEntry, UnrecognizedItem,
  RecanonicalizeResponse,
} from "../types/api";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function DictionaryPage() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<DictionaryType[]>([]);
  const [activeTab, setActiveTab] = useState("mnn");
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [newEn, setNewEn] = useState("");
  const [newRu, setNewRu] = useState("");
  const [newCanonical, setNewCanonical] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newAlias, setNewAlias] = useState("");

  const [unrecognized, setUnrecognized] = useState<UnrecognizedItem[]>([]);
  const [unrecognizedTotal, setUnrecognizedTotal] = useState(0);
  const [unrecognizedLimit, setUnrecognizedLimit] = useState(50);
  const [unrecognizedLoading, setUnrecognizedLoading] = useState(false);
  const [recanonRunning, setRecanonRunning] = useState(false);
  const [recanonResult, setRecanonResult] = useState<RecanonicalizeResponse | null>(null);

  useEffect(() => {
    getDictTypes().then((t) => {
      setTypes(t);
      if (t.length > 0) setActiveTab(t[0].type);
    });
  }, []);

  useEffect(() => {
    loadEntries();
    loadUnrecognized();
    setRecanonResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, unrecognizedLimit]);

  async function loadEntries() {
    setLoading(true);
    const data = await getDictEntries({ field_type: activeTab, search: search || undefined, limit: 200 });
    setEntries(data.rows);
    setTotal(data.total);
    setLoading(false);
  }

  const loadUnrecognized = useCallback(async () => {
    setUnrecognizedLoading(true);
    try {
      const data = await getDictUnrecognized(activeTab, unrecognizedLimit);
      setUnrecognized(data.items);
      setUnrecognizedTotal(data.total);
    } catch {
      setUnrecognized([]);
      setUnrecognizedTotal(0);
    } finally {
      setUnrecognizedLoading(false);
    }
  }, [activeTab, unrecognizedLimit]);

  async function handleRecanon() {
    if (!confirm(
      `Перегнать canonical для типа «${activeTab}»? Это обновит ` +
      `lf/mnn/producer/sector_canonical во всех уже загруженных строках.`,
    )) return;
    setRecanonRunning(true);
    try {
      const res = await recanonicalizeDict(activeTab);
      setRecanonResult(res);
      await loadUnrecognized();
      await loadEntries();
    } finally {
      setRecanonRunning(false);
    }
  }

  function handleAddFromUnrecognized(item: UnrecognizedItem) {
    setNewCanonical(item.value);
    setNewEn("");
    setNewRu("");
    setNewAliases(item.value);
    setNewNotes("");
    setShowAdd(true);
  }

  async function handleAdd() {
    if (!newEn && !newRu) return;
    await createDictEntry({
      field_type: activeTab,
      value_en: newEn || null,
      value_ru: newRu || null,
      canonical: newCanonical || null,
      aliases: newAliases.split("\n").map((s: string) => s.trim()).filter(Boolean),
      notes: newNotes || null,
    });
    setShowAdd(false);
    setNewEn(""); setNewRu(""); setNewCanonical(""); setNewAliases(""); setNewNotes("");
    loadEntries();
    loadUnrecognized();
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить запись?")) return;
    await deleteDictEntry(id);
    loadEntries();
  }

  async function handleAddAlias(entryId: number) {
    if (!newAlias.trim()) return;
    await addDictAlias(entryId, newAlias.trim());
    setNewAlias("");
    loadEntries();
  }

  async function handleDeleteAlias(aliasId: number) {
    await deleteDictAlias(aliasId);
    loadEntries();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-800">Словарь</h2>
        <div className="flex gap-2">
          <button
            onClick={handleRecanon}
            disabled={recanonRunning}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50"
            title="Перегнать canonical-поля во всех уже загруженных БДП/ПЦ/ГРЛС для этого типа"
          >
            <RefreshCw size={16} className={recanonRunning ? "animate-spin" : ""} />
            Применить к данным
          </button>
          <button onClick={() => navigate("/admin/dictionary/import")}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm flex items-center gap-2 hover:bg-slate-50">
            <Upload size={16} /> Импорт
          </button>
          <button onClick={() => setShowAdd(true)}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-indigo-700">
            <Plus size={16} /> Добавить
          </button>
        </div>
      </div>

      {recanonResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-emerald-800">
            <Sparkles size={14} /> Обновлено {recanonResult.updated_total} строк
            ({recanonResult.matched_total} распознано, {recanonResult.unmatched_total} нет)
          </div>
          <div className="mt-1 text-xs text-emerald-700 flex gap-3 flex-wrap">
            {Object.entries(recanonResult.by_source).map(([src, s]) => (
              <span key={src}>
                <strong>{src.toUpperCase()}:</strong> {s.updated}/{s.rows}
                <span className="opacity-70"> ({s.matched} ✓ / {s.unmatched} ✗)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200">
        {types.map((t) => (
          <button key={t.type} onClick={() => setActiveTab(t.type)}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === t.type ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700",
            )}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 text-sm" />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-900">
              Нераспознанные значения
            </span>
            <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-bold rounded">
              {unrecognizedTotal}
            </span>
          </div>
          <div className="text-xs text-amber-700">
            raw-значения из БДП/ПЦ/ГРЛС, которым нет соответствия в словаре
          </div>
        </div>
        {unrecognizedLoading ? (
          <div className="p-4">
            <LoadingSpinner className="h-12" />
          </div>
        ) : unrecognized.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-amber-700">
            ✓ Всё распознано
          </div>
        ) : (
          <>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-100 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium text-amber-900">Значение</th>
                    <th className="text-right px-3 py-1.5 font-medium text-amber-900 w-16">БДП</th>
                    <th className="text-right px-3 py-1.5 font-medium text-amber-900 w-16">ПЦ</th>
                    <th className="text-right px-3 py-1.5 font-medium text-amber-900 w-16">ГРЛС</th>
                    <th className="text-right px-3 py-1.5 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {unrecognized.map((item) => (
                    <tr key={item.normalized} className="border-t border-amber-100 hover:bg-amber-100/40">
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-700 truncate max-w-[280px]">
                        {item.value}
                      </td>
                      <td className={clsx("px-3 py-1.5 text-right font-medium", item.count_bdp ? "text-slate-700" : "text-slate-300")}>
                        {item.count_bdp || "—"}
                      </td>
                      <td className={clsx("px-3 py-1.5 text-right font-medium", item.count_pc ? "text-slate-700" : "text-slate-300")}>
                        {item.count_pc || "—"}
                      </td>
                      <td className={clsx("px-3 py-1.5 text-right font-medium", item.count_grls ? "text-slate-700" : "text-slate-300")}>
                        {item.count_grls || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => handleAddFromUnrecognized(item)}
                          className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 inline-flex items-center gap-1"
                        >
                          <Plus size={11} /> В словарь
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {unrecognizedTotal > unrecognizedLimit && (
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-center">
                <button
                  onClick={() => setUnrecognizedLimit((n) => n + 100)}
                  className="text-xs text-amber-800 hover:text-amber-900 font-medium"
                >
                  Показать ещё (осталось {unrecognizedTotal - unrecognizedLimit})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {loading ? <LoadingSpinner className="h-32" /> : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 w-8"></th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Canonical</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">EN</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">RU</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Aliases</th>
                <th className="text-right px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <button onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                      {expandedId === e.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{e.canonical}</td>
                  <td className="px-4 py-3 text-slate-600">{e.value_en || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{e.value_ru || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{e.aliases.length}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(e.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Нет записей</td></tr>
              )}
            </tbody>
          </table>
          {expandedId && entries.find((e) => e.id === expandedId) && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-500 mb-2">Aliases:</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {entries.find((e) => e.id === expandedId)!.aliases.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-xs">
                    {a.alias}
                    <button onClick={() => handleDeleteAlias(a.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newAlias} onChange={(e) => setNewAlias(e.target.value)}
                  placeholder="Новый alias" className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm" />
                <button onClick={() => handleAddAlias(expandedId)}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">Добавить</button>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-slate-400">Всего: {total}</p>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">Новая запись</h3>
            <input value={newEn} onChange={(e) => setNewEn(e.target.value)} placeholder="Value EN" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={newRu} onChange={(e) => setNewRu(e.target.value)} placeholder="Value RU" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={newCanonical} onChange={(e) => setNewCanonical(e.target.value)} placeholder="Canonical (авто)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <textarea value={newAliases} onChange={(e) => setNewAliases(e.target.value)} placeholder="Aliases (по одному на строку)" rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Заметки" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <div className="flex gap-3">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-slate-300 rounded-lg text-sm">Отмена</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm">Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
