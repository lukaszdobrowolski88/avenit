import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantWebBase } from '../../lib/supabase';
import { todayYmd } from '../schedule/assignments';
import { eventIncludesTeam, parseTypeRules } from './grafik';
import type { TeamConfig, TeamKey } from './config';

// Dane zakładek zespołu — kontrakt 1:1 z webem (src/modules/shared/*Tab.jsx).

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

const asList = (data: unknown) => ((data ?? []) as any[]);

// ─── Wydarzenia ────────────────────────────────────────────────────────────────

export interface TeamEvent {
  id: string;
  title: string;
  description: string | null;
  date: string; // YYYY-MM-DD
  time: string | null;
  endTime: string | null;
  location: string | null;
  eventType: string | null;
  moduleKey: string | null;
  maxParticipants: number | null;
  archived: boolean;
  createdBy: string | null;
}

// Wydarzenia działają też dla modułów z kreatora (klucz spoza TeamKey).
export type EventsCfg = { key: string; eventsTable: 'events' | 'mlodziezowka_events' };

export interface TeamEventsData {
  own: TeamEvent[]; // własne wydarzenia modułu (events.module_key = moduł)
  serving: TeamEvent[]; // „Służymy na” — nadchodzące wydarzenia innych kalendarzy, w których służy ten zespół
}

const toTeamEvent = (e: any, today: string): TeamEvent => {
  const date = String(e.date ?? '').slice(0, 10);
  return {
    id: String(e.id),
    title: e.title || 'Wydarzenie',
    description: e.description ?? null,
    date,
    time: e.time ? String(e.time).slice(0, 5) : null,
    endTime: e.end_time ? String(e.end_time).slice(0, 5) : null,
    location: e.location ?? null,
    eventType: e.event_type ?? null,
    moduleKey: e.module_key ?? null,
    maxParticipants: e.max_participants ?? null,
    archived: !!e.is_archived || (!!date && date < today),
    createdBy: e.created_by ?? null,
  };
};
const byStart = (a: TeamEvent, b: TeamEvent) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''));

// Zakładka „Wydarzenia” jak web (src/modules/shared/EventsTab.jsx): własne wydarzenia modułu
// + „Służymy na” — wydarzenia z innych kalendarzy, w których ta służba służy (ten sam predykat
// co Grafik: eventIncludesTeam). Dawniej był tu tylko module_key, więc zakładka mówiła „Brak
// wydarzeń”, a Grafik pokazywał nabożeństwa — i zachęcała do tworzenia duplikatów.
// Archiwalne = oznaczone albo minione (EventsTab.jsx isArchivedEvent).
export const useTeamEvents = (cfg: EventsCfg, scope: CampusScope) =>
  useQuery({
    queryKey: ['team', cfg.key, 'events', scope.selectedCampusId],
    queryFn: async (): Promise<TeamEventsData> => {
      const today = todayYmd();
      const cols = 'id, title, description, date, time, end_time, location, event_type, module_key, max_participants, is_archived, created_by, assignments, team_types';
      const [ownRes, upcomingRes, rulesRes] = await Promise.all([
        scope.withCampusFilter(supabase.from('events').select(cols)).eq('module_key', cfg.key).order('date', { ascending: true }),
        scope.withCampusFilter(supabase.from('events').select(cols)).gte('date', today).order('date', { ascending: true }).limit(400),
        supabase.from('app_settings').select('value').eq('key', 'event_type_teams').maybeSingle(),
      ]);
      if (ownRes.error) throw ownRes.error;
      const rules = parseTypeRules((rulesRes as any)?.data?.value);
      const own = asList(ownRes.data).map((e) => toTeamEvent(e, today)).sort(byStart);
      // Błąd drugiego zapytania nie ukrywa własnych wydarzeń — sekcja „Służymy na” jest dodatkiem.
      const serving = upcomingRes.error
        ? []
        : asList(upcomingRes.data)
            .filter((e) => (e.module_key || '') !== cfg.key && eventIncludesTeam(e, cfg.key, rules))
            .map((e) => toTeamEvent(e, today))
            .filter((e) => !e.archived)
            .sort(byStart);
      return { own, serving };
    },
  });

// Etykieta typu jak web (EventsListView.eventTypeLabel): z konfiguracji, potem domyślna,
// potem surowa wartość wielką literą — nigdy „nabozesnstwo” na karcie.
const DEFAULT_TYPE_LABELS: Record<string, string> = {
  spotkanie: 'Spotkanie',
  wydarzenie: 'Wydarzenie',
  szkolenie: 'Szkolenie',
  inne: 'Inne',
  'nabożeństwo': 'Nabożeństwo',
  nabozenstwo: 'Nabożeństwo',
  nabozesnstwo: 'Nabożeństwo',
  proba: 'Próba',
  koncert: 'Koncert',
  warsztat: 'Warsztat',
  produkcja: 'Produkcja',
  streaming: 'Streaming',
  integracja: 'Integracja',
  zajecia: 'Zajęcia',
  wycieczka: 'Wycieczka',
  przedstawienie: 'Przedstawienie',
  wyjazd: 'Wyjazd',
};
export const eventTypeLabel = (value: string | null | undefined, options: { key: string; label: string }[] = []) => {
  if (!value) return '';
  const hit = options.find((o) => o.key === value);
  if (hit?.label) return hit.label;
  const def = DEFAULT_TYPE_LABELS[String(value).toLowerCase()];
  if (def) return def;
  const s = String(value);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Walidacja jak web (EventsModule.validateNewEvent): tytuł, data, koniec po początku.
export interface EventFormErrors {
  title?: string;
  date?: string;
  endTime?: string;
}
export const validateEventForm = (f: { title: string; date: string; time: string | null; endTime: string | null }): EventFormErrors => {
  const e: EventFormErrors = {};
  if (!f.title.trim()) e.title = 'Podaj tytuł wydarzenia.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) e.date = 'Wybierz datę — bez niej wydarzenie nie trafi do kalendarza.';
  if (f.time && f.endTime && f.endTime.slice(0, 5) <= f.time.slice(0, 5)) e.endTime = 'Koniec musi być później niż początek.';
  return e;
};

export interface EventTypeOption {
  key: string;
  label: string;
  color?: string;
}

// Domyślne typy jak web MINISTRY_CONFIG (src/hooks/useModuleLabel.js).
const DEFAULT_EVENT_TYPES: Record<TeamKey, EventTypeOption[]> = {
  worship: [
    { key: 'proba', label: 'Próba' },
    { key: 'koncert', label: 'Koncert' },
    { key: 'nabozesnstwo', label: 'Nabożeństwo' },
    { key: 'warsztat', label: 'Warsztat' },
    { key: 'inne', label: 'Inne' },
  ],
  media: [
    { key: 'produkcja', label: 'Produkcja' },
    { key: 'szkolenie', label: 'Szkolenie' },
    { key: 'streaming', label: 'Streaming' },
    { key: 'inne', label: 'Inne' },
  ],
  atmosfera: [
    { key: 'spotkanie', label: 'Spotkanie' },
    { key: 'szkolenie', label: 'Szkolenie' },
    { key: 'integracja', label: 'Integracja' },
    { key: 'inne', label: 'Inne' },
  ],
  kids: [
    { key: 'zajecia', label: 'Zajęcia' },
    { key: 'wycieczka', label: 'Wycieczka' },
    { key: 'warsztat', label: 'Warsztat' },
    { key: 'przedstawienie', label: 'Przedstawienie' },
    { key: 'inne', label: 'Inne' },
  ],
  mlodziezowka: [
    { key: 'spotkanie', label: 'Spotkanie' },
    { key: 'wyjazd', label: 'Wyjazd' },
    { key: 'warsztat', label: 'Warsztat' },
    { key: 'inne', label: 'Inne' },
  ],
  homegroups: [
    { key: 'spotkanie', label: 'Spotkanie' },
    { key: 'integracja', label: 'Integracja' },
    { key: 'szkolenie', label: 'Szkolenie' },
    { key: 'inne', label: 'Inne' },
  ],
};

// Typy z ustawień kościoła (app_settings.module_calendar[key].types) — jak web.
const GENERIC_EVENT_TYPES: EventTypeOption[] = [
  { key: 'spotkanie', label: 'Spotkanie' },
  { key: 'wydarzenie', label: 'Wydarzenie' },
  { key: 'inne', label: 'Inne' },
];

export const useEventTypes = (key: string) =>
  useQuery({
    queryKey: ['team', key, 'event-types'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EventTypeOption[]> => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'module_calendar').maybeSingle();
      try {
        const raw = (data as any)?.value;
        const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const types = cfg?.[key]?.types;
        if (Array.isArray(types) && types.length) {
          return types.map((t: any) => ({ key: String(t.value), label: String(t.label ?? t.value), color: t.color }));
        }
      } catch {
        /* zostaje domyślne */
      }
      return DEFAULT_EVENT_TYPES[key as TeamKey] ?? GENERIC_EVENT_TYPES;
    },
  });

export interface NewTeamEventInput {
  title: string;
  description: string | null;
  eventType: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  endTime: string | null; // HH:MM
  location: string | null;
  authorEmail: string;
}

// Nowe wydarzenie zespołu — kształt jak EventsTab.jsx (date/time osobno + module_key). Zapis
// sprawdzany (.select) — zwraca id; walidacja jak na webie, także tu (ostatnia linia obrony).
export const useCreateTeamEvent = (cfg: EventsCfg, campusIdForInsert: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTeamEventInput): Promise<string> => {
      const errs = validateEventForm(input);
      const first = errs.title ?? errs.date ?? errs.endTime;
      if (first) throw new Error(first);
      const { data, error } = await (supabase.from('events') as any)
        .insert({
          title: input.title.trim(),
          description: input.description,
          location: input.location,
          event_type: input.eventType,
          module_key: cfg.key,
          date: input.date,
          time: input.time || null,
          end_time: input.endTime || null,
          created_by: input.authorEmail,
          campus_id: campusIdForInsert,
        })
        .select('id')
        .single();
      if (error) throw error;
      if (!data) throw new Error('Nie udało się zapisać wydarzenia. Spróbuj ponownie.');
      return String((data as any).id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['agenda'] });
    },
  });
};

// Usunięcie wydarzenia. Przydziały w grafiku i materiały wydarzenia sprząta baza (klucze obce
// ON DELETE CASCADE, migracja 083) — bez „duchów” w „Mojej służbie”. Sprawdzamy, że wiersz
// faktycznie zniknął (zakres kampusu/właściciela może dać 0 usuniętych bez błędu).
export const useDeleteTeamEvent = (cfg: EventsCfg) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase.from(cfg.eventsTable) as any).delete().eq('id', id).select('id');
      if (error) throw error;
      if (Array.isArray(data) && data.length === 0) {
        throw new Error('Nie udało się usunąć wydarzenia — mogło zostać już usunięte albo nie masz do niego uprawnień.');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['event-detail'] });
      qc.invalidateQueries({ queryKey: ['agenda'] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

// Zapisy „Będę” (event_registrations) — jak EventsTab.jsx:471-491.
export const useEventGoing = (eventIds: string[], myEmail: string | null) =>
  useQuery({
    queryKey: ['team', 'going', eventIds.join(','), myEmail],
    enabled: eventIds.length > 0,
    queryFn: async (): Promise<Record<string, { count: number; mine: boolean }>> => {
      const { data } = await supabase
        .from('event_registrations')
        .select('event_id, user_email, status')
        .in('event_id', eventIds);
      const out: Record<string, { count: number; mine: boolean }> = {};
      for (const r of asList(data)) {
        if (r.status === 'not_going') continue;
        const k = String(r.event_id);
        const cur = out[k] ?? { count: 0, mine: false };
        cur.count += 1;
        if (myEmail && r.user_email === myEmail) cur.mine = true;
        out[k] = cur;
      }
      return out;
    },
  });

export const useToggleGoing = (myEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, going }: { eventId: string; going: boolean }) => {
      if (!myEmail) throw new Error('Brak zalogowanego konta');
      if (going) {
        const { error } = await supabase
          .from('event_registrations')
          .delete()
          .eq('event_id', eventId)
          .eq('user_email', myEmail);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('event_registrations') as any).insert([
          { event_id: eventId, user_email: myEmail, full_name: myEmail.split('@')[0], status: 'going' },
        ]);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', 'going'] }),
  });
};

// ─── Członkowie / liderzy / służby ─────────────────────────────────────────────

export interface TeamPerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isLeader: boolean;
  groupName: string | null;
  roles: string[]; // nazwy służb z team_member_roles
}

export const useTeamPeople = (table: string | undefined, withRolesFor?: string) =>
  useQuery({
    queryKey: ['team', 'people', table, withRolesFor ?? ''],
    enabled: !!table,
    queryFn: async (): Promise<TeamPerson[]> => {
      if (!table) return [];
      const { data, error } = await supabase.from(table).select('*').order('full_name', { ascending: true });
      if (error) throw error;
      const rows = asList(data);

      // Grupy domowe: nazwa grupy po group_id (bez relacji w API).
      const groupName = new Map<string, string>();
      if (table.startsWith('home_group')) {
        const { data: groups } = await supabase.from('home_groups').select('id, name');
        for (const g of asList(groups)) groupName.set(String(g.id), String(g.name));
      }

      // Służby (team_member_roles → team_roles) dla tabel zespołów.
      const rolesByMember = new Map<string, string[]>();
      if (withRolesFor) {
        const [{ data: tmr }, { data: tr }] = await Promise.all([
          supabase.from('team_member_roles').select('member_id, role_id').eq('member_table', table),
          supabase.from('team_roles').select('id, name').eq('team_type', withRolesFor).eq('is_active', true),
        ]);
        const roleName = new Map<string, string>(asList(tr).map((r) => [String(r.id), String(r.name)]));
        for (const x of asList(tmr)) {
          const n = roleName.get(String(x.role_id));
          if (!n) continue;
          const list = rolesByMember.get(String(x.member_id)) ?? [];
          list.push(n);
          rolesByMember.set(String(x.member_id), list);
        }
      }

      return rows
        .filter((r) => r.is_active !== false)
        .map((r) => ({
          id: String(r.id),
          name: String(r.full_name || r.user_name || r.email || '—'),
          email: r.email ?? r.user_email ?? null,
          phone: r.phone ?? null,
          role: r.role ?? null,
          isLeader: !!(r.is_leader || r.is_primary),
          groupName: r.group_id != null ? groupName.get(String(r.group_id)) ?? null : null,
          roles: rolesByMember.get(String(r.id)) ?? [],
        }));
    },
  });

// ─── Wyposażenie (EquipmentTab.jsx) ────────────────────────────────────────────

export interface EquipmentItem {
  id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  quantity: number;
  unitValue: number | null;
  condition: string | null;
  responsible: string | null;
  location: string | null;
  purchaseDate: string | null;
  notes: string | null;
}

export const useTeamEquipment = (key: string, enabled = true) =>
  useQuery({
    queryKey: ['team', key, 'equipment'],
    enabled,
    queryFn: async (): Promise<EquipmentItem[]> => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('team_type', key)
        .order('name', { ascending: true });
      if (error) throw error;
      return asList(data).map((e) => ({
        id: String(e.id),
        name: String(e.name ?? '—'),
        description: e.description ?? null,
        photoUrl: e.photo_url ?? null,
        quantity: Number(e.quantity) || 1,
        unitValue: e.unit_value != null ? Number(e.unit_value) : e.purchase_price != null ? Number(e.purchase_price) : null,
        condition: e.condition ?? null,
        responsible: e.responsible_person ?? null,
        location: e.location ?? null,
        purchaseDate: e.purchase_date ? String(e.purchase_date).slice(0, 10) : null,
        notes: e.notes ?? null,
      }));
    },
  });

// ─── Finanse (FinanceTab.jsx + finance/money.js na webie) ─────────────────────

export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected' | null;

export interface BudgetLine {
  id: string;
  description: string;
  category: string | null;
  planned: number;
  spent: number; // tylko zatwierdzone/opłacone
}
export interface Expense {
  id: string;
  date: string | null;
  amount: number;
  contractor: string | null;
  description: string | null;
  detailed: string | null;
  hasDocuments: boolean;
  status: ExpenseStatus;
  category: string | null;
}
export interface TeamFinance {
  year: number;
  lines: BudgetLine[];
  expenses: Expense[];
  planned: number;
  spent: number; // wykorzystanie budżetu = zatwierdzone/opłacone wydatki pozycji
  pendingSum: number; // wnioski czekające na akceptację
  pendingCount: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
// Do sum wchodzą tylko wydatki zatwierdzone i opłacone; brak statusu = stare wpisy sprzed
// akceptacji (jak zatwierdzone). Wnioski („submitted”), szkice i odrzucone — osobno (money.js).
export const isCountedExpense = (e: { status: ExpenseStatus | string | null }) => !e.status || e.status === 'approved' || e.status === 'paid';
export const isPendingExpense = (e: { status: ExpenseStatus | string | null }) => e.status === 'submitted' || e.status === 'draft';
// Porównanie bez wielkości liter i nadmiarowych spacji (literówka w spacji nie odpina wydatku).
const normKey = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const useTeamFinance = (cfg: TeamConfig, scope: CampusScope) =>
  useQuery({
    queryKey: ['team', cfg.key, 'finance', scope.selectedCampusId],
    queryFn: async (): Promise<TeamFinance> => {
      const year = new Date().getFullYear();
      const [budgetRes, expRes] = await Promise.all([
        scope
          .withCampusFilter(supabase.from('budget_items').select('*'))
          .eq('team_type', cfg.financeName)
          .eq('year', year)
          .order('id', { ascending: true }),
        supabase
          .from('expense_transactions')
          .select('*')
          .eq('team_type', cfg.financeName)
          .gte('payment_date', `${year}-01-01`)
          .lte('payment_date', `${year}-12-31`)
          .order('payment_date', { ascending: false }),
      ]);
      if (budgetRes.error) throw budgetRes.error;
      if (expRes.error) throw expRes.error;
      const expenses: Expense[] = asList(expRes.data).map((e) => ({
        id: String(e.id),
        date: e.payment_date ?? e.date ?? null,
        amount: num(e.amount),
        contractor: e.contractor ?? e.vendor ?? null,
        description: e.description ?? null,
        detailed: e.detailed_description ?? null,
        hasDocuments: Array.isArray(e.documents) && e.documents.length > 0,
        status: (e.status ?? null) as ExpenseStatus,
        category: e.category ?? null,
      }));
      // Wykorzystanie pozycji = WLICZANE wydatki o tej samej kategorii i opisie (FinanceTab.jsx).
      const lines: BudgetLine[] = asList(budgetRes.data)
        .filter((b) => b.kind !== 'income')
        .map((b) => {
          const desc = String(b.description ?? b.name ?? '');
          const spent = expenses
            .filter((e) => isCountedExpense(e) && normKey(e.category) === normKey(b.category) && normKey(e.description) === normKey(b.description))
            .reduce((s, e) => s + e.amount, 0);
          return {
            id: String(b.id),
            description: desc || 'Pozycja budżetu',
            category: b.category ?? null,
            planned: num(b.planned_amount),
            spent,
          };
        });
      const pending = expenses.filter(isPendingExpense);
      return {
        year,
        lines,
        expenses,
        planned: lines.reduce((s, l) => s + l.planned, 0),
        spent: lines.reduce((s, l) => s + l.spent, 0),
        pendingSum: pending.reduce((s, e) => s + e.amount, 0),
        pendingCount: pending.length,
      };
    },
  });

// Wydatek z telefonu — kształt jak WorshipModule.jsx (saveExpense); paragon w bucket `finance`.
// Bez prawa zatwierdzania finansów serwer zapisuje go jako WNIOSEK (status 'submitted',
// nieopłacony) — nie wlicza się do wykorzystania, dopóki skarbnik go nie zatwierdzi.
// Zwraca status nadany przez serwer (żeby powiedzieć „czeka na akceptację”).
export const useAddTeamExpense = (cfg: TeamConfig) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amount: number;
      date: string;
      contractor: string;
      budgetLine: string | null;
      detailed: string;
      responsible: string | null;
      receipt: { uri: string; mimeType: string; name: string } | null;
    }): Promise<{ status: ExpenseStatus }> => {
      const documents: { name: string; url: string; uploadedAt: string }[] = [];
      if (input.receipt) {
        const ext = input.receipt.name.split('.').pop() || 'jpg';
        const path = `expense_documents/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const buf = await (await fetch(input.receipt.uri)).arrayBuffer();
        const { error: upErr } = await supabase.storage
          .from('finance')
          .upload(path, buf, { contentType: input.receipt.mimeType });
        if (upErr) throw new Error('Nie udało się wysłać zdjęcia paragonu. Spróbuj ponownie albo zapisz wydatek bez niego.');
        // Pliki są serwowane publicznie tylko na subdomenie kościoła (nie na api.*).
        documents.push({
          name: input.receipt.name,
          url: `${tenantWebBase()}/storage/finance/${path}`,
          uploadedAt: new Date().toISOString(),
        });
      }
      const { data, error } = await (supabase.from('expense_transactions') as any)
        .insert({
          payment_date: input.date,
          amount: input.amount,
          contractor: input.contractor || null,
          category: cfg.financeName,
          description: input.budgetLine,
          detailed_description: input.detailed || null,
          responsible_person: input.responsible,
          documents,
          tags: [],
          team_type: cfg.financeName,
        })
        .select('id, status')
        .single();
      if (error) throw error;
      return { status: ((data as any)?.status ?? null) as ExpenseStatus };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', cfg.key, 'finance'] });
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
};

// ─── Zadania (ModuleBoard.jsx — tablica Projektów po source_kind) ─────────────

export interface BoardStatusLabel {
  id: string;
  title: string;
  color: string;
}
export interface BoardTask {
  id: string;
  name: string;
  groupName: string | null;
  statusId: string | null;
  people: string[];
  date: string | null;
}
export interface TeamBoard {
  boardId: string | null;
  statusColumnId: string | null;
  labels: BoardStatusLabel[];
  firstGroupId: string | null;
  tasks: BoardTask[];
  cellsById: Record<string, Record<string, unknown>>;
}

// Wczytanie tablicy po id: kolumny (status/people/date), grupy, elementy.
async function loadBoard(boardId: string): Promise<TeamBoard> {
  const [{ data: cols }, { data: groups }, { data: items, error }] = await Promise.all([
    supabase.from('board_columns').select('id, name, type, settings').eq('board_id', boardId).order('display_order'),
    supabase.from('board_groups').select('id, name, display_order').eq('board_id', boardId).order('display_order'),
    supabase
      .from('board_items')
      .select('id, name, group_id, cells, parent_item_id, display_order')
      .eq('board_id', boardId)
      .order('display_order'),
  ]);
  if (error) throw error;
  const columns = asList(cols);
  const settingsOf = (c: any) => (typeof c?.settings === 'string' ? JSON.parse(c.settings) : c?.settings) ?? {};
  const statusCol = columns.find((c) => c.type === 'status');
  const peopleCol = columns.find((c) => c.type === 'people');
  const dateCol = columns.find((c) => c.type === 'date');
  const labels: BoardStatusLabel[] = (settingsOf(statusCol).labels ?? []).map((l: any) => ({
    id: String(l.id),
    title: String(l.title ?? l.id),
    color: String(l.color ?? '#6E685A'),
  }));
  const groupName = new Map<string, string>(asList(groups).map((g) => [String(g.id), String(g.name)]));
  const cellsById: Record<string, Record<string, unknown>> = {};
  // Puste wiersze (dodane na webie i nienazwane) pomijamy — na liście wyglądały jak błąd.
  const tasks: BoardTask[] = asList(items)
    .filter((it) => !it.parent_item_id && String(it.name ?? '').trim())
    .map((it) => {
      const cells = (typeof it.cells === 'string' ? JSON.parse(it.cells) : it.cells) ?? {};
      cellsById[String(it.id)] = cells;
      const people = peopleCol ? cells[peopleCol.id] : null;
      return {
        id: String(it.id),
        name: String(it.name ?? 'Zadanie'),
        groupName: it.group_id != null ? groupName.get(String(it.group_id)) ?? null : null,
        statusId: statusCol && cells[statusCol.id] != null ? String(cells[statusCol.id]) : null,
        people: Array.isArray(people) ? people.map((p: any) => String(p?.name || p?.email || '')).filter(Boolean) : [],
        date: dateCol && cells[dateCol.id] ? String(cells[dateCol.id]).slice(0, 10) : null,
      };
    });
  return {
    boardId,
    statusColumnId: statusCol ? String(statusCol.id) : null,
    labels,
    firstGroupId: asList(groups)[0]?.id ? String(asList(groups)[0].id) : null,
    tasks,
    cellsById,
  };
}

const EMPTY_BOARD: TeamBoard = { boardId: null, statusColumnId: null, labels: [], firstGroupId: null, tasks: [], cellsById: {} };

// Tablica zespołu po source_kind (ModuleBoard na webie) albo konkretna tablica po id.
export const useTeamBoard = (sourceKind: string | undefined, boardId?: string) =>
  useQuery({
    queryKey: ['team', 'board', boardId ?? sourceKind],
    enabled: !!(boardId || sourceKind),
    queryFn: async (): Promise<TeamBoard> => {
      if (boardId) return loadBoard(boardId);
      const { data: boards } = await supabase.from('boards').select('id').eq('source_kind', sourceKind!).limit(1);
      const id = asList(boards)[0]?.id ? String(asList(boards)[0].id) : null;
      return id ? loadBoard(id) : EMPTY_BOARD;
    },
  });

export const useSetTaskStatus = (sourceKind: string | undefined, boardId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      cells,
      statusColumnId,
      labelId,
    }: {
      itemId: string;
      cells: Record<string, unknown>;
      statusColumnId: string;
      labelId: string;
    }) => {
      const { error } = await (supabase.from('board_items') as any)
        .update({ cells: { ...cells, [statusColumnId]: labelId } })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', 'board', boardId ?? sourceKind] }),
  });
};

export const useAddTask = (sourceKind: string | undefined, boardId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      boardId,
      groupId,
      name,
      createdBy,
    }: {
      boardId: string;
      groupId: string | null;
      name: string;
      createdBy: string | null;
    }) => {
      const { error } = await (supabase.from('board_items') as any).insert({
        board_id: boardId,
        group_id: groupId,
        name,
        cells: {},
        display_order: Date.now() % 1_000_000_000,
        created_by: createdBy,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', 'board', boardId ?? sourceKind] }),
  });
};
