import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

// Zakładanie rozmów z telefonu — ta sama logika co web (useConversations.js:
// createDirectConversation / createGroupConversation): wiersz w conversations,
// potem uczestnicy. Rozmowę 1:1 najpierw szukamy, żeby nie dublować.

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
    .eq("user_email", myEmail);
  if (mineErr) throw mineErr;
  const myIds = ((mine ?? []) as any[]).map((p) => p.conversation_id);

  if (myIds.length > 0) {
    const { data: theirs } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_email", otherEmail)
      .in("conversation_id", myIds);
    const common = ((theirs ?? []) as any[]).map((p) => p.conversation_id);
    if (common.length > 0) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, type")
        .in("id", common)
        .eq("type", "direct")
        .limit(1);
      const hit = ((convs ?? []) as any[])[0];
      if (hit?.id) return String(hit.id);
    }
  }

  const { data: conv, error: convErr } = await (supabase.from("conversations") as any)
    .insert({ type: "direct", created_by: myEmail })
    .select()
    .single();
  if (convErr) throw convErr;
  const { error: partErr } = await (supabase.from("conversation_participants") as any).insert([
    { conversation_id: conv.id, user_email: myEmail, role: "admin" },
    { conversation_id: conv.id, user_email: otherEmail, role: "admin" },
  ]);
  if (partErr) throw partErr;
  return String(conv.id);
}

export async function createGroupConversation(
  myEmail: string,
  name: string,
  participantEmails: string[],
): Promise<string> {
  const { data: conv, error: convErr } = await (supabase.from("conversations") as any)
    .insert({ type: "group", name, created_by: myEmail })
    .select()
    .single();
  if (convErr) throw convErr;
  const rows = [
    { conversation_id: conv.id, user_email: myEmail, role: "admin" },
    ...participantEmails
      .filter((e) => e !== myEmail)
      .map((e) => ({ conversation_id: conv.id, user_email: e, role: "member" })),
  ];
  const { error: partErr } = await (supabase.from("conversation_participants") as any).insert(rows);
  if (partErr) throw partErr;
  return String(conv.id);
}
