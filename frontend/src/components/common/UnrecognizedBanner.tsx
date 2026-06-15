import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Check, Plus, X } from "lucide-react";
import { suggestDict, addDictAlias, createDictEntry } from "../../api/client";
import type { DictionarySuggestion } from "../../types/api";

const DICT_LABELS: Record<string, string> = {
  mnn: "МНН",
  lf: "Лекарственные формы",
  producer: "Производители",
  sector: "Сектор",
};

type Action = "accept" | "create" | "skip" | null;

export default function UnrecognizedBanner({
  fieldType,
  values,
  onResolved,
}: {
  fieldType: string;
  values: string[];
  onResolved?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [suggestions, setSuggestions] = useState<DictionarySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [actions, setActions] = useState<Record<number, Action>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (expanded && suggestions.length === 0) {
      setLoading(true);
      suggestDict(fieldType, values)
        .then(setSuggestions)
        .finally(() => setLoading(false));
    }
  }, [expanded]);

  function setAction(idx: number, action: Action) {
    setActions((prev) => ({ ...prev, [idx]: action }));
  }

  async function handleApplyAll() {
    setApplying(true);
    try {
      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        const action = actions[i];
        if (action === "accept" && s.suggestion_entry_id) {
          await addDictAlias(s.suggestion_entry_id, s.value);
        } else if (action === "create") {
          const hasRu = /[а-яА-ЯёЁ]/.test(s.value);
          await createDictEntry({
            field_type: fieldType,
            value_en: hasRu ? null : s.value,
            value_ru: hasRu ? s.value : null,
          });
        }
      }
      onResolved?.();
    } finally {
      setApplying(false);
    }
  }

  const resolvedCount = Object.values(actions).filter((a) => a && a !== "skip").length;

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-amber-800 w-full"
      >
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        <span>
          {values.length} неопознанных значений в поле «{DICT_LABELS[fieldType] || fieldType}»
        </span>
      </button>

      {expanded && (
        <div className="mt-3">
          {loading ? (
            <p className="text-sm text-amber-600">Загрузка подсказок...</p>
          ) : (
            <>
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-xs text-amber-700 border-b border-amber-200">
                    <th className="text-left py-2 pr-2">Значение</th>
                    <th className="text-left py-2 pr-2">Подсказка</th>
                    <th className="text-right py-2">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s, idx) => (
                    <tr key={idx} className="border-b border-amber-100 last:border-0">
                      <td className="py-2 pr-2 text-slate-700">{s.value}</td>
                      <td className="py-2 pr-2">
                        {s.suggestion ? (
                          <span className="text-slate-700">
                            {s.suggestion}
                            <span className="text-xs text-amber-600 ml-1">
                              ({(s.similarity * 100).toFixed(0)}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">нет совпадений</span>
                        )}
                      </td>
                      <td className="py-2 text-right space-x-1">
                        {actions[idx] ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">
                            {actions[idx] === "accept" && "Принять"}
                            {actions[idx] === "create" && "Создать"}
                            {actions[idx] === "skip" && "Пропустить"}
                            <button onClick={() => setAction(idx, null)} className="ml-1 hover:text-red-500">
                              <X size={12} />
                            </button>
                          </span>
                        ) : (
                          <>
                            {s.suggestion_entry_id && (
                              <button
                                onClick={() => setAction(idx, "accept")}
                                className="text-xs text-emerald-700 hover:underline px-1"
                                title="Добавить как alias к подсказке"
                              >
                                <Check size={14} className="inline" /> Принять
                              </button>
                            )}
                            <button
                              onClick={() => setAction(idx, "create")}
                              className="text-xs text-indigo-700 hover:underline px-1"
                              title="Создать новую запись в словаре"
                            >
                              <Plus size={14} className="inline" /> Создать
                            </button>
                            <button
                              onClick={() => setAction(idx, "skip")}
                              className="text-xs text-slate-500 hover:underline px-1"
                            >
                              Пропустить
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {resolvedCount > 0 && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-amber-700">
                    {resolvedCount} из {suggestions.length} выбрано
                  </span>
                  <button
                    onClick={handleApplyAll}
                    disabled={applying}
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {applying ? "Применяю..." : "Применить всё"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
