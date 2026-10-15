import {
  createContext, useCallback, useContext, useEffect, useState,
} from "react";
import { getSession } from "../api/client";
import type { SessionUser } from "../types/api";

export interface SessionState {
  user: SessionUser | null;
  /** Первый ответ сервера ещё не пришёл: показывать ни форму, ни приложение. */
  pending: boolean;
  reload: () => void;
  clear: () => void;
  /** Положить пользователя сразу из ответа входа, без лишнего запроса. */
  set: (user: SessionUser) => void;
  can: (permission: string) => boolean;
}

export const SessionContext = createContext<SessionState>({
  user: null,
  pending: true,
  reload: () => {},
  clear: () => {},
  set: () => {},
  can: () => false,
});

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** Состояние сессии для провайдера в App. */
export function useSessionState(): SessionState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [pending, setPending] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const clear = useCallback(() => setUser(null), []);
  const set = useCallback((u: SessionUser) => {
    setUser(u);
    setPending(false);
  }, []);

  // Право `*` у роли означает полный доступ: так устроен словарь на бекенде,
  // и фронтенд обязан понимать его одинаково, иначе интерфейс спрячет то,
  // что сервер разрешает.
  const can = useCallback(
    (permission: string) =>
      !!user
      && (user.permissions.includes("*")
        || user.permissions.includes(permission)),
    [user],
  );

  return { user, pending, reload, clear, set, can };
}
