import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, clearUserCache } from '../lib/supabase';
import { setBiometricEnabled } from '../lib/biometric';
import type { AuthUser as User, AuthSession as Session } from '../lib/auth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  needsTotpSetup: boolean;
  totpVerified: boolean;
  setTotpVerified: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({}),
  signOut: async () => {},
  needsTotpSetup: false,
  totpVerified: false,
  setTotpVerified: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsTotpSetup, setNeedsTotpSetup] = useState(false);
  const [totpVerified, setTotpVerified] = useState(false);

  useEffect(() => {
    // Sprawdź istniejącą sesję
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session as any);
      setUser((session?.user as any) ?? null);
      if (session?.user) {
        checkTotpStatus(session.user as any);
      }
      setLoading(false);
    });

    // Nasłuchuj zmian auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) checkTotpStatus(session.user);
      if (!session) {
        setNeedsTotpSetup(false);
        setTotpVerified(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Status 2FA odczytujemy z obiektu użytkownika (API zwraca totp_required/enabled).
  function checkTotpStatus(u: any) {
    if (u?.totp_required && !u?.totp_enabled) setNeedsTotpSetup(true);
    else setNeedsTotpSetup(false);
  }

  async function signIn(email: string, password: string, totpCode?: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password, totpCode });
      if (error) return { error: error.message };
      // Serwer sygnalizuje potrzebę kodu 2FA.
      if ((data as any)?.requires2fa) return { requires2fa: true };
      if (data.user) checkTotpStatus(data.user);
      return {};
    } catch (err: any) {
      return { error: err.message || 'Błąd logowania' };
    }
  }

  async function signOut() {
    clearUserCache();
    await setBiometricEnabled(false).catch(() => undefined);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setNeedsTotpSetup(false);
    setTotpVerified(false);
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signIn,
      signOut,
      needsTotpSetup,
      totpVerified,
      setTotpVerified,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
