import { useCallback, useEffect, useRef, useState } from 'react';

// Stan „odświeżam” dla RefreshControl — TYLKO dla odświeżenia, które osoba wywołała gestem.
//
// Dawniej ekrany podpinały `refreshing={isRefetching}`. isRefetching (TanStack) jest true także
// przy KAŻDYM odświeżeniu w tle: powrót apki na wierzch (invalidate ['conversations']), realtime,
// powrót na ekran. Na iOS programowe refreshing=true wysuwa duży kręciołek nad listą i spycha
// treść w dół, a szybkie przełączenie true→false (zanim animacja się skończy) zostawia go na
// stałe — tak „wisiał” wskaźnik na liście rozmów. Odświeżenie w tle nie potrzebuje wskaźnika.
export function usePullRefresh(refetch: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const fnRef = useRef(refetch);
  fnRef.current = refetch;
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fnRef.current();
    } catch {
      // błąd pokaże sam ekran (isError) — tu tylko chowamy wskaźnik
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, []);
  return { refreshing, onRefresh };
}
