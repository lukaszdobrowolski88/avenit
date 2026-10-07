import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { emailPattern, normEmail, pickDirectConversation } from "./logic";

// Zakładanie rozmów z telefonu — ta sama logika co web (useConversations.js:
// createDirectConversation / createGroupConversation) i ta sama kolejność, której pilnuje
// serwer: 1) wiersz w conversations, 2) CAŁY skład jednym zapisem z twórcą jako 'admin'
// (pierwszy skład pustej rozmowy wolno dodać tylko jej twórcy), 3) wiadomości.
// Rozmowę 1:1 najpierw szukamy (także w archiwum), żeby nie dublować.

// Skład nowej rozmowy: twórca jako administrator, reszta bez duplikatów i bez twórcy.
// allAdmins — rozmowa 1:1: obie strony są administratorami (każda może ją usunąć).
export function buildParticipantRows(
  conversationId: string,
  creatorEmail: string,
  emails: string[],
  allAdmins = false,
) {
  const seen = new Set([normEmail(creatorEmail)]);
  const rows = [{ conversation_id: conversationId, user_email: creatorEmail, role: "admin" }];
  for (const e of emails) {
    const k = normEmail(e);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    rows.push({ conversation_id: conversationId, user_email: e, role: allAdmins ? "admin" : "member" });
  }
  return rows;
}

// Wiersz rozmowy → skład (.select(): zaproszone osoby dostają rozmowę na żywo).
async function insertConversation(
  myEmail: string,
  values: Record<string, unknown>,
  memberEmails: string[],
  allAdmins = false,
): Promise<string> {
  const { data: conv, error: convErr } = await (supabase.from("conversations") as any)
    .insert({ ...values, created_by: myEmail })
    .select("id")
    .single();
  if (convErr) throw dmError(convErr);
  if (!conv?.id) throw new Error("Nie udało się utworzyć rozmowy.");
  const { error: partErr } = await (supabase.from("conversation_participants") as any)
    .insert(buildParticipantRows(String(conv.id), myEmail, memberEmails, allAdmins))
    .select("conversation_id, user_email");
  // Serwer odmówił składu (K9: polityka rozmów prywatnych / ochrona niepełnoletnich — 403
  // DM_NOT_ALLOWED; K10: blokada — 403 BLOCKED). Pustą rozmowę 1:1 sprząta wtedy sam serwer.
  if (partErr) throw dmError(partErr);
  return String(conv.id);
}

// Odmowa rozmowy 1:1 (K9) — ludzki komunikat serwera, a gdy go brak — nasz.
const dmError = (err: any) => {
  if (err?.code !== "DM_NOT_ALLOWED") return err;
  const msg = typeof err?.message === "string" && !/^HTTP \d+/.test(err.message) ? err.message : "";
  return Object.assign(
    new Error(msg || "Rozmowa prywatna z tą osobą nie jest możliwa w Twoim kościele. Napiszcie w grupie albo poproś lidera o pomoc."),
    { code: "DM_NOT_ALLOWED" },
  );
};

export interface Person {
  email: string;
  name: string;
  avatarUrl: string | null;
}

// Osoby z kontem w tym kościele (app_users czyta każdy zalogowany; sekrety ukrywa serwer).
// To ci sami ludzie, do których da się napisać na webie.
export const usePeopleDirectory = (myEmail: string | null) =>
  useQuery({
    queryKey: ["people-directory", myEmail],
    enabled: !!myEmail,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from("app_users")
        .select("email, full_name, name, avatar_url, status, is_active");
      if (error) throw error;
      const me = (myEmail ?? "").toLowerCase();
      return ((data ?? []) as any[])
        .filter((u) => u.email && u.email.toLowerCase() !== me)
        .filter((u) => u.is_active !== false && (u.status ?? "active") === "active")
        .map((u) => ({
          email: String(u.email),
          name: String(u.full_name || u.name || u.email.split("@")[0]).trim(),
          avatarUrl: u.avatar_url ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pl"));
    },
  });

// Istniejąca rozmowa 1:1 z tą osobą (także zarchiwizowana). Przy dawnych duplikatach — ta
// z najświeższą wiadomością (jak web: chatLogic.pickDirectConversation).
export async function findExistingDirect(myEmail: string, otherEmail: string): Promise<string | null> {
  const { data: mine, error: mineErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .ilike("user_email", emailPattern(myEmail));
  if (mineErr) throw mineErr;
  const myIds = ((mine ?? []) as any[]).map((p) => p.conversation_id);
  if (myIds.length === 0) return null;

  const { data: theirs, error: theirsErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .ilike("user_email", emailPattern(otherEmail))
    .in("conversation_id", myIds);
  if (theirsErr) throw theirsErr;
  const common = Array.from(new Set(((theirs ?? []) as any[]).map((p) => p.conversation_id)));
  if (common.length === 0) return null;

  const { data: convs, error: convsErr } = await supabase
    .from("conversations")
    .select("id, type, created_at, updated_at, last_message_at")
    .in("id", common)
    .eq("type", "direct");
  if (convsErr) throw convsErr;
  const list = (convs ?? []) as any[];
  if (list.length === 0) return null;
  if (list.length === 1) return String(list[0].id);
  const withLast = await Promise.all(
    list.map(async (c) => {
      const { data } = await supabase
        .from("messages")
        .select("created_at")
        .eq("conversation_id", c.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      return { ...c, last_message: ((data ?? []) as any[])[0] ?? null };
    }),
  );
  const best = pickDirectConversation(withLast);
  return best ? String(best.id) : null;
}

// Otwierana rozmowa wraca z archiwum (mój wiersz) — inaczej nie było jej na liście.
async function unarchiveMine(conversationId: string, myEmail: string) {
  const { error } = await (supabase.from("conversation_participants") as any)
    .update({ archived: false })
    .eq("conversation_id", conversationId)
    .ilike("user_email", emailPattern(myEmail))
    .eq("archived", true)
    .select("conversation_id");
  if (error && __DEV__) console.warn("[messenger] unarchive failed:", error.message);
}

// Rozmowa 1:1: najpierw istniejąca (nigdy druga z tą samą osobą — pilnuje też serwer: 409
// DIRECT_EXISTS), dopiero potem nowa.
export async function findOrCreateDirect(myEmail: string, otherEmail: string): Promise<string> {
  const existing = await findExistingDirect(myEmail, otherEmail);
  if (existing) {
    await unarchiveMine(existing, myEmail);
    return existing;
  }
  try {
    return await insertConversation(myEmail, { type: "direct" }, [otherEmail], true);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "DIRECT_EXISTS") {
      const id = await findExistingDirect(myEmail, otherEmail);
      if (id) {
        await unarchiveMine(id, myEmail);
        return id;
      }
    }
    throw e;
  }
}

// Grupa albo kanał ogłoszeń (jak web: createAnnouncementChannel — piszą tylko administratorzy).
export async function createGroupConversation(
  myEmail: string,
  name: string,
  participantEmails: string[],
  opts: { announcement?: boolean } = {},
): Promise<string> {
  const values = opts.announcement
    ? { type: "announcement", name, posting_policy: "admins" }
    : { type: "group", name };
  return insertConversation(myEmail, values, participantEmails);
}
