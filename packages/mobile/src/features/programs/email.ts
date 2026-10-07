import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { fmtDuration, type PlanItem } from './schedule';

// Wysyłka programu e-mailem (serwerowa funkcja send-program-email, jak przycisk na webie).
// Odbiorcy: osoby ze służb na podpiętych wydarzeniach (tam żyją sekcje zespołów) + zespół
// z samego programu (stary model, jak getAllRecipients na webie). Bez PDF — eksporty zostają na webie.

const TEAM_MEMBER_TABLE: Record<string, string> = {
  worship: 'worship_team',
  media: 'media_team',
  atmosfera: 'atmosfera_members',
  kids: 'kids_teachers',
  mc: 'custom_mc_members',
};
const memberTableFor = (team: string) => TEAM_MEMBER_TABLE[team] || `custom_${team}_members`;
const csv = (v: unknown) =>
  String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export interface Recipient {
  email: string;
  name: string | null;
}

export const useProgramRecipients = (
  programId: number,
  eventIds: number[],
  programZespol: Record<string, unknown> | null,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['programs', 'recipients', programId, eventIds.join(',')],
    enabled,
    queryFn: async (): Promise<Recipient[]> => {
      const out = new Map<string, Recipient>();
      const add = (email: unknown, name: unknown) => {
        const e = String(email ?? '').trim().toLowerCase();
        if (!e || !e.includes('@')) return;
        if (!out.has(e)) out.set(e, { email: e, name: name ? String(name) : null });
      };
      // Imiona do znalezienia w tabelach osób danej służby.
      const namesByTeam = new Map<string, Set<string>>();
      const want = (team: string, names: string[]) => {
        if (!names.length) return;
        const set = namesByTeam.get(team) ?? new Set<string>();
        names.forEach((n) => set.add(n));
        namesByTeam.set(team, set);
      };

      if (eventIds.length) {
        const [{ data: evs }, { data: sa }] = await Promise.all([
          supabase.from('events').select('id, assignments').in('id', eventIds),
          supabase.from('schedule_assignments').select('assigned_email, assigned_name, status').in('event_id', eventIds),
        ]);
        for (const a of (sa ?? []) as any[]) if (a.status !== 'rejected') add(a.assigned_email, a.assigned_name);
        for (const ev of (evs ?? []) as any[]) {
          const asg = ev.assignments && typeof ev.assignments === 'object' ? ev.assignments : {};
          for (const [team, roles] of Object.entries(asg as Record<string, Record<string, string>>)) {
            for (const [key, names] of Object.entries(roles ?? {})) {
              if (key === 'notatki' || key === 'absencja') continue;
              want(team, csv(names));
            }
          }
        }
      }
      if (programZespol && typeof programZespol === 'object') {
        for (const [key, value] of Object.entries(programZespol)) {
          if (key === 'notatki' || key === 'absencja') continue;
          if (typeof value === 'string') want('worship', csv(value));
        }
      }

      await Promise.all(
        Array.from(namesByTeam.entries()).map(async ([team, names]) => {
          const { data } = await (supabase.from(memberTableFor(team) as never) as any).select('full_name, email').in('full_name', Array.from(names));
          for (const m of (data ?? []) as any[]) add(m.email, m.full_name);
        }),
      );
      return Array.from(out.values()).sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, 'pl'));
    },
  });

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Treść maila: plan z sekcjami, osobami, tonacjami i czasem trwania.
export const programEmailHtml = (p: {
  title: string;
  dateLabel: string;
  schedule: PlanItem[];
  songs?: Record<string, { title: string; key: string | null }>;
  notes?: string | null;
}) => {
  const rows = p.schedule
    .map((it) => {
      if (it.type === 'header') {
        return `<tr><td colspan="3" style="padding:14px 0 6px;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#8A6606">${esc(it.title || 'Sekcja')}</td></tr>`;
      }
      const song = it.type === 'song' && it.songId != null ? p.songs?.[String(it.songId)] : null;
      const title = it.title || song?.title || (it.type === 'song' ? 'Pieśń' : 'Element');
      const key = it.songKey || song?.key;
      const meta = [it.person, key ? `tonacja ${key}` : null].filter(Boolean).join(' · ');
      return `<tr>
        <td style="padding:6px 8px 6px 0;vertical-align:top">${it.type === 'song' ? '🎵 ' : ''}<strong>${esc(title)}</strong>${meta ? `<br><span style="color:#6B6557;font-size:13px">${esc(meta)}</span>` : ''}${it.details ? `<br><span style="color:#6E685A;font-size:12px">${esc(it.details)}</span>` : ''}</td>
        <td style="padding:6px 0;vertical-align:top;color:#6E685A;font-size:13px;white-space:nowrap;text-align:right">${esc(fmtDuration(it.duration))}</td>
      </tr>`;
    })
    .join('');
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2A2312">
    <h2 style="margin:0 0 4px">${esc(p.title)}</h2>
    <p style="margin:0 0 16px;color:#6B6557">${esc(p.dateLabel)}</p>
    ${p.notes ? `<p style="padding:12px;background:#F6F4EE;border-radius:10px;white-space:pre-line">${esc(p.notes)}</p>` : ''}
    <table style="width:100%;border-collapse:collapse">${rows}</table>
  </div>`;
};

export const sendProgramEmail = async (input: { to: string[]; subject: string; html: string }) => {
  const { error } = await supabase.functions.invoke('send-program-email', {
    body: { emailTo: input.to, subject: input.subject, htmlBody: input.html },
  });
  if (error) throw new Error((error as any)?.message || 'Nie udało się wysłać programu.');
};
