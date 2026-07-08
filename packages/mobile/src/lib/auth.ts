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
  const [session, setSession] = useState<Session | null>(null);
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

export const signInWithPassword = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const signOut = () => supabase.auth.signOut();

export const sendPasswordReset = (email: string) =>
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'avenit://reset-password',
  });
