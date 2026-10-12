// Stan rozmowy natywnej dla Reacta (silnik w engine.ts żyje poza drzewem komponentów — rozmowa
// trwa także po zamknięciu ekranu rozmowy i przy apce w tle).
import { useEffect, useState, useSyncExternalStore } from "react";
import { getCallState, subscribeCall, type CurrentCall } from "./engine";

export function useCurrentCall(): CurrentCall | null {
  return useSyncExternalStore(subscribeCall, getCallState, getCallState);
}

// Zegar rozmowy (ms od połączenia), odświeżany co sekundę tylko, gdy rozmowa trwa.
export function useCallClock(connectedAt: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!connectedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connectedAt]);
  return connectedAt ? Math.max(0, now - connectedAt) : 0;
}
