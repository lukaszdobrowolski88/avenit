import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantWebBase } from '../../lib/supabase';
import { todayYmd } from '../schedule/assignments';
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
  maxParticipants: number | null;
  archived: boolean;
  createdBy: string | null;
}

// Wydarzenia działają też dla modułów z kreatora (klucz spoza TeamKey).
export type EventsCfg = { key: string; eventsTable: 'events' | 'mlodziezowka_events' };

// Wydarzenie jest archiwalne, gdy oznaczone albo minęło (EventsTab.jsx:590-593).
export const useTeamEvents = (cfg: EventsCfg, scope: CampusScope) =>
  useQuery({
    queryKey: ['team', cfg.key, 'events', scope.selectedCampusId],
    queryFn: async (): Promise<TeamEvent[]> => {
      const today = todayYmd();
      const { data, error } = await scope
        .withCampusFilter(
          supabase
            .from('events')
            .select('id, title, description, date, time, end_time, location, event_type, max_participants, is_archived, created_by'),
        )
        .eq('module_key', cfg.key)
        .order('date', { ascending: true });
      if (error) throw error;
      return asList(data)
        .map((e) => {
          const date = String(e.date ?? '').slice(0, 10);
          return {
            id: String(e.id),
            title: e.title ?? 'Wydarzenie',
            description: e.description ?? null,
            date,
            time: e.time ? String(e.time).slice(0, 5) : null,
            endTime: e.end_time ? String(e.end_time).slice(0, 5) : null,
            location: e.location ?? null,
            eventType: e.event_type ?? null,
            maxParticipants: e.max_participants ?? null,
            archived: !!e.is_archived || (!!date && date < today),
            createdBy: e.created_by ?? null,
          };
        })
        .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
    },
  });

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

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hmLocal = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const useCreateTeamEvent = (cfg: EventsCfg, campusIdForInsert: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string | null;
      eventType: string;
      startDate: string; // ISO
      location: string | null;
      authorEmail: string;
    }) => {
      const start = new Date(input.startDate);
      // Kształt jak EventsTab.jsx:552 — date/time osobno + module_key.
      const { error } = await (supabase.from('events') as any).insert({
        title: input.title,
        description: input.description,
        location: input.location,
        event_type: input.eventType,
        module_key: cfg.key,
        date: ymdLocal(start),
        time: hmLocal(start),
        created_by: input.authorEmail,
        campus_id: campusIdForInsert,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', cfg.key, 'events'] }),
  });
};

export const useDeleteTeamEvent = (cfg: EventsCfg) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(cfg.eventsTable).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', cfg.key, 'events'] }),
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

// ─── Finanse (FinanceTab.jsx + zapytania modułów) ─────────────────────────────

export interface BudgetLine {
  id: string;
  description: string;
  category: string | null;
  planned: number;
  spent: number;
}
export interface Expense {
  id: string;
  date: string | null;
  amount: number;
  contractor: string | null;
  description: string | null;
  detailed: string | null;
  hasDocuments: boolean;
}
export interface TeamFinance {
  year: number;
  lines: BudgetLine[];
  expenses: Expense[];
  planned: number;
  spent: number;
}

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
      const expenses = asList(expRes.data);
      // Wydano na linię = wydatki o tej samej kategorii i opisie (FinanceTab.jsx:55-59).
      const lines: BudgetLine[] = asList(budgetRes.data)
        .filter((b) => b.kind !== 'income')
        .map((b) => {
          const desc = String(b.description ?? b.name ?? '');
          const spent = expenses
            .filter((e) => e.category === b.category && e.description === b.description)
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
          return {
            id: String(b.id),
            description: desc || 'Pozycja budżetu',
            category: b.category ?? null,
            planned: Number(b.planned_amount) || 0,
            spent,
          };
        });
      return {
        year,
        lines,
        expenses: expenses.map((e) => ({
          id: String(e.id),
          date: e.payment_date ?? e.date ?? null,
          amount: Number(e.amount) || 0,
          contractor: e.contractor ?? e.vendor ?? null,
          description: e.description ?? null,
          detailed: e.detailed_description ?? null,
          hasDocuments: Array.isArray(e.documents) && e.documents.length > 0,
        })),
        planned: lines.reduce((s, l) => s + l.planned, 0),
        spent: expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      };
    },
  });

// Wydatek z telefonu — kształt jak WorshipModule.jsx:1442-1453; paragon w bucket `finance`.
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
    }) => {
      const documents: { name: string; url: string; uploadedAt: string }[] = [];
      if (input.receipt) {
        const ext = input.receipt.name.split('.').pop() || 'jpg';
        const path = `expense_documents/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const buf = await (await fetch(input.receipt.uri)).arrayBuffer();
        const { error: upErr } = await supabase.storage
          .from('finance')
          .upload(path, buf, { contentType: input.receipt.mimeType });
        if (upErr) throw new Error(upErr.message || 'Nie udało się wysłać paragonu.');
        // Pliki są serwowane publicznie tylko na subdomenie kościoła (nie na api.*).
        documents.push({
          name: input.receipt.name,
          url: `${tenantWebBase()}/storage/finance/${path}`,
          uploadedAt: new Date().toISOString(),
        });
      }
      const { error } = await (supabase.from('expense_transactions') as any).insert({
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
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team', cfg.key, 'finance'] }),
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
    color: String(l.color ?? '#857F70'),
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
