import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export default function useMailAccounts(userEmail) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pobierz konta email użytkownika
  const fetchAccounts = useCallback(async () => {
    if (!userEmail) return;

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('mail_accounts')
        .select('*')
        .eq('user_email', userEmail)
        .order('default_account', { ascending: false })
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      setAccounts(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching mail accounts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  // Pobierz przy montowaniu
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Utwórz konto wewnętrzne (jeśli nie istnieje)
  const ensureInternalAccount = useCallback(async () => {
    if (!userEmail) return null;

    // Sprawdź czy istnieje konto wewnętrzne
    const existingInternal = accounts.find(a => a.account_type === 'internal');
    if (existingInternal) return existingInternal;

    try {
      const { data, error: createError } = await supabase
        .from('mail_accounts')
        .insert({
          user_email: userEmail,
          account_type: 'internal',
          default_account: true
        })
        .select()
        .single();

      if (createError) throw createError;

      await fetchAccounts();
      return data;
    } catch (err) {
      console.error('Error creating internal mail account:', err);
      setError(err.message);
      return null;
    }
  }, [userEmail, accounts, fetchAccounts]);

  // Utwórz konto zewnętrzne
  const createExternalAccount = useCallback(async (accountData) => {
    if (!userEmail) return null;

    try {
      // Zaszyfruj hasło przez Edge Function
      let encryptedPassword = null;
      if (accountData.password) {
        const { data: encryptData, error: encryptError } = await supabase.functions.invoke(
          'encrypt-credentials',
          { body: { password: accountData.password } }
        );
        if (encryptError) throw encryptError;
        encryptedPassword = encryptData.encrypted;
      }

      const { data, error: createError } = await supabase
        .from('mail_accounts')
        .insert({
          user_email: userEmail,
          account_type: 'external',
          external_email: accountData.email,
          imap_host: accountData.imapHost,
          imap_port: accountData.imapPort || 993,
          imap_secure: accountData.imapSecure !== false,
          smtp_host: accountData.smtpHost,
          smtp_port: accountData.smtpPort || 465,
          smtp_secure: accountData.smtpSecure !== false,
          encrypted_password: encryptedPassword,
          signature: accountData.signature || '',
          default_account: false,
          sync_enabled: true
        })
        .select()
        .single();

      if (createError) throw createError;

      await fetchAccounts();
      return data;
    } catch (err) {
      console.error('Error creating external mail account:', err);
      setError(err.message);
      return null;
    }
  }, [userEmail, fetchAccounts]);

  // Aktualizuj konto
  const updateAccount = useCallback(async (accountId, updates) => {
    try {
      // Jeśli aktualizujemy hasło, zaszyfruj je
      let updateData = { ...updates };
      if (updates.password) {
        const { data: encryptData, error: encryptError } = await supabase.functions.invoke(
          'encrypt-credentials',
          { body: { password: updates.password } }
        );
        if (encryptError) throw encryptError;
        updateData.encrypted_password = encryptData.encrypted;
        delete updateData.password;
      }

      const { error: updateError } = await supabase
        .from('mail_accounts')
        .update(updateData)
        .eq('id', accountId);

      if (updateError) throw updateError;

      await fetchAccounts();
      return true;
    } catch (err) {
      console.error('Error updating mail account:', err);
      setError(err.message);
      return false;
    }
  }, [fetchAccounts]);

  // Ustaw konto jako domyślne
  const setDefaultAccount = useCallback(async (accountId) => {
    try {
      // Najpierw odznacz wszystkie
      await supabase
        .from('mail_accounts')
        .update({ default_account: false })
        .eq('user_email', userEmail);

      // Ustaw nowe domyślne
      await supabase
        .from('mail_accounts')
        .update({ default_account: true })
        .eq('id', accountId);

      await fetchAccounts();
      return true;
    } catch (err) {
      console.error('Error setting default account:', err);
      setError(err.message);
      return false;
    }
  }, [userEmail, fetchAccounts]);

  // Usuń konto
  const deleteAccount = useCallback(async (accountId) => {
    try {
      const { error: deleteError } = await supabase
        .from('mail_accounts')
        .delete()
        .eq('id', accountId);

      if (deleteError) throw deleteError;

      await fetchAccounts();
      return true;
    } catch (err) {
      console.error('Error deleting mail account:', err);
      setError(err.message);
      return false;
    }
  }, [fetchAccounts]);

  // Aktualizuj podpis
  const updateSignature = useCallback(async (accountId, signature) => {
    return updateAccount(accountId, { signature });
  }, [updateAccount]);

  // Testuj połączenie z serwerem IMAP
  const testConnection = useCallback(async (accountId) => {
    try {
      const { data, error: testError } = await supabase.functions.invoke(
        'sync-mail',
        {
          body: {
            account_id: accountId,
            action: 'test'
          }
        }
      );

      if (testError) throw testError;
      return { success: data?.success ?? true, message: data?.message || 'OK' };
    } catch (err) {
      console.error('Error testing connection:', err);
      return { success: false, message: err.message };
    }
  }, []);

  // Synchronizuj pocztę z IMAP
  const syncMail = useCallback(async (accountId, limit = 50) => {
    try {
      const { data, error: syncError } = await supabase.functions.invoke(
        'sync-mail',
        {
          body: {
            account_id: accountId,
            action: 'sync',
            limit
          }
        }
      );

      if (syncError) throw syncError;

      // Odśwież konta żeby zaktualizować last_sync_at
      await fetchAccounts();

      return {
        success: data?.success ?? true,
        message: data?.message || 'Zsynchronizowano',
        fetched: data?.fetched || 0,
        saved: data?.saved || 0
      };
    } catch (err) {
      console.error('Error syncing mail:', err);
      return { success: false, message: err.message };
    }
  }, [fetchAccounts]);

  // Ustaw konto jako systemowe (do wysyłania maili z kont wewnętrznych do zewnętrznych)
  const setSystemDefault = useCallback(async (accountId) => {
    try {
      // Najpierw odznacz wszystkie konta systemowe
      await supabase
        .from('mail_accounts')
        .update({ system_default: false })
        .eq('system_default', true);

      // Ustaw nowe systemowe (jeśli podano)
      if (accountId) {
        await supabase
          .from('mail_accounts')
          .update({ system_default: true })
          .eq('id', accountId);
      }

      await fetchAccounts();
      return true;
    } catch (err) {
      console.error('Error setting system default account:', err);
      setError(err.message);
      return false;
    }
  }, [fetchAccounts]);

  // Pobierz domyślne konto użytkownika
  const defaultAccount = accounts.find(a => a.default_account) || accounts[0] || null;

  // Pobierz konto systemowe (do wysyłki zewnętrznej z kont wewnętrznych)
  const systemAccount = accounts.find(a => a.system_default) || null;

  return {
    accounts,
    defaultAccount,
    systemAccount,
    loading,
    error,
    refetch: fetchAccounts,
    ensureInternalAccount,
    createExternalAccount,
    updateAccount,
    setDefaultAccount,
    setSystemDefault,
    deleteAccount,
    updateSignature,
    testConnection,
    syncMail
  };
}
