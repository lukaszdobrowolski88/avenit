import { useCallback, useEffect, useRef, useState } from 'react';

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  v != null && typeof (v as { then?: unknown }).then === 'function';

// Blokada podwójnego zapisu (jak Button na webie): gdy `onPress` zwraca Promise (np. async
// handler zapisu), przycisk jest zajęty do jego rozstrzygnięcia — kolejne stuknięcia są
// ignorowane (także dwa w tej samej klatce, zanim React przerysuje — stąd ref obok stanu).
// `busy` = jawny `loading` wywołującego LUB własna blokada. Błąd obsługuje wywołujący.
//
//   const { busy, press } = useAsyncPress(onPress, loading);
//   <Pressable onPress={press} disabled={busy || disabled}>…
export const useAsyncPress = <A extends unknown[]>(
  onPress: ((...args: A) => unknown) | undefined,
  loading?: boolean,
) => {
  const [autoBusy, setAutoBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const press = useCallback(
    (...args: A) => {
      if (!onPress || lock.current || loading) return;
      const result = onPress(...args);
      if (isThenable(result)) {
        lock.current = true;
        setAutoBusy(true);
        const release = () => {
          lock.current = false;
          if (mounted.current) setAutoBusy(false);
        };
        Promise.resolve(result).then(release, release);
      }
    },
    [onPress, loading],
  );

  return { busy: !!loading || autoBusy, press };
};
