import { useState } from "react";
import {
  Calendar, Globe, Pill, Factory, Tag, ShieldCheck,
  DollarSign, Check, X, Edit3,
} from "lucide-react";
import clsx from "clsx";
import { updateMarketFx } from "../../api/client";
import type { OverviewHeader as HeaderData } from "../../types/api";
import type React from "react";

interface Props {
  header: HeaderData;
  onFxUpdated: () => void;
}

export default function OverviewHeader({ header, onFxUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    header.fx_rate_usd_rub?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const value = parseFloat(draft.replace(",", "."));
    if (!isFinite(value) || value <= 0) {
      setError("Курс должен быть положительным числом");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateMarketFx(header.market_id, {
        fx_rate_usd_rub: value,
      });
      setEditing(false);
      onFxUpdated();
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-800">
            {header.name}
          </h2>
          <div className="mt-2 flex items-center gap-x-4 gap-y-1.5 text-sm text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {header.years.join(", ")}
            </span>
            {header.regions.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Globe size={14} />
                {header.regions.length} регион(ов)
              </span>
            )}
            <span className="uppercase tracking-wide text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100">
              {header.language}
            </span>
            <span className="flex items-center gap-1.5" title="Курс USD/RUB">
              <DollarSign size={14} className="text-slate-400" />
              {!editing ? (
                <>
                  <span className="font-semibold text-slate-700 tabular-nums">
                    USD/RUB {header.fx_rate_usd_rub != null
                      ? header.fx_rate_usd_rub.toFixed(2)
                      : "—"}
                  </span>
                  {header.fx_rate_date && (
                    <span className="text-[11px] text-slate-400">
                      от {header.fx_rate_date}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setDraft(header.fx_rate_usd_rub?.toString() ?? "");
                      setError("");
                      setEditing(true);
                    }}
                    aria-label="Изменить курс USD/RUB"
                    className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                  >
                    <Edit3 size={12} />
                  </button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") save();
                      if (e.key === "Escape") { setEditing(false); setError(""); }
                    }}
                    aria-label="Новый курс USD/RUB"
                    className="w-20 px-2 py-0.5 text-sm font-semibold tabular-nums bg-white border border-slate-300 rounded focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                  <button
                    onClick={save}
                    disabled={saving}
                    aria-label="Сохранить курс"
                    className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => { setEditing(false); setError(""); }}
                    aria-label="Отменить"
                    className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </span>
          </div>
          {error && (
            <p className="text-xs text-red-600 mt-1">{error}</p>
          )}
          <div className="mt-3 flex gap-1.5">
            <SourceBadge label="БДП" active={header.has_bdp} />
            <SourceBadge label="РС" active={header.has_pc} />
            <SourceBadge label="ГРЛС" active={header.has_grls} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Counter icon={Pill} label="МНН" value={header.mnn_count} />
        <Counter
          icon={Factory}
          label="Производителей"
          value={header.producer_count}
        />
        <Counter icon={Tag} label="ТМ" value={header.tm_count} />
        <Counter
          icon={ShieldCheck}
          label="Активных РУ"
          value={header.grls_active_count}
        />
        <Counter
          icon={DollarSign}
          label="Записей в РС"
          value={header.pc_rows_count}
        />
      </div>
    </div>
  );
}

function SourceBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={clsx(
        "px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide",
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-400",
      )}
    >
      {label} {active ? "✓" : "—"}
    </span>
  );
}

function Counter({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
      <Icon size={20} className="text-indigo-500 flex-shrink-0" />
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-800">
          {value.toLocaleString("ru-RU")}
        </p>
      </div>
    </div>
  );
}
