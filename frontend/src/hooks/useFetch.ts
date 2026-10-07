import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorText } from "../lib/apiError";

interface FetchState<T> {
  data: T | null;
  error: string;
  key: string | null;
}

/**
 * Загрузка данных с отменой устаревших запросов. Пока идёт новый запрос,
 * `data` хранит предыдущий ответ, а `loading` = true — страница может
 * приглушить контент, не теряя его.
 */
export function useFetch<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  fallbackError = "Не удалось загрузить данные",
) {
  const [nonce, setNonce] = useState(0);
  // Ключ запроса: меняется вместе с зависимостями (они сериализуемы).
  const key = JSON.stringify([deps, nonce]);
  const latest = useRef(fetcher);
  useEffect(() => {
    latest.current = fetcher;
  });
  const [state, setState] = useState<FetchState<T>>({
    data: null, error: "", key: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    latest.current(controller.signal).then(
      (data) => setState({ data, error: "", key }),
      (e) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          data: prev.data,
          error: apiErrorText(e, fallbackError),
          key,
        }));
      },
    );
    return () => controller.abort();
  }, [key, fallbackError]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (data: T) => setState((prev) => ({ ...prev, data })),
    [],
  );

  return {
    data: state.data,
    error: state.error,
    loading: state.key !== key,
    reload,
    setData,
  };
}
