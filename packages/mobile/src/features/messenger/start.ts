import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { emailPattern, normEmail } from "./api";

// Zakładanie rozmów z telefonu — ta sama logika co web (useConversations.js:
// createDirectConversation / createGroupConversation) i ta sama kolejność, której pilnuje
// serwer: 1) wiersz w conversations, 2) CAŁY skład jednym zapisem z twórcą jako 'admin'
// (pierwszy skład pustej rozmowy wolno dodać tylko jej twórcy), 3) wiadomości.
// Rozmowę 1:1 najpierw szukamy, żeby nie dublować.

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
  if (convErr) throw convErr;
  if (!conv?.id) throw new Error("Nie udało się utworzyć rozmowy.");
  const { error: partErr } = await (supabase.from("conversation_participants") as any)
    .insert(buildParticipantRows(String(conv.id), myEmail, memberEmails, allAdmins))
    .select("conversation_id, user_email");
  if (partErr) throw partErr;
  return String(conv.id);
}

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

export async function findOrCreateDirect(myEmail: string, otherEmail: string): Promise<string> {
  const { data: mine, error: mineErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .ilike("user_email", emailPattern(myEmail));
  if (mineErr) throw mineErr;
  const myIds = ((mine ?? []) as any[]).map((p) => p.conversation_id);

  if (myIds.length > 0) {
    const { data: theirs, error: theirsErr } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .ilike("user_email", emailPattern(otherEmail))
      .in("conversation_id", myIds);
    if (theirsErr) throw theirsErr;
    const common = ((theirs ?? []) as any[]).map((p) => p.conversation_id);
    if (common.length > 0) {
      const { data: convs, error: convsErr } = await supabase
        .from("conversations")
        .select("id, type")
        .in("id", common)
        .eq("type", "direct")
        .limit(1);
      if (convsErr) throw convsErr;
      const hit = ((convs ?? []) as any[])[0];
      if (hit?.id) return String(hit.id);
    }
  }

  return insertConversation(myEmail, { type: "direct" }, [otherEmail], true);
}

export async function createGroupConversation(
  myEmail: string,
  name: string,
  participantEmails: string[],
): Promise<string> {
  return insertConversation(myEmail, { type: "group", name }, participantEmails);
}
