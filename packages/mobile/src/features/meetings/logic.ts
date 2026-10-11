// Spotkania online — czysta logika mobilki (lustrzana do webowego meetings/meetingLogic.js):
// stan spotkania względem zegara, liczniki odpowiedzi, ciało zapytań meeting-create/update.
export type MeetingResponse = "accepted" | "tentative" | "declined" | "pending";
export const RESPONSES: Exclude<MeetingResponse, "pending">[] = ["accepted", "tentative", "declined"];
export const RESPONSE_LABELS: Record<MeetingResponse, string> = {
  accepted: "Wezmę udział",
  tentative: "Może",
  declined: "Nie wezmę udziału",
  pending: "Bez odpowiedzi",
};
export const RESPONSE_STATUS: Record<MeetingResponse, string> = {
  accepted: "Bierze udział",
  tentative: "Może",
  declined: "Nie bierze udziału",
  pending: "Bez odpowiedzi",
};
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];
export const DEFAULT_DURATION = 60;
export const MAX_GUESTS = 50;

export interface MeetingMember { email: string; name: string; response: MeetingResponse; organizer?: boolean }
export interface MeetingGuest { id: string; name: string; response: MeetingResponse; email?: string; email_sent?: boolean }
export interface Meeting {
  id: string;
  conversation_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  kind: "audio" | "video";
  status: "scheduled" | "cancelled";
  event_id: string | null;
  source: "meeting" | "event";
  guests_auto_admit: boolean;
  organizer: { email: string; name: string };
  can_manage: boolean;
  my_response: MeetingResponse | null;
  call_live: boolean;
  members: MeetingMember[];
  guests: MeetingGuest[];
}

export type MeetingPhase = "cancelled" | "live" | "soon" | "now" | "upcoming" | "ended";
export function meetingPhase(m: Pick<Meeting, "status" | "starts_at" | "ends_at" | "call_live"> | null, now = Date.now(), callLive = false): MeetingPhase {
  if (!m) return "upcoming";
  if (m.status === "cancelled") return "cancelled";
  if (callLive || m.call_live) return "live";
  const s = Date.parse(m.starts_at);
  const e = Date.parse(m.ends_at);
  if (now > e) return "ended";
  if (now >= s) return "now";
  if (s - now <= 15 * 60_000) return "soon";
  return "upcoming";
}
export const PHASE_TEXT: Record<MeetingPhase, string | null> = {
  live: "Spotkanie trwa",
  now: "Spotkanie powinno się już zacząć",
  soon: "Zaczyna się za chwilę",
  ended: "Spotkanie się zakończyło",
  cancelled: "Spotkanie odwołane",
  upcoming: null,
};

export function responseCounts(m: Pick<Meeting, "members" | "guests"> | null) {
  const out = { accepted: 0, tentative: 0, declined: 0, pending: 0 };
  for (const p of [...(m?.members ?? []), ...(m?.guests ?? [])]) {
    const r = (RESPONSES as string[]).includes(p.response) ? p.response : "pending";
    out[r as keyof typeof out] += 1;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
// Data i godzina z formularza (czas lokalny telefonu) → ISO; null, gdy niepełne.
export function toStartsAt(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}
export function defaultSlot(now = new Date()) {
  const d = new Date(now.getTime() + 30 * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
export function formFromMeeting(m: Meeting) {
  const s = new Date(m.starts_at);
  const duration = Math.round((Date.parse(m.ends_at) - Date.parse(m.starts_at)) / 60_000);
  return {
    title: m.title,
    description: m.description ?? "",
    date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
    time: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
    duration: duration || DEFAULT_DURATION,
    kind: m.kind,
    guestsAutoAdmit: m.guests_auto_admit,
  };
}
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export const isEmail = (v: string) => EMAIL_RE.test(String(v ?? "").trim());
export function parseGuestInput(text: string) {
  const parts = String(text || "").split(/[\s,;]+/).map((p) => p.replace(/^<|>$/g, "").trim()).filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (!p.includes("@")) continue;
    const e = p.toLowerCase();
    if (isEmail(e)) { if (!emails.includes(e)) emails.push(e); } else invalid.push(p);
  }
  return { emails, invalid };
}
export function validateMeetingForm(f: { title: string; date: string; time: string }, { now = Date.now(), editing = false, originalStart = null as string | null } = {}) {
  if (!f.title.trim()) return "Podaj nazwę spotkania";
  const starts = toStartsAt(f.date, f.time);
  if (!starts) return "Podaj datę i godzinę spotkania";
  if ((!editing || starts !== originalStart) && Date.parse(starts) < now - 5 * 60_000) return "Termin spotkania już minął";
  return null;
}
