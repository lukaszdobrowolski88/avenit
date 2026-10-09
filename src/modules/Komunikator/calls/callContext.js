import { createContext, useContext } from 'react';

// Dwa konteksty: rzadko zmienny (przyciski, baner, wiadomości) i migawka pokoju LiveKit
// (zmienia się przy każdym mówcy — czyta ją tylko okno rozmowy).
export const CallsContext = createContext(null);
export const CallRoomContext = createContext(null);

// null poza CallProvider (np. w testach komponentów) — wtedy elementy połączeń się nie pokazują.
export const useCalls = () => useContext(CallsContext);
export const useCallRoomContext = () => useContext(CallRoomContext);
