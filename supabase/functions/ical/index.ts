// Edge Function do generowania pliku iCalendar (.ics)
// Endpoint: /functions/v1/ical/:token

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Formatowanie daty do iCalendar (RFC 5545) - UTC
function formatICalDate(date: Date): string {
  return date.toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

// Formatowanie daty lokalnej (bez Z na końcu)
function formatICalDateLocal(dateStr: string, timeStr?: string): string {
  const date = timeStr
    ? new Date(`${dateStr}T${timeStr}:00`)
    : new Date(`${dateStr}T00:00:00`);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

// Escape specjalnych znaków w iCalendar
function escapeICalText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Generowanie unikalnego UID dla wydarzenia
function generateUID(id: string, type: string): string {
  return `${type}-${id}@church-manager.app`;
}

// Struktura wydarzenia
interface CalendarEvent {
  uid: string;
  type: 'VEVENT' | 'VTODO';
  summary: string;
  description?: string;
  location?: string;
  dtstart: string;
  dtend?: string;
  dtstamp: string;
  categories?: string[];
  status?: string;
  due?: string;
}

// Generowanie VEVENT
function generateVEvent(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${event.dtstamp}`,
    `DTSTART:${event.dtstart}`,
  ];

  if (event.dtend) {
    lines.push(`DTEND:${event.dtend}`);
  }

  lines.push(`SUMMARY:${escapeICalText(event.summary)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }

  if (event.categories && event.categories.length > 0) {
    lines.push(`CATEGORIES:${event.categories.filter(Boolean).join(',')}`);
  }

  if (event.status) {
    lines.push(`STATUS:${event.status}`);
  }

  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

// Generowanie VTODO
function generateVTodo(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VTODO',
    `UID:${event.uid}`,
    `DTSTAMP:${event.dtstamp}`,
  ];

  if (event.due) {
    lines.push(`DUE:${event.due}`);
  }

  lines.push(`SUMMARY:${escapeICalText(event.summary)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }

  if (event.categories && event.categories.length > 0) {
    lines.push(`CATEGORIES:${event.categories.filter(Boolean).join(',')}`);
  }

  // Mapowanie statusu zadania
  const statusMap: Record<string, string> = {
    'Do zrobienia': 'NEEDS-ACTION',
    'W trakcie': 'IN-PROCESS',
    'Zrobione': 'COMPLETED',
    'todo': 'NEEDS-ACTION',
    'in_progress': 'IN-PROCESS',
    'done': 'COMPLETED'
  };
  if (event.status && statusMap[event.status]) {
    lines.push(`STATUS:${statusMap[event.status]}`);
  }

  lines.push('END:VTODO');
  return lines.join('\r\n');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Pobierz token z URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const token = pathParts[pathParts.length - 1];

    if (!token || token.length < 32) {
      return new Response("Invalid token", { status: 400 });
    }

    // Połącz z Supabase (service role dla pełnego dostępu)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Znajdź subskrypcję po tokenie
    const { data: subscription, error: subError } = await supabase
      .from('ical_subscriptions')
      .select('*')
      .eq('token', token)
      .single();

    if (subError || !subscription) {
      return new Response("Subscription not found", { status: 404 });
    }

    // Aktualizuj statystyki dostępu
    await supabase
      .from('ical_subscriptions')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (subscription.access_count || 0) + 1
      })
      .eq('id', subscription.id);

    const prefs = subscription.export_preferences || {};
    const events: string[] = [];
    const now = new Date();
    const dtstamp = formatICalDate(now);

    // Zakres dat: 1 rok wstecz, 1 rok w przód
    const dateFrom = new Date(now);
    dateFrom.setFullYear(dateFrom.getFullYear() - 1);
    const dateTo = new Date(now);
    dateTo.setFullYear(dateTo.getFullYear() + 1);

    const dateFromStr = dateFrom.toISOString().split('T')[0];
    const dateToStr = dateTo.toISOString().split('T')[0];

    // 1. Programy (nabożeństwa)
    if (prefs.programs) {
      const { data: programs } = await supabase
        .from('programs')
        .select('*')
        .gte('date', dateFromStr)
        .lte('date', dateToStr);

      programs?.forEach((p: any) => {
        const dtstart = formatICalDateLocal(p.date, '10:00');
        const dtend = formatICalDateLocal(p.date, '12:00');

        events.push(generateVEvent({
          uid: generateUID(p.id, 'program'),
          type: 'VEVENT',
          summary: p.title || 'Nabożeństwo',
          description: p.notes || '',
          location: p.location || 'Kościół',
          dtstart,
          dtend,
          dtstamp,
          categories: ['Nabożeństwo'],
          status: 'CONFIRMED'
        }));
      });
    }

    // 2. Ogólne wydarzenia
    if (prefs.events) {
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .gte('date', dateFromStr)
        .lte('date', dateToStr);

      eventsData?.forEach((ev: any) => {
        const dtstart = formatICalDateLocal(ev.date, ev.time || '10:00');
        const dtend = ev.end_time
          ? formatICalDateLocal(ev.date, ev.end_time)
          : formatICalDateLocal(ev.date, ev.time ?
              `${(parseInt(ev.time.split(':')[0]) + 1).toString().padStart(2, '0')}:${ev.time.split(':')[1]}`
              : '11:00');

        events.push(generateVEvent({
          uid: generateUID(ev.id, 'event'),
          type: 'VEVENT',
          summary: ev.title,
          description: ev.description || '',
          location: ev.location || '',
          dtstart,
          dtend,
          dtstamp,
          categories: [ev.category || 'Wydarzenie'],
          status: 'CONFIRMED'
        }));
      });
    }

    // 3. Zadania (jako VTODO)
    if (prefs.tasks) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .gte('due_date', dateFrom.toISOString())
        .lte('due_date', dateTo.toISOString());

      tasks?.forEach((t: any) => {
        const dueDate = new Date(t.due_date);
        const due = formatICalDate(dueDate);

        events.push(generateVTodo({
          uid: generateUID(t.id, 'task'),
          type: 'VTODO',
          summary: t.title,
          description: t.description || '',
          location: t.location || '',
          due,
          dtstamp,
          categories: [t.team || 'Zadanie'],
          status: t.status
        }));
      });
    }

    // 4-9. Wydarzenia zespołów
    const ministryTables = [
      { key: 'mlodziezowka', table: 'mlodziezowka_events', category: 'Młodzieżówka' },
      { key: 'worship', table: 'worship_events', category: 'Uwielbienie' },
      { key: 'media', table: 'media_events', category: 'Media' },
      { key: 'atmosfera', table: 'atmosfera_events', category: 'Atmosfera' },
      { key: 'kids', table: 'kids_events', category: 'Dzieci' },
      { key: 'homegroups', table: 'homegroups_events', category: 'Grupy Domowe' }
    ];

    for (const ministry of ministryTables) {
      if (prefs[ministry.key]) {
        const { data: ministryEvents } = await supabase
          .from(ministry.table)
          .select('*')
          .gte('start_date', dateFrom.toISOString())
          .lte('start_date', dateTo.toISOString());

        ministryEvents?.forEach((ev: any) => {
          const startDate = new Date(ev.start_date);
          const dateStr = startDate.toISOString().split('T')[0];
          const timeStr = ev.event_time || startDate.toISOString().split('T')[1].substring(0, 5);

          const dtstart = formatICalDateLocal(dateStr, timeStr);
          const dtend = ev.end_time
            ? formatICalDateLocal(dateStr, ev.end_time)
            : formatICalDateLocal(dateStr,
                `${(parseInt(timeStr.split(':')[0]) + 2).toString().padStart(2, '0')}:${timeStr.split(':')[1]}`);

          events.push(generateVEvent({
            uid: generateUID(ev.id, ministry.key),
            type: 'VEVENT',
            summary: ev.title,
            description: ev.description || '',
            location: ev.location || '',
            dtstart,
            dtend,
            dtstamp,
            categories: [ministry.category, ev.event_type || ''].filter(Boolean),
            status: 'CONFIRMED'
          }));
        });
      }
    }

    // Generowanie pliku iCalendar
    const icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Church Manager//Calendar//PL',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Church Manager',
      'X-WR-TIMEZONE:Europe/Warsaw',
      // Definicja strefy czasowej
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Warsaw',
      'BEGIN:STANDARD',
      'DTSTART:19701025T030000',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:19700329T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'END:DAYLIGHT',
      'END:VTIMEZONE',
      ...events,
      'END:VCALENDAR'
    ].join('\r\n');

    // Zwróć plik .ics
    return new Response(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="church-manager.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders
      }
    });

  } catch (error: unknown) {
    const err = error as Error;
    console.error("iCal Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
