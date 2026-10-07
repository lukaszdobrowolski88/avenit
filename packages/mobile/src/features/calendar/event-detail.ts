import { useQuery } from '@tanstack/react-query';
import { supabase, tenantWebBase } from '../../lib/supabase';
import type { ProgramScheduleItem } from '../../lib/domain';
import { reviveAgendaEvent, toAgendaEvent, type AgendaEvent } from './api';
import { htmlToText } from './meta';

// Pełne wydarzenie jak web (EventDetailPage + EventTeamsTab + EventMaterialsTab): szczegóły,
// podpięty program, służby z rolami i osobami, rejestracja/płatność, materiały, załączniki,
// pola i zakładki własne. Ustawienia typu (event_type_tabs) decydują, które sekcje są włączone.

export interface ServicePerson {
  name: string;
  isMe: boolean;
  status: 'pending' | 'accepted' | 'rejected' | null;
}
export interface ServiceRole {
  key: string;
  label: string;
  people: ServicePerson[];
}
export interface ServiceSection {
  key: string;
  label: string;
  roles: ServiceRole[];
  openRoles: number;
  absent: string[];
  notes: string | null;
}
// Mój przydział na tym wydarzeniu (schedule_assignments) — do potwierdzenia/odmowy.
export interface MyAssignment {
  id: string;
  team: string;
  role: string;
  status: 'pending' | 'accepted' | 'rejected' | null;
}
export interface EventFile {
  id: string;
  name: string;
  url: string | null;
  storagePath: string | null;
  mime: string | null;
  size: number | null;
}
export interface EventProgram {
  id: number;
  title: string | null;
  date: string | null;
  schedule: (ProgramScheduleItem & { person?: string | null; details?: string | null; songKey?: string | null })[];
  songs: Record<string, { title: string; key: string | null }>;
}
export interface EventDetail {
  event: AgendaEvent;
  typeLabel: string | null;
  // Surowe pola do edycji.
  raw: { description: string | null; hasDetailsHtml: boolean };
  myAssignments: MyAssignment[];
  details: string;
  link: string | null;
  formUrl: string | null;
  registrationRequired: boolean;
  registrationDeadline: string | null;
  maxParticipants: number | null;
  isPaid: boolean;
  prices: { label: string; amount: number | null }[];
  paymentDeadline: string | null;
  attachments: EventFile[];
  program: EventProgram | null;
  services: ServiceSection[];
  // Służby są skonfigurowane (sekcje), nawet jeśli nikt nie jest przypisany.
  hasServiceConfig: boolean;
  materials: EventFile[];
  fields: { label: string; value: string }[];
  customTabs: { id: string; label: string; text: string }[];
  sections: { program: boolean; registration: boolean; services: boolean; participants: boolean; materials: boolean };
}

const csv = (v: unknown): string[] =>
  String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const asList = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const parseJson = (raw: unknown): any => {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const soft = <T>(p: PromiseLike<{ data: T | null }>, fallback: T): Promise<T> =>
  Promise.resolve(p).then(
    (r) => (r?.data ?? fallback) as T,
    () => fallback,
  );

// Zapasowe nazwy służb (= domyślne nazwy modułów); nazwa z ustawień kościoła wygrywa.
const TEAM_LABELS: Record<string, string> = {
  worship: 'Zespół uwielbienia',
  media: 'MediaTeam',
  atmosfera: 'Atmosfera Team',
  kids: 'Dzieci',
  mc: 'Scena / MC',
};
const KNOWN_TEAM_MODULES = ['worship', 'media', 'atmosfera', 'kids'];
const GENERAL_TYPES: Record<string, string> = {
  // Web zapisuje typ z polskimi znakami ('nabożeństwo'); starsze wpisy — bez.
  nabożeństwo: 'Nabożeństwo',
  nabozenstwo: 'Nabożeństwo',
  spotkanie: 'Spotkanie',
  wydarzenie: 'Wydarzenie',
  szkolenie: 'Szkolenie',
  inne: 'Inne',
};

// Adres pliku: pełny URL bez zmian, ścieżka względna — na hoście tenanta (tam serwuje /storage).
const absUrl = (u: string | null | undefined) => {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  const base = tenantWebBase();
  return base ? `${base}${u.startsWith('/') ? '' : '/'}${u}` : null;
};

// Daty z zapisanego na dysku cache wracają jako tekst — odtwórz (patrz reviveAgendaEvent).
const reviveDetail = (d: EventDetail | null) =>
  d
    ? {
        ...d,
        event: reviveAgendaEvent(d.event),
        myAssignments: d.myAssignments ?? [],
        raw: d.raw ?? { description: null, hasDetailsHtml: false },
      }
    : d;

export const useEventDetail = (
  id: number | null,
  me: { email: string | null; name: string | null; moduleLabel: (key: string) => string },
) =>
  useQuery({
    queryKey: ['event-detail', id, me.email, me.name],
    enabled: id != null && Number.isFinite(id),
    select: reviveDetail,
    queryFn: async (): Promise<EventDetail | null> => {
      const { data: row, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!row) return null;
      const ev = row as any;
      const event = toAgendaEvent(ev);
      if (!event) return null;
      const moduleKey: string = ev.module_key || '';

      const [settings, fields, program, roleRows, sa, matLinks] = await Promise.all([
        soft(
          supabase.from('app_settings').select('key, value').in('key', ['event_type_tabs', 'event_type_teams', 'module_calendar']),
          [] as any[],
        ),
        moduleKey
          ? soft(
              supabase.from('event_custom_fields').select('field_key, label, field_type, sort_order').eq('module_key', moduleKey).order('sort_order', { ascending: true }),
              [] as any[],
            )
          : Promise.resolve([] as any[]),
        ev.program_id
          ? soft(supabase.from('programs').select('id, title, date, schedule, song_ids').eq('id', ev.program_id).maybeSingle(), null as any)
          : Promise.resolve(null),
        soft(
          supabase.from('team_roles').select('team_type, field_key, name, display_order').eq('is_active', true).order('display_order', { ascending: true }),
          [] as any[],
        ),
        soft(
          supabase.from('schedule_assignments').select('id, team_type, role_key, role_label, assigned_name, assigned_email, status').eq('event_id', ev.id),
          [] as any[],
        ),
        soft(supabase.from('event_materials').select('file_id').eq('event_id', ev.id), [] as any[]),
      ]);

      const setting = (key: string) => parseJson(asList(settings).find((s) => s?.key === key)?.value);
      const sameType = (r: any) => (r?.module_key || '') === moduleKey && r?.event_type && r.event_type === ev.event_type;

      // Typ wydarzenia: konfiguracja kalendarza modułu → typy ogólne.
      const calCfg = setting('module_calendar') ?? {};
      const typeOpt = asList(calCfg?.[moduleKey || 'general']?.types).find((t) => t?.value === ev.event_type);
      const typeLabel = ev.event_type ? typeOpt?.label ?? GENERAL_TYPES[ev.event_type] ?? null : null;

      // Sekcje włączone dla typu (jak zakładki na webie).
      const tabRule = asList(setting('event_type_tabs')).find(sameType) ?? null;
      const bi = tabRule?.builtins ?? null;
      const on = (k: string, def: boolean) => (bi && k in bi ? bi[k] === true : def);
      const materialsOn = bi && 'materialy' in bi ? bi.materialy === true : tabRule?.materials === true;

      // ── Służby ──
      const teamRule = asList(setting('event_type_teams')).find(sameType);
      const defaultTeams: string[] =
        teamRule && Array.isArray(teamRule.teams) && teamRule.teams.length
          ? teamRule.teams
          : KNOWN_TEAM_MODULES.includes(moduleKey)
            ? [moduleKey]
            : [];
      const teamTypes = typeof ev.team_types === 'string' ? csv(ev.team_types) : defaultTeams;
      const assign = (ev.assignments && typeof ev.assignments === 'object' ? ev.assignments : {}) as Record<string, Record<string, string>>;
      const layout = ev.team_layout && typeof ev.team_layout === 'object' ? ev.team_layout : {};
      const customSections = asList(layout.sections).filter((s) => s?.key);
      const customKeys = new Set(customSections.map((s) => String(s.key)));
      const assignedTeams = Object.keys(assign).filter(
        (k) => !customKeys.has(k) && Object.entries(assign[k] ?? {}).some(([rk, v]) => rk !== 'notatki' && rk !== 'absencja' && csv(v).length),
      );
      const sectionDefs = [
        ...[...new Set([...teamTypes, ...assignedTeams])].map((k) => ({
          key: k,
          label: me.moduleLabel(k) || TEAM_LABELS[k] || k,
          custom: false,
        })),
        ...customSections.map((s) => ({ key: String(s.key), label: String(s.label || 'Sekcja'), custom: true })),
      ];

      const myNames = new Set<string>(me.name ? [me.name] : []);
      const statusOf = new Map<string, ServicePerson['status']>();
      for (const a of asList(sa)) {
        statusOf.set(`${a.team_type}|${a.role_key}|${a.assigned_name}`, a.status ?? null);
        if (me.email && a.assigned_email === me.email && a.assigned_name) myNames.add(String(a.assigned_name));
      }
      // Role służby w kolejności z ustawień (team_roles.display_order).
      const roleLabels = new Map<string, string>();
      const roleOrder = new Map<string, string[]>();
      for (const r of asList(roleRows)) {
        roleLabels.set(`${r.team_type}|${r.field_key}`, String(r.name));
        roleOrder.set(r.team_type, [...(roleOrder.get(r.team_type) ?? []), String(r.field_key)]);
      }
      const services: ServiceSection[] = sectionDefs.map((sec) => {
        const a = assign[sec.key] ?? {};
        const extra = asList(layout.roles?.[sec.key]).map((r) => ({ key: String(r.key), label: String(r.label || 'Rola') }));
        const keys = [
          ...(sec.custom ? [] : roleOrder.get(sec.key) ?? []).map((k) => ({ key: k, label: roleLabels.get(`${sec.key}|${k}`) ?? k })),
          ...extra,
        ];
        for (const k of Object.keys(a)) {
          if (k !== 'notatki' && k !== 'absencja' && !keys.some((x) => x.key === k)) keys.push({ key: k, label: roleLabels.get(`${sec.key}|${k}`) ?? k });
        }
        const roles = keys.map((r) => ({
          ...r,
          people: csv(a[r.key]).map((name) => ({
            name,
            isMe: myNames.has(name),
            status: statusOf.get(`${sec.key}|${r.key}|${name}`) ?? null,
          })),
        }));
        return {
          key: sec.key,
          label: sec.label,
          roles: roles.filter((r) => r.people.length > 0),
          openRoles: roles.filter((r) => r.people.length === 0).length,
          absent: csv(a.absencja),
          notes: a.notatki ? String(a.notatki) : null,
        };
      });

      // ── Program (plan + tytuły pieśni) ──
      let prog: EventProgram | null = null;
      if (program) {
        const p = program as any;
        const schedule = asList(parseJson(p.schedule) ?? p.schedule);
        const songIds = [...new Set(schedule.filter((it) => it?.type === 'song' && it?.songId != null).map((it) => it.songId))];
        const songsRows = songIds.length
          ? await soft(supabase.from('songs').select('id, title, key').in('id', songIds), [] as any[])
          : [];
        prog = {
          id: Number(p.id),
          title: p.title ?? null,
          date: p.date ? String(p.date).slice(0, 10) : null,
          schedule,
          songs: Object.fromEntries(asList(songsRows).map((s) => [String(s.id), { title: String(s.title ?? ''), key: s.key ?? null }])),
        };
      }

      // ── Materiały (event_materials → materials_files) ──
      const fileIds = asList(matLinks).map((m) => m.file_id).filter((x) => x != null);
      const files = fileIds.length
        ? await soft(supabase.from('materials_files').select('id, name, storage_path, mime_type, file_size').in('id', fileIds), [] as any[])
        : [];
      const base = tenantWebBase();
      const materials: EventFile[] = asList(files).map((f) => ({
        id: String(f.id),
        name: String(f.name ?? 'Plik'),
        storagePath: f.storage_path ?? null,
        url: base && f.storage_path ? `${base}/storage/materials/${String(f.storage_path).replace(/^\//, '')}` : null,
        mime: f.mime_type ?? null,
        size: f.file_size ?? null,
      }));
      const attachments: EventFile[] = asList(parseJson(ev.attachments) ?? ev.attachments).map((a, i) => ({
        id: `att-${i}`,
        name: String(a?.name ?? 'Załącznik'),
        storagePath: a?.path ?? null,
        url: absUrl(a?.url),
        mime: a?.type ?? null,
        size: a?.size ?? null,
      }));

      const custom = (parseJson(ev.custom) ?? {}) as Record<string, unknown>;
      const fieldList = asList(fields)
        .map((f) => {
          const raw = custom[f.field_key];
          const value = Array.isArray(raw) ? raw.join(', ') : raw == null ? '' : String(raw);
          return { label: String(f.label ?? f.field_key), value: f.field_type === 'date' ? value.slice(0, 10) : value };
        })
        .filter((f) => f.value.trim() !== '');
      const customTabs = asList(tabRule?.tabs)
        .filter((t) => t?.id)
        .map((t) => ({ id: String(t.id), label: String(t.label || 'Zakładka'), text: htmlToText(custom[`tabhtml_${t.id}`] as string) }))
        .filter((t) => t.text);

      const myAssignments: MyAssignment[] = me.email
        ? asList(sa)
            .filter((a) => String(a.assigned_email || '').toLowerCase() === me.email!.toLowerCase())
            .map((a) => ({
              id: String(a.id),
              team: sectionDefs.find((x) => x.key === a.team_type)?.label ?? me.moduleLabel(a.team_type) ?? a.team_type,
              role: a.role_label || roleLabels.get(`${a.team_type}|${a.role_key}`) || a.role_key || 'Służba',
              status: a.status ?? null,
            }))
        : [];

      return {
        event,
        typeLabel,
        raw: { description: ev.description ?? null, hasDetailsHtml: !!String(ev.details_html ?? '').trim() },
        myAssignments,
        details: htmlToText(ev.details_html || ev.description),
        link: ev.link || null,
        formUrl: ev.form_url || (ev.form_id && base ? `${base}/form/${ev.form_id}` : null),
        registrationRequired: !!ev.registration_required,
        registrationDeadline: ev.registration_deadline ? String(ev.registration_deadline).slice(0, 10) : null,
        maxParticipants: ev.max_participants ?? null,
        isPaid: !!ev.is_paid,
        prices: asList(parseJson(ev.prices) ?? ev.prices)
          .filter((p) => p && (p.label || p.amount != null))
          .map((p) => ({ label: String(p.label || 'Cena'), amount: p.amount != null ? Number(p.amount) : null })),
        paymentDeadline: ev.payment_deadline ? String(ev.payment_deadline).slice(0, 10) : null,
        attachments: attachments.filter((a) => a.url),
        program: prog,
        services,
        hasServiceConfig: sectionDefs.length > 0,
        materials,
        fields: fieldList,
        customTabs,
        sections: {
          program: on('program', true),
          registration: on('rejestracja', true),
          services: on('sluzby', true),
          participants: on('uczestnicy', true),
          materials: !!materialsOn || materials.length > 0,
        },
      };
    },
  });
