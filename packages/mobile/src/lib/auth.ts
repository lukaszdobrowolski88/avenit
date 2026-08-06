import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Kształty sesji/usera z Avenit API (zgodne z dotychczasowym użyciem pól).
export interface AuthUser {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string | null;
  [key: string]: unknown;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  user: AuthUser | null;
}

// Role „służbowe" (lider i wyżej) — widzą moduły, których zwykły członek (czlonek)
// nie ma nadanych w backendzie: Pieśni, Formularze, katalog Członków. Ukrywamy je
// w UI dla członka, żeby nie trafiał na puste/zablokowane ekrany. Nieznana/niestandardowa
// rola => traktowana jak członek (bezpieczniej ukryć potencjalnie pusty ekran).
const STAFF_ROLES = ['superadmin', 'rada_starszych', 'koordynator', 'lider'];
export const isStaffUser = (user: AuthUser | null): boolean => {
  if (!user) return false;
  if (user.is_super_admin === true) return true;
  return STAFF_ROLES.includes(String(user.role ?? ''));
};

export interface AuthState {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
}

export const useAuthSession = (): AuthState => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
};

// ── Logowanie uniwersalne (jedna apka, wszystkie kościoły) ──────────────────
// Nie zaszywamy tenanta w buildzie. Użytkownik podaje sam e-mail+hasło; backend
// (/api/app-login) znajduje kościół(y) po e-mailu, obsługuje wybór gdy konto jest
// w wielu, 2FA (serwerowo), i zwraca jednorazowy bilet SSO. Klient ustawia wtedy
// tenant (utrwalany) i wymienia bilet na sesję przez /api/auth/ticket.

export interface LoginTenant {
  slug: string;
  name: string;
}

export type UniversalLoginResult =
  | { ok: true }
  | { multiple: LoginTenant[] }
  | { requires2fa: true; tenant: string }
  | { error: { message: string } };

export const universalLogin = async (
  email: string,
  password: string,
  opts?: { tenant?: string; totpCode?: string },
): Promise<UniversalLoginResult> => {
  const { data, error } = await supabase.auth.appLogin({
    email,
    password,
    totpCode: opts?.totpCode,
    tenant: opts?.tenant,
  });
  if (error) return { error };
  if (data?.multiple && data.tenants?.length) return { multiple: data.tenants };
  if (data?.requires2fa) return { requires2fa: true, tenant: data.tenant ?? '' };
  if (!data?.ticket || !data?.tenant) {
    return { error: { message: 'Nieprawidłowa odpowiedź logowania' } };
  }
  // Sukces: zapamiętaj kościół i wymień bilet na sesję.
  await supabase.setTenant(data.tenant);
  const { error: ticketError } = await supabase.auth.loginWithTicket(data.ticket);
  if (ticketError) {
    await supabase.setTenant(null);
    return { error: ticketError };
  }
  return { ok: true };
};

// ── 2FA: weryfikacja WYŁĄCZNIE po stronie serwera ──────────────────────────
// Poświadczenia oczekujące na drugi składnik (wraz z rozwiązanym już tenantem)
// trzymamy TYLKO w pamięci procesu — nigdy w SecureStore ani w parametrach nawigacji.
let pending2fa: { email: string; password: string; tenant?: string } | null = null;

export const beginTwoFactor = (email: string, password: string, tenant?: string) => {
  pending2fa = { email, password, tenant };
};

export const clearPending2fa = () => {
  pending2fa = null;
};

export const completeTwoFactorLogin = async (
  code: string,
): Promise<{ error: { message: string } | null }> => {
  if (!pending2fa) {
    return { error: { message: 'Sesja logowania wygasła — zaloguj się ponownie.' } };
  }
  const { email, password, tenant } = pending2fa;
  const result = await universalLogin(email, password, { tenant, totpCode: code });
  if ('ok' in result) {
    pending2fa = null;
    return { error: null };
  }
  if ('error' in result) return { error: result.error };
  // Wciąż requires2fa / multiple przy podanym kodzie → traktuj jak zły kod.
  return { error: { message: 'Nieprawidłowy kod weryfikacyjny' } };
};

export const signOut = () => {
  clearPending2fa();
  return supabase.auth.signOut();
};

export const sendPasswordReset = (email: string) =>
  supabase.auth.resetPasswordForEmail(email);
