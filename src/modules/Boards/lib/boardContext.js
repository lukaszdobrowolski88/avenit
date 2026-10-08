import { createContext, useContext } from 'react';

// Uprawnienia bieżącej tablicy (data.can z BoardView) dostępne w każdej komórce — w tabeli,
// w panelu zadania i w podglądzie formularza — bez przeciągania propsów przez wszystkie widoki.
// Domyślnie wszystko dozwolone (np. publiczny formularz poza BoardView ma własne zasady).
export const BoardCanContext = createContext(null);
export function useBoardCan() {
  return useContext(BoardCanContext);
}
