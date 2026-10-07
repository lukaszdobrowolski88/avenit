import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { errorKind } from "../../lib/errors";
import { emailPattern, normEmail, sameEmail } from "./logic";

// Komunikator+ — klient kontraktów serwera (K2 podgląd linków, K3 tłumaczenie, K4 ciche
// godziny, K9 polityka rozmów prywatnych, K10 zgłoszenia i blokady). Serwer może być starszy
// niż aplikacja (aktualizacja OTA przed wdrożeniem) — brak endpointu/tabeli obsługujemy łagodnie.

type FnError = { message?: string; status?: number; context?: any } | null;

// Brak trasy na serwerze (stary backend) — Fastify odpowiada 404 „Not Found”.
const isMissingRoute = (error: FnError) =>
  !!error &&
  error.status === 404 &&
  (!error.context || error.context?.error === "Not Found" || /^Route /.test(String(error.context?.message ?? "")));

const NOT_YET = "Ta funkcja będzie dostępna po aktualizacji serwera.";

// Błąd funkcji serwera → Error z czytelnym tekstem (komunikat serwera, gdy jest ludzki).
const fnError = (error: FnError, fallback: string): Error => {
  if (isMissingRoute(error)) return Object.assign(new Error(NOT_YET), { code: "NOT_AVAILABLE" });
  const code = error?.context?.code as string | undefined;
  const human = typeof error?.context?.error === "string" ? error.context.error : null;
  if (human && error?.status !== 500) return Object.assign(new Error(human), { code });
  return Object.assign(new Error(error?.message || fallback), { status: error?.status, code });
};

// =====================================================================
// K2 — podgląd linku (karta pod wiadomością). Błąd = brak karty, bez komunikatu.
// =====================================================================

export interface LinkPreview {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
}

export const useLinkPreview = (url: string | null) =>
  useQuery({
    queryKey: ["linkPreview", url],
    enabled: !!url,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<LinkPreview | null> => {
      if (!url) return null;
      const { data, error } = await supabase.functions.invoke("link-preview", { body: { url }, silent: true } as any);
      if (error || !data) return null;
      const p = data as LinkPreview;
      if (!p.title && !p.image && !p.description) return null;
      return { ...p, url: p.url || url };
    },
  });

// =====================================================================
// K3 — tłumaczenie wiadomości na język interfejsu.
// =====================================================================

export type TranslateTarget = "pl" | "en" | "uk";
export interface Translation {
  text: string;
  source_lang: string | null;
}

export async function translateMessage(messageId: string, target: TranslateTarget): Promise<Translation> {
  const { data, error } = await supabase.functions.invoke("translate-message", {
    body: { message_id: messageId, target },
    silent: true,
  } as any);
  if (error) {
    const e = error as FnError;
    if (e?.status === 503 || e?.context?.code === "AI_NOT_CONFIGURED") {
      throw Object.assign(
        new Error(
          (typeof e?.context?.error === "string" && e.context.error) ||
            "Tłumaczenie nie jest jeszcze włączone. Poproś administratora o skonfigurowanie AI w ustawieniach integracji.",
        ),
        { code: "AI_NOT_CONFIGURED" },
      );
    }
    throw fnError(e, "Nie udało się przetłumaczyć wiadomości. Spróbuj ponownie.");
  }
  const text = String((data as any)?.text ?? "").trim();
  if (!text) throw new Error("Nie udało się przetłumaczyć tej wiadomości.");
  return { text, source_lang: (data as any)?.source_lang ?? null };
}

const LANG_NAMES: Record<string, string> = {
  pl: "polskiego",
  en: "angielskiego",
  uk: "ukraińskiego",
  de: "niemieckiego",
  ru: "rosyjskiego",
  es: "hiszpańskiego",
  fr: "francuskiego",
  it: "włoskiego",
};
/** „Przetłumaczono z angielskiego” / „Przetłumaczono”. */
export const translatedFromLabel = (source: string | null | undefined): string => {
  const k = String(source ?? "").toLowerCase().slice(0, 2);
  return LANG_NAMES[k] ? `Przetłumaczono z ${LANG_NAMES[k]}` : "Przetłumaczono";
};

// =====================================================================
// K4 — ciche godziny czatu (push_user_preferences, wiersz osobisty: jeden na osobę).
// =====================================================================

export interface QuietHours {
  /** Czy ciche godziny są ustawione (obie godziny). */
  enabled: boolean;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  timezone: string;
}

const hm = (v: unknown): string => {
  const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw";
  } catch {
    return "Europe/Warsaw";
  }
};

export const quietHoursKey = (email: string | null) => ["chatQuietHours", email] as const;

export const useQuietHours = (email: string | null) =>
  useQuery({
    queryKey: quietHoursKey(email),
    enabled: !!email,
    queryFn: async (): Promise<QuietHours & { rowEmail: string | null }> => {
      // Serwer zwraca tylko mój wiersz (tabela osobista) — bez filtra po wielkości liter.
      const { data, error } = await supabase
        .from("push_user_preferences")
        .select("user_email, quiet_hours_start, quiet_hours_end, timezone")
        .limit(5);
      if (error) {
        if (errorKind(error) === "config") return { enabled: false, start: "", end: "", timezone: deviceTimezone(), rowEmail: null };
        throw error;
      }
      const row = ((data ?? []) as any[]).find((r) => sameEmail(r.user_email, email)) ?? null;
      const start = hm(row?.quiet_hours_start);
      const end = hm(row?.quiet_hours_end);
      return {
        enabled: !!start && !!end,
        start,
        end,
        timezone: row?.timezone || deviceTimezone(),
        rowEmail: row?.user_email ?? null,
      };
    },
  });

export const useSaveQuietHours = (email: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { enabled: boolean; start: string; end: string }) => {
      if (!email) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      const values = {
        quiet_hours_start: v.enabled ? v.start : null,
        quiet_hours_end: v.enabled ? v.end : null,
        timezone: deviceTimezone(),
      };
      // Istniejący wiersz (klucz = e-mail w tej wielkości liter, w jakiej go zapisano) → zmiana;
      // brak → nowy. Upsert po user_email przy innej wielkości liter dopisałby drugi wiersz.
      const { data: rows, error: readErr } = await supabase
        .from("push_user_preferences")
        .select("user_email")
        .limit(5);
      if (readErr) throw readErr;
      const existing = ((rows ?? []) as any[]).find((r) => sameEmail(r.user_email, email));
      if (existing) {
        const { data, error } = await (supabase.from("push_user_preferences") as any)
          .update(values)
          .eq("user_email", existing.user_email)
          .select("user_email");
        if (error) throw error;
        if (!data || (Array.isArray(data) && data.length === 0)) throw new Error("Nie udało się zapisać cichych godzin.");
      } else {
        const { error } = await (supabase.from("push_user_preferences") as any)
          .insert({ user_email: email, enabled: true, ...values })
          .select("user_email");
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatQuietHours"] }),
  });
};

// =====================================================================
// K9 — polityka rozmów prywatnych (GET /api/fn/chat-policy).
// =====================================================================

// Kontrakt serwera (fn/chat-policy): { dm, protectMinors, canStartDirect,
//   canStartDirectWith: 'all'|'leaders'|'minors'|null, isLeader, isMinor, allowedWith? }.
export type DirectScope = "all" | "leaders" | "minors" | null;
export interface ChatPolicy {
  dm: "all" | "leaders" | "off";
  protectMinors: boolean;
  /** Czy w ogóle mogę zaczynać rozmowy 1:1. */
  canStartDirect: boolean;
  /** Z kim: wszyscy / tylko liderzy i administratorzy / (osoba niepełnoletnia) tylko rówieśnicy i rodzina. */
  scope: DirectScope;
  isLeader: boolean;
  isMinor: boolean;
}

const DEFAULT_POLICY: ChatPolicy = { dm: "all", protectMinors: true, canStartDirect: true, scope: "all", isLeader: false, isMinor: false };

export const normalizePolicy = (raw: any): ChatPolicy => {
  if (!raw || typeof raw !== "object") return DEFAULT_POLICY;
  const dm = raw.dm === "leaders" || raw.dm === "off" ? raw.dm : "all";
  const withVal = raw.canStartDirectWith;
  const scopeFromServer: DirectScope | undefined =
    withVal === null ? null : ["all", "leaders", "minors"].includes(withVal) ? withVal : undefined;
  const canStartDirect =
    dm === "off"
      ? false
      : typeof raw.canStartDirect === "boolean"
        ? raw.canStartDirect
        : scopeFromServer !== undefined
          ? scopeFromServer !== null
          : true;
  return {
    dm,
    protectMinors: raw.protectMinors !== false,
    canStartDirect,
    scope: !canStartDirect ? null : scopeFromServer ?? (dm === "leaders" && !raw.isLeader ? "leaders" : "all"),
    isLeader: !!raw.isLeader,
    isMinor: !!raw.isMinor,
  };
};

/**
 * Z kim konkretnie wolno zacząć rozmowę 1:1 (POST chat-policy { with: [e-maile] } → allowedWith).
 * Mapa e-mail (małe litery) → bool; brak wpisu = nie wiadomo (serwer i tak zdecyduje).
 */
export const useDirectAllowed = (emails: string[], enabled: boolean) => {
  const list = Array.from(new Set(emails.map(normEmail).filter((e) => e.includes("@")))).sort();
  return useQuery({
    queryKey: ["chatPolicyWith", list.join(",")],
    enabled: enabled && list.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const out: Record<string, boolean> = {};
      for (let i = 0; i < list.length; i += 200) {
        const { data, error } = await supabase.functions.invoke("chat-policy", {
          body: { with: list.slice(i, i + 200) },
          silent: true,
        } as any);
        if (error || !(data as any)?.allowedWith) return out;
        for (const [k, v] of Object.entries((data as any).allowedWith)) out[normEmail(k)] = !!v;
      }
      return out;
    },
  });
};

export const useChatPolicy = (enabled = true) =>
  useQuery({
    queryKey: ["chatPolicy"],
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<ChatPolicy> => {
      try {
        const res: Response = await (supabase as any)._request("/api/fn/chat-policy");
        if (res.ok) return normalizePolicy(await res.json().catch(() => null));
        // Serwer z polityką tylko pod POST — spróbuj tak.
        if (res.status === 404 || res.status === 405) {
          const { data, error } = await supabase.functions.invoke("chat-policy", { body: {}, silent: true } as any);
          if (!error && data) return normalizePolicy(data);
        }
      } catch {
        /* brak sieci — nie blokujemy pisania; serwer i tak sprawdzi */
      }
      return DEFAULT_POLICY;
    },
  });

// =====================================================================
// K10 — zgłaszanie wiadomości i blokowanie osób.
// =====================================================================

export const REPORT_REASONS: { key: string; label: string }[] = [
  { key: "spam", label: "Spam lub reklama" },
  { key: "abuse", label: "Obraźliwe lub nienawistne treści" },
  { key: "harassment", label: "Nękanie lub zastraszanie" },
  { key: "inappropriate", label: "Nieodpowiednie treści" },
  { key: "other", label: "Inny powód" },
];

export const useReportMessage = (userEmail: string | null) =>
  useMutation({
    mutationFn: async (v: { messageId: string; conversationId: string; reason: string }) => {
      if (!userEmail) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      const { error } = await (supabase.from("message_reports") as any)
        .insert({
          message_id: v.messageId,
          conversation_id: v.conversationId,
          reporter_email: userEmail,
          reason: v.reason,
          status: "open",
        })
        .select("id");
      if (error) {
        if (errorKind(error) === "config") throw new Error(NOT_YET);
        throw error;
      }
    },
  });

export const blocksKey = (email: string | null) => ["userBlocks", email] as const;

/** Osoby, które zablokowałem (znormalizowane e-maile). Brak tabeli = nikt. */
export const useMyBlocks = (email: string | null) =>
  useQuery({
    queryKey: blocksKey(email),
    enabled: !!email,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("user_blocks").select("blocker_email, blocked_email");
      if (error) return [];
      return ((data ?? []) as any[])
        .filter((r) => !r.blocker_email || sameEmail(r.blocker_email, email))
        .map((r) => normEmail(r.blocked_email))
        .filter(Boolean);
    },
  });

export const useToggleBlock = (email: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ target, blocked }: { target: string; blocked: boolean }) => {
      if (!email) throw new Error("Twoja sesja wygasła. Zaloguj się ponownie.");
      if (blocked) {
        const { data, error } = await (supabase.from("user_blocks") as any)
          .delete()
          .ilike("blocked_email", emailPattern(target))
          .select("blocked_email");
        if (error) throw errorKind(error) === "config" ? new Error(NOT_YET) : error;
        if (!data || (Array.isArray(data) && data.length === 0)) throw new Error("Ta osoba nie jest zablokowana.");
      } else {
        const { error } = await (supabase.from("user_blocks") as any)
          .insert({ blocker_email: email, blocked_email: target })
          .select("blocked_email");
        // Już zablokowana (klucz główny) — cel osiągnięty.
        if (error && errorKind(error) !== "duplicate") throw errorKind(error) === "config" ? new Error(NOT_YET) : error;
      }
      return { target, blocked: !blocked };
    },
    onSuccess: ({ target, blocked }) => {
      qc.setQueryData<string[]>(blocksKey(email), (prev: string[] | undefined) => {
        const set = new Set(prev ?? []);
        if (blocked) set.add(normEmail(target));
        else set.delete(normEmail(target));
        return Array.from(set);
      });
      qc.invalidateQueries({ queryKey: ["userBlocks"] });
    },
  });
};

// Kody odmów serwera (K9/K10) → tytuł okna z błędem.
export const chatErrorTitle = (e: unknown, fallback: string): string => {
  const code = (e as { code?: string } | null)?.code;
  if (code === "DM_NOT_ALLOWED") return "Nie można rozpocząć rozmowy prywatnej";
  if (code === "BLOCKED") return "Nie można wysłać wiadomości";
  return fallback;
};
