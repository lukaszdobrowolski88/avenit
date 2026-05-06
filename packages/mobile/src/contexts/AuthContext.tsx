import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, clearUserCache } from '../lib/supabase';
import { setBiometricEnabled } from '../lib/biometric';
import type { User, Session } from '@supabase/supabase-js';

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
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkTotpStatus(session.user.id);
      }
      setLoading(false);
    });

    // Nasłuchuj zmian auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        setNeedsTotpSetup(false);
        setTotpVerified(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkTotpStatus(userId: string) {
    try {
      const { data } = await supabase
        .from('app_users')
        .select('totp_required, totp_enabled')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (data?.totp_required && !data?.totp_enabled) {
        setNeedsTotpSetup(true);
      }
    } catch (err) {
      console.error('Error checking TOTP status:', err);
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        await checkTotpStatus(data.user.id);
      }

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
