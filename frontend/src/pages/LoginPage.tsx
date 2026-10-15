import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { login } from "../api/client";
import { apiErrorText } from "../lib/apiError";
import { useSession } from "../hooks/useSession";
import { Logo } from "../components/layout/Logo";

/**
 * Поле тепловых ячеек на фоне — тот же язык, что в «Направлениях» и «Странах
 * производства». Значения детерминированы: сетка не должна мерцать при
 * перерисовке, а на странице входа перерисовок хватает (ввод, ошибка, Caps
 * Lock).
 */
const CELLS = 900;

/** Детерминированный шум от индекса: чистая функция, без счётчика. */
function noise(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function useCells() {
  return useMemo(
    () => Array.from({ length: CELLS }, (_, i) => {
      // Немного ярких ячеек на спокойном поле — так читается распределение,
      // а не равномерная текстура.
      const strong = noise(i, 1) > 0.93;
      return {
        opacity: strong
          ? 0.1 + noise(i, 2) * 0.12
          : 0.012 + noise(i, 3) * 0.045,
        lime: strong && noise(i, 4) > 0.72,
      };
    }),
    [],
  );
}

export default function LoginPage() {
  const cells = useCells();
  const { set: setSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  // Адрес возврата приходит двумя путями: через state от Guard при переходе
  // внутри приложения и через query от перехватчика 401, который делает
  // жёсткий redirect и state сохранить не может.
  const from = (location.state as { from?: string } | null)?.from
    ?? new URLSearchParams(location.search).get("from")
    ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Пользователь кладётся в контекст сразу: иначе Guard, который решает
      // по контексту, увидит ещё null и вернёт обратно на форму.
      setSession(await login(username.trim(), password));
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiErrorText(err, "Не удалось войти. Попробуйте ещё раз."));
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-(--screen-h) items-center justify-center overflow-hidden bg-ink px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grid auto-rows-[34px] grid-cols-[repeat(auto-fill,minmax(42px,1fr))] gap-1.5 overflow-hidden p-1.5"
      >
        {cells.map((c, i) => (
          <span
            key={i}
            className="rounded-md"
            style={{
              background: c.lime ? "#c5f135" : "#fff",
              opacity: c.opacity,
            }}
          />
        ))}
      </div>
      {/* Поле ячеек гасится к центру, чтобы карточка стояла на спокойном
          фоне. Линейные переходы сверху и снизу вместо эллипса: эллипс
          оставлял видимое кольцо на краю. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom,"
            + " oklch(0.26 0.075 268 / 0.25) 0%,"
            + " oklch(0.26 0.075 268 / 0.88) 42%,"
            + " oklch(0.26 0.075 268 / 0.88) 58%,"
            + " oklch(0.26 0.075 268 / 0.25) 100%)",
        }}
      />

      <div className="anim-rise relative flex w-full max-w-[380px] flex-col items-center gap-7">
        <Logo />

        <form
          onSubmit={submit}
          className="flex w-full flex-col gap-4 rounded-card bg-surface px-7 py-7 shadow-pop"
        >
          <h1 className="m-0 text-xl font-semibold tracking-[-0.02em]">
            Вход
          </h1>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">Логин</span>
            <input
              ref={userRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              required
              className="tr-soft h-11 rounded-ctl border border-seg bg-surface px-3.5 text-sm text-fg outline-none placeholder:text-faintest hover:border-line-strong focus:border-accent focus:ring-3 focus:ring-accent-tint"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">Пароль</span>
            <span className="relative flex items-center">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
                onBlur={() => setCaps(false)}
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                className="tr-soft h-11 w-full rounded-ctl border border-seg bg-surface pl-3.5 pr-11 text-sm text-fg outline-none hover:border-line-strong focus:border-accent focus:ring-3 focus:ring-accent-tint"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
                className="tr-soft absolute right-1 flex size-9 items-center justify-center rounded-lg border-0 bg-transparent text-faint hover:bg-subtle hover:text-muted"
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
            {caps && (
              <span className="text-xs text-[#b4541f]">
                Включён Caps Lock
              </span>
            )}
          </label>

          {error && (
            <span
              role="alert"
              className="rounded-ctl bg-neg-tint px-3 py-2 text-[13px] text-neg"
            >
              {error}
            </span>
          )}

          <button
            type="submit"
            disabled={busy}
            className="tr-soft mt-1 h-11 rounded-ctl border-0 bg-ink text-sm font-semibold text-white hover:bg-ink-hover focus-visible:ring-3 focus-visible:ring-accent-soft disabled:cursor-default disabled:opacity-60"
          >
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
      </div>
    </main>
  );
}
