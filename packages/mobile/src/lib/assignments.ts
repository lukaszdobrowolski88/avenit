import { supabase } from './supabase';

// Odpowiedź na własne zaproszenie do służby — JEDNĄ drogą, jak web i link z maila:
// POST /api/assignment/:id/respond (zalogowany, tylko własny wiersz). Odrzucenie zdejmuje
// imię z grafiku w tej samej transakcji po stronie serwera (członek nie ma prawa edytować
// wydarzenia, więc bezpośredni update schedule_assignments kończył się 403 albo „duchem”).
//
//   const r = await respondToAssignment(id, 'accepted');   // rzuca błąd z { status } przy porażce
//   if (r.already) toast.info('Na ten przydział odpowiedziano już wcześniej.');

export type AssignmentAnswer = 'accepted' | 'rejected';

export interface RespondResult {
  status: string | null;
  // Odpowiedziano już wcześniej (np. z maila) — nic się nie zmieniło.
  already: boolean;
}

export const respondToAssignment = async (id: string | number, answer: AssignmentAnswer): Promise<RespondResult> => {
  const res: Response = await (supabase as any)._request(`/api/assignment/${encodeURIComponent(String(id))}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: answer === 'accepted' ? 'accept' : 'reject' }),
  });
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* pusta odpowiedź */
  }
  if (!res.ok) {
    const message =
      res.status === 404
        ? 'Nie znaleziono tego przydziału — mógł zostać zmieniony przez lidera.'
        : payload?.error || `HTTP ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return { status: payload?.status ?? null, already: !!payload?.already };
};

// Komunikaty po udanej odpowiedzi — te same co na webie (widżet „Moja służba”).
export const respondMessage = (answer: AssignmentAnswer, r: RespondResult) =>
  r.already
    ? 'Na ten przydział odpowiedziano już wcześniej.'
    : answer === 'accepted'
      ? 'Dziękujemy! Twój dyżur jest potwierdzony.'
      : 'Dziękujemy za informację. Usunęliśmy Cię z grafiku.';
