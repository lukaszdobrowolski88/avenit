import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

// Układ pulpitu w aplikacji mobilnej — per użytkownik. Zapis w user_dashboard_layouts
// (kolumna mobile_layout, migracja 075; kolumna `layout` należy do weba i jej nie ruszamy)
// + kopia w telefonie: działa od razu i offline, a gdy kolumny jeszcze nie ma na serwerze
// (przed wdrożeniem), układ zostaje lokalnie.

export type SectionId =
  | 'invitations'
  | 'pendingAccounts'
  | 'nextUp'
  | 'forYou'
  | 'modules'
  | 'events'
  | 'ministry'
  | 'tasks'
  | 'messages'
  | 'prayers'
  | 'birthdays'
  | 'overview'
  | 'absences'
  | 'online';

export interface SectionMeta {
  id: SectionId;
  label: string;
  hint: string;
  // Sekcja ma własne ustawienia elementów (co i w jakiej kolejności).
  configurable?: boolean;
}

// Kolejność = układ domyślny (taki jak przed wprowadzeniem konfiguracji).
export const SECTIONS: SectionMeta[] = [
  { id: 'invitations', label: 'Zaproszenia do służby', hint: 'Prośby o potwierdzenie służby' },
  { id: 'pendingAccounts', label: 'Konta do zatwierdzenia', hint: 'Nowe rejestracje (administratorzy)' },
  { id: 'nextUp', label: 'Najbliższe wydarzenie', hint: 'Duża karta z najbliższym wydarzeniem' },
  { id: 'forYou', label: 'Dla Ciebie', hint: 'Skróty: zadania, nieobecności, hojność…', configurable: true },
  { id: 'modules', label: 'Twoje moduły', hint: 'Kafelki modułów', configurable: true },
  { id: 'events', label: 'Wydarzenia', hint: 'Kolejne wydarzenia z kalendarza' },
  { id: 'ministry', label: 'Moja służba', hint: 'Twoje najbliższe służby' },
  { id: 'tasks', label: 'Moje zadania', hint: 'Lista zadań' },
  { id: 'messages', label: 'Wiadomości', hint: 'Nieprzeczytane rozmowy' },
  { id: 'prayers', label: 'Moje modlitwy', hint: 'Twoje prośby modlitewne' },
  { id: 'birthdays', label: 'Urodziny', hint: 'Najbliższe urodziny we wspólnocie' },
  { id: 'overview', label: 'Przegląd', hint: 'Hojność, obecność, zapisy (liderzy)' },
  { id: 'absences', label: 'Moje nieobecności', hint: 'Zgłoszone nieobecności' },
  { id: 'online', label: 'Kto jest online', hint: 'Osoby aktywne w aplikacji' },
];
const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

export interface ItemsConfig {
  // Własny wybór i kolejność. null = automatycznie (jak domyślnie).
  order: string[] | null;
  hidden: string[];
  // „Dla Ciebie”: moduły dodane jako skróty (klucze `mod:<moduł>`; domyślnie żadne).
  added?: string[];
}

export interface DashboardLayout {
  v: 1;
  sections: { id: SectionId; visible: boolean }[];
  forYou: ItemsConfig;
  modules: ItemsConfig;
}

export const DEFAULT_LAYOUT: DashboardLayout = {
  v: 1,
  sections: SECTIONS.map((s) => ({ id: s.id, visible: true })),
  forYou: { order: null, hidden: [] },
  modules: { order: null, hidden: [] },
};

const asItems = (raw: any): ItemsConfig => ({
  order: Array.isArray(raw?.order) ? raw.order.map(String) : null,
  hidden: Array.isArray(raw?.hidden) ? raw.hidden.map(String) : [],
  added: Array.isArray(raw?.added) ? raw.added.map(String) : [],
});

// Zapisany układ + nowe sekcje (dodane w kolejnych wersjach apki) wstawione tam, gdzie są
// w układzie domyślnym; nieznane sekcje pomijamy.
export const normalizeLayout = (raw: any): DashboardLayout => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections)) return DEFAULT_LAYOUT;
  const saved = (raw.sections as any[])
    .filter((s) => s && SECTION_IDS.has(s.id))
    .map((s) => ({ id: s.id as SectionId, visible: s.visible !== false }));
  const seen = new Set(saved.map((s) => s.id));
  const out = saved.filter((s, i) => saved.findIndex((x) => x.id === s.id) === i);
  SECTIONS.forEach((s, defaultIndex) => {
    if (seen.has(s.id)) return;
    // Wstaw po najbliższej poprzedzającej (w układzie domyślnym) sekcji, która już jest.
    let at = 0;
    for (let i = defaultIndex - 1; i >= 0; i -= 1) {
      const pos = out.findIndex((x) => x.id === SECTIONS[i].id);
      if (pos >= 0) {
        at = pos + 1;
        break;
      }
    }
    out.splice(at, 0, { id: s.id, visible: true });
  });
  return { v: 1, sections: out, forYou: asItems(raw.forYou), modules: asItems(raw.modules) };
};

const localKey = (email: string) => `avenit.dashboard-layout.${email.toLowerCase()}`;
const isMissingColumn = (e: any) => e?.code === '42703' || /mobile_layout/i.test(String(e?.message ?? ''));

export const useDashboardLayout = (email: string | null) =>
  useQuery({
    queryKey: ['dashboard-layout', email],
    enabled: !!email,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DashboardLayout> => {
      const local = await AsyncStorage.getItem(localKey(email!)).catch(() => null);
      const { data, error } = await supabase.from('user_dashboard_layouts').select('mobile_layout').eq('user_email', email!).maybeSingle();
      if (!error && (data as any)?.mobile_layout) return normalizeLayout((data as any).mobile_layout);
      if (local) {
        try {
          return normalizeLayout(JSON.parse(local));
        } catch {
          /* uszkodzona kopia — domyślny */
        }
      }
      return DEFAULT_LAYOUT;
    },
  });

export const useSaveDashboardLayout = (email: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (layout: DashboardLayout) => {
      if (!email) return;
      await AsyncStorage.setItem(localKey(email), JSON.stringify(layout)).catch(() => undefined);
      const { error } = await (supabase.from('user_dashboard_layouts') as any).upsert(
        { user_email: email, mobile_layout: layout },
        { onConflict: 'user_email' },
      );
      // Przed wdrożeniem migracji 075 kolumny nie ma — zostaje kopia w telefonie.
      if (error && !isMissingColumn(error)) throw error;
    },
    onMutate: async (layout) => {
      qc.setQueryData(['dashboard-layout', email], layout);
    },
  });
};
