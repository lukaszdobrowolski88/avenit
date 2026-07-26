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

export const signInWithPassword = (email: string, password: string, totpCode?: string) =>
  supabase.auth.signInWithPassword({ email, password, totpCode });

// ── 2FA: weryfikacja WYŁĄCZNIE po stronie serwera ──────────────────────────
// Backend (/api/auth/login) sam sprawdza kod TOTP/kod zapasowy i dopiero wtedy
// wydaje sesję — sekret nigdy nie trafia do klienta. Poświadczenia oczekujące
// na drugi składnik trzymamy TYLKO w pamięci procesu (nigdy w SecureStore ani
// w parametrach nawigacji), i czyścimy zaraz po użyciu.
let pending2fa: { email: string; password: string } | null = null;

export const beginTwoFactor = (email: string, password: string) => {
  pending2fa = { email, password };
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
  const { email, password } = pending2fa;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    totpCode: code,
  });
  if (error) return { error };
  // Gdyby backend nadal żądał 2FA (np. pusty/nieprawidłowy kod przepuszczony) — traktuj jak błąd.
  if ((data as { requires2fa?: boolean })?.requires2fa) {
    return { error: { message: 'Nieprawidłowy kod weryfikacyjny' } };
  }
  pending2fa = null;
  return { error: null };
};

export const signOut = () => {
  clearPending2fa();
  return supabase.auth.signOut();
};

export const sendPasswordReset = (email: string) =>
  supabase.auth.resetPasswordForEmail(email);
