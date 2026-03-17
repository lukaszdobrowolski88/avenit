import React, { useState, useEffect } from 'react';
import { supabase, getCachedUser } from '../../lib/supabase';
import {
  User, Lock, Camera, Save, Loader2, CheckCircle, AlertCircle, Mail, Key, Bell, BellOff, Smartphone, FileText, Code, Eye,
  Shield, ShieldCheck, ShieldOff, KeyRound, RefreshCw, Copy, Download, Calendar, Link, ExternalLink, QrCode, X
} from 'lucide-react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useTwoFactor } from '../../hooks/useTwoFactor';
import TwoFactorSetup from '../../components/TwoFactorSetup';

export default function UserSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [userSession, setUserSession] = useState(null);

  // Dane formularza
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    avatar_url: null
  });

  // Dane hasła
  const [passData, setPassData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  // Podpis email
  const [mailSignature, setMailSignature] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);
  const [signatureMode, setSignatureMode] = useState('preview'); // 'html' | 'preview'

  // 2FA
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFactorStatus, setTwoFactorStatus] = useState({ enabled: false, verifiedAt: null });
  const [disable2FACode, setDisable2FACode] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodesData, setBackupCodesData] = useState({ unused: [], used: [] });
  const [regenerateCode, setRegenerateCode] = useState('');

  // iCal Subscription
  const [icalSubscription, setIcalSubscription] = useState(null);
  const [icalLoading, setIcalLoading] = useState(false);
  const [showIcalQrCode, setShowIcalQrCode] = useState(false);
  const [icalPreferences, setIcalPreferences] = useState({
    programs: true,
    events: true,
    tasks: true,
    mlodziezowka: false,
    worship: false,
    media: false,
    atmosfera: false,
    kids: false,
    homegroups: false
  });

  // Push notifications
  const {
    isSupported: pushSupported,
    isSubscribed: pushSubscribed,
    permission: pushPermission,
    loading: pushLoading,
    error: pushError,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
    sendTestNotification
  } = usePushNotifications(formData.email);

  // 2FA Hook
  const {
    loading: twoFactorLoading,
    error: twoFactorError,
    checkTwoFactorStatus,
    disableTwoFactor,
    regenerateBackupCodes,
    getBackupCodes
  } = useTwoFactor(formData.email);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  // Sprawdź status 2FA
  useEffect(() => {
    const check2FA = async () => {
      if (!formData.email) return;
      const status = await checkTwoFactorStatus(formData.email);
      setTwoFactorStatus(status);
    };
    check2FA();
  }, [formData.email, checkTwoFactorStatus]);

  // Pobierz podpis email
  useEffect(() => {
    const fetchMailSignature = async () => {
      if (!formData.email) return;

      const { data } = await supabase
        .from('mail_accounts')
        .select('signature')
        .eq('user_email', formData.email)
        .eq('default_account', true)
        .maybeSingle();

      if (data?.signature) {
        setMailSignature(data.signature);
      }
    };

    fetchMailSignature();
  }, [formData.email]);

  const fetchUserProfile = async () => {
    setLoading(true);

    // Timeout - nie blokuj UI dłużej niż 5 sekund
    const timeoutId = setTimeout(() => {
      console.warn('UserSettings fetch timeout');
      setLoading(false);
    }, 5000);

    try {
      // 1. Pobierz sesję (aby znać email) - używamy cache
      const user = await getCachedUser();
      if (!user) {
        clearTimeout(timeoutId);
        setLoading(false);
        return;
      }
      setUserSession(user);

      // 2. Pobierz dane z tabeli app_users na podstawie emaila
      const { data: profile } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (profile) {
        setFormData({
          full_name: profile.full_name || '',
          email: profile.email, // Email jest read-only
          avatar_url: profile.avatar_url
        });
      } else {
        // Fallback, jeśli nie ma profilu w app_users (np. superadmin)
        setFormData({ full_name: '', email: user.email, avatar_url: null });
      }
    } catch (err) {
      console.error(err);
    }
    clearTimeout(timeoutId);
    setLoading(false);
  };

  // --- LOGIKA AVATARA ---
  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSaving(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `avatar-${userSession.id}-${Date.now()}.${fileExt}`;
      
      // Upload do Supabase Storage
      const { error: uploadError } = await supabase.storage.from('public-assets').upload(fileName, file);
      if (uploadError) throw uploadError;

      // Pobranie publicznego URL
      const { data } = supabase.storage.from('public-assets').getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      // Aktualizacja stanu i bazy
      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
      await updateProfileData({ avatar_url: publicUrl });
      
      setMessage({ type: 'success', text: 'Zdjęcie profilowe zaktualizowane!' });
      // Przeładowanie strony, aby odświeżyć avatar w Sidebarze
      setTimeout(() => window.location.reload(), 1000);

    } catch (err) {
      setMessage({ type: 'error', text: 'Błąd wysyłania zdjęcia.' });
    }
    setSaving(false);
  };

  // --- LOGIKA DANYCH OSOBOWYCH ---
  const updateProfileData = async (updates = {}) => {
    // Łączymy aktualny stan formularza z ewentualnymi nadpisaniami (np. avatar)
    const dataToUpdate = { 
      full_name: formData.full_name, 
      ...updates 
    };

    try {
      // Aktualizacja w app_users
      const { error } = await supabase
        .from('app_users')
        .update(dataToUpdate)
        .eq('email', formData.email);

      if (error) throw error;

      // Opcjonalnie: Aktualizacja metadanych w Auth (dla spójności)
      await supabase.auth.updateUser({
        data: { full_name: dataToUpdate.full_name }
      });

    } catch (err) {
      console.error("Błąd aktualizacji profilu:", err);
      throw err;
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfileData();
      setMessage({ type: 'success', text: 'Dane zapisane pomyślnie.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Nie udało się zapisać danych.' });
    }
    setSaving(false);
  };

  // --- LOGIKA PODPISU EMAIL ---
  const handleSaveSignature = async () => {
    setSavingSignature(true);
    try {
      // Sprawdź czy istnieje konto wewnętrzne
      const { data: existingAccount } = await supabase
        .from('mail_accounts')
        .select('id')
        .eq('user_email', formData.email)
        .eq('default_account', true)
        .maybeSingle();

      if (existingAccount) {
        // Aktualizuj istniejące
        const { error } = await supabase
          .from('mail_accounts')
          .update({ signature: mailSignature })
          .eq('id', existingAccount.id);

        if (error) throw error;
      } else {
        // Utwórz nowe konto wewnętrzne z podpisem
        const { error } = await supabase
          .from('mail_accounts')
          .insert({
            user_email: formData.email,
            account_type: 'internal',
            default_account: true,
            signature: mailSignature
          });

        if (error) throw error;
      }

      setMessage({ type: 'success', text: 'Podpis email zapisany.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Nie udało się zapisać podpisu.' });
    }
    setSavingSignature(false);
  };

  // --- LOGIKA 2FA ---
  const handle2FASetupComplete = async () => {
    setShow2FASetup(false);
    const status = await checkTwoFactorStatus(formData.email);
    setTwoFactorStatus(status);
    setMessage({ type: 'success', text: 'Uwierzytelnianie dwuskładnikowe zostało włączone!' });
  };

  const handleDisable2FA = async () => {
    if (!disable2FACode || disable2FACode.length !== 6) {
      setMessage({ type: 'error', text: 'Wprowadź 6-cyfrowy kod weryfikacyjny.' });
      return;
    }

    const result = await disableTwoFactor(disable2FACode);
    if (result.success) {
      setTwoFactorStatus({ enabled: false, verifiedAt: null });
      setDisable2FACode('');
      setMessage({ type: 'success', text: 'Uwierzytelnianie dwuskładnikowe zostało wyłączone.' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Nie udało się wyłączyć 2FA.' });
    }
  };

  const handleShowBackupCodes = async () => {
    const codes = await getBackupCodes();
    setBackupCodesData(codes);
    setShowBackupCodes(true);
  };

  const handleRegenerateBackupCodes = async () => {
    if (!regenerateCode || regenerateCode.length !== 6) {
      setMessage({ type: 'error', text: 'Wprowadź 6-cyfrowy kod weryfikacyjny.' });
      return;
    }

    const result = await regenerateBackupCodes(regenerateCode);
    if (result.success) {
      setBackupCodesData({ unused: result.backupCodes.map(c => ({ code: c })), used: [] });
      setRegenerateCode('');
      setMessage({ type: 'success', text: 'Wygenerowano nowe kody zapasowe.' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Nie udało się wygenerować kodów.' });
    }
  };

  const copyBackupCodes = () => {
    const codes = backupCodesData.unused.map(c => c.code).join('\n');
    navigator.clipboard.writeText(codes);
    setMessage({ type: 'success', text: 'Kody skopiowane do schowka.' });
  };

  const downloadBackupCodes = () => {
    const codes = backupCodesData.unused.map(c => c.code).join('\n');
    const blob = new Blob([`Church Manager - Kody zapasowe 2FA\n\n${codes}\n\nUwaga: Każdy kod może być użyty tylko raz.`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'church-manager-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- LOGIKA iCAL ---
  // Pobierz subskrypcję iCal
  useEffect(() => {
    const fetchIcalSubscription = async () => {
      if (!formData.email) return;

      try {
        const { data, error } = await supabase
          .from('ical_subscriptions')
          .select('*')
          .eq('user_email', formData.email)
          .maybeSingle();

        if (error) {
          console.warn('iCal subscription fetch error (możliwe że tabela nie istnieje):', error.message);
          return;
        }

        if (data) {
          setIcalSubscription(data);
          setIcalPreferences(data.export_preferences || icalPreferences);
        }
      } catch (err) {
        console.warn('iCal subscription error:', err);
      }
    };

    fetchIcalSubscription();
  }, [formData.email]);

  // Generowanie nowego tokena
  const generateIcalToken = () => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  };

  // Utworzenie lub reset subskrypcji iCal
  const handleCreateOrResetIcal = async () => {
    setIcalLoading(true);
    const newToken = generateIcalToken();

    try {
      if (icalSubscription) {
        // Reset tokena
        const { error } = await supabase
          .from('ical_subscriptions')
          .update({
            token: newToken,
            export_preferences: icalPreferences
          })
          .eq('id', icalSubscription.id);

        if (!error) {
          setIcalSubscription({ ...icalSubscription, token: newToken, export_preferences: icalPreferences });
          setMessage({ type: 'success', text: 'Token kalendarza został zresetowany. Poprzedni link przestał działać.' });
        } else {
          throw error;
        }
      } else {
        // Nowa subskrypcja
        const { data, error } = await supabase
          .from('ical_subscriptions')
          .insert({
            user_email: formData.email,
            token: newToken,
            export_preferences: icalPreferences
          })
          .select()
          .single();

        if (!error && data) {
          setIcalSubscription(data);
          setMessage({ type: 'success', text: 'Subskrypcja kalendarza została utworzona!' });
        } else {
          throw error;
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Nie udało się utworzyć/zresetować subskrypcji.' });
    }
    setIcalLoading(false);
  };

  // Aktualizacja preferencji iCal
  const handleUpdateIcalPreferences = async () => {
    if (!icalSubscription) return;
    setIcalLoading(true);

    try {
      const { error } = await supabase
        .from('ical_subscriptions')
        .update({ export_preferences: icalPreferences })
        .eq('id', icalSubscription.id);

      if (!error) {
        setIcalSubscription({ ...icalSubscription, export_preferences: icalPreferences });
        setMessage({ type: 'success', text: 'Preferencje kalendarza zapisane.' });
      } else {
        throw error;
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Nie udało się zapisać preferencji.' });
    }
    setIcalLoading(false);
  };

  // URL subskrypcji iCal
  const getIcalSubscriptionUrl = () => {
    if (!icalSubscription) return '';
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${baseUrl}/functions/v1/ical/${icalSubscription.token}`;
  };

  // Kopiowanie URL do schowka
  const copyIcalUrl = () => {
    navigator.clipboard.writeText(getIcalSubscriptionUrl());
    setMessage({ type: 'success', text: 'Link skopiowany do schowka!' });
  };

  // Pobieranie pliku .ics
  const downloadIcs = () => {
    window.open(getIcalSubscriptionUrl(), '_blank');
  };

  // --- LOGIKA HASŁA ---
  const handleChangePassword = async () => {
    setMessage(null);
    if (passData.newPassword !== passData.confirmPassword) {
      return setMessage({ type: 'error', text: 'Hasła nie są identyczne.' });
    }
    if (passData.newPassword.length < 6) {
      return setMessage({ type: 'error', text: 'Hasło musi mieć min. 6 znaków.' });
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passData.newPassword });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Hasło zostało zmienione.' });
      setPassData({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setSaving(false);
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-pink-600 dark:text-pink-400"/></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">Mój Profil</h1>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-2 cursor-pointer animate-fade-in ${message.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`} onClick={() => setMessage(null)}>
          {message.type === 'success' ? <CheckCircle size={20}/> : <AlertCircle size={20}/>} {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEWA KOLUMNA: Karta Profilu i Avatar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center relative overflow-hidden transition-colors duration-300">
            <div className="w-full h-24 bg-gradient-to-r from-pink-500 to-orange-500 absolute top-0 left-0 opacity-10"></div>
            
            <div className="relative mt-4 mb-4 group">
              <div className="w-32 h-32 rounded-full border-4 border-white dark:border-gray-700 shadow-xl overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center transition-colors duration-300">
                {formData.avatar_url ? (
                  <img src={formData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={48} className="text-gray-300 dark:text-gray-600" />
                )}
              </div>
              <label className="absolute bottom-0 right-0 bg-pink-600 text-white p-2.5 rounded-full cursor-pointer hover:bg-pink-700 dark:hover:bg-pink-500 shadow-lg transition-transform hover:scale-110">
                <Camera size={18} />
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={saving}/>
              </label>
            </div>

            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{formData.full_name || 'Użytkownik'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{formData.email}</p>
          </div>
        </div>

        {/* PRAWA KOLUMNA: Formularze */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* DANE OSOBOWE */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 transition-colors duration-300">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="p-2 bg-pink-50 dark:bg-pink-900/30 rounded-xl text-pink-600 dark:text-pink-400"><User size={24} /></div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Dane Osobowe</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Imię i Nazwisko</label>
                <input 
                  className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-pink-500 dark:focus:border-pink-400 outline-none transition"
                  value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                  placeholder="Np. Jan Kowalski"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Adres Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500"/>
                  <input 
                    className="w-full p-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    value={formData.email}
                    disabled
                  />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 ml-1">Zmiana adresu email wymaga kontaktu z administratorem.</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={handleSaveProfile} disabled={saving} className="bg-pink-600 dark:bg-pink-500 text-white px-6 py-2.5 rounded-xl font-bold hover:shadow-lg hover:bg-pink-700 dark:hover:bg-pink-600 transition flex items-center gap-2">
                {saving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} Zapisz zmiany
              </button>
            </div>
          </div>

          {/* POWIADOMIENIA PUSH */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 transition-colors duration-300">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400"><Smartphone size={24} /></div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Powiadomienia Push</h3>
            </div>

            {!pushSupported ? (
              <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-gray-500 dark:text-gray-400">
                <BellOff size={20} />
                <span>Twoja przeglądarka nie obsługuje powiadomień push.</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    {pushSubscribed ? (
                      <Bell size={20} className="text-green-500" />
                    ) : (
                      <BellOff size={20} className="text-gray-400" />
                    )}
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-200">
                        {pushSubscribed ? 'Powiadomienia włączone' : 'Powiadomienia wyłączone'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {pushPermission === 'denied'
                          ? 'Powiadomienia są zablokowane w ustawieniach przeglądarki'
                          : pushSubscribed
                            ? 'Otrzymujesz powiadomienia o nowych wiadomościach'
                            : 'Włącz, aby otrzymywać powiadomienia nawet gdy aplikacja jest zamknięta'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={pushSubscribed ? unsubscribePush : subscribePush}
                    disabled={pushLoading || pushPermission === 'denied'}
                    className={`px-4 py-2 rounded-xl font-medium transition flex items-center gap-2 ${
                      pushSubscribed
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    } ${(pushLoading || pushPermission === 'denied') ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {pushLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : pushSubscribed ? (
                      <>
                        <BellOff size={16} />
                        Wyłącz
                      </>
                    ) : (
                      <>
                        <Bell size={16} />
                        Włącz
                      </>
                    )}
                  </button>
                </div>

                {pushError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                    <AlertCircle size={16} />
                    {pushError}
                  </div>
                )}

                {pushSubscribed && (
                  <button
                    onClick={sendTestNotification}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Bell size={14} />
                    Wyślij testowe powiadomienie
                  </button>
                )}
              </div>
            )}
          </div>

          {/* UWIERZYTELNIANIE DWUSKŁADNIKOWE (2FA) */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 transition-colors duration-300">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Shield size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Uwierzytelnianie dwuskładnikowe</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Dodatkowa warstwa bezpieczeństwa dla Twojego konta</p>
              </div>
            </div>

            {twoFactorStatus.enabled ? (
              <div className="space-y-4">
                {/* Status: Włączone */}
                <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={24} className="text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="font-medium text-emerald-800 dark:text-emerald-300">2FA włączone</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Aktywowane {twoFactorStatus.verifiedAt
                          ? new Date(twoFactorStatus.verifiedAt).toLocaleDateString('pl-PL')
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Kody zapasowe */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <KeyRound size={18} className="text-gray-600 dark:text-gray-400" />
                      <span className="font-medium text-gray-700 dark:text-gray-300">Kody zapasowe</span>
                    </div>
                    <button
                      onClick={handleShowBackupCodes}
                      className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Pokaż kody
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Kody zapasowe pozwalają zalogować się, gdy nie masz dostępu do aplikacji Google Authenticator.
                  </p>
                </div>

                {/* Modal z kodami zapasowymi */}
                {showBackupCodes && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                      <h4 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Kody zapasowe</h4>

                      <div className="space-y-2 mb-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Pozostało: <span className="font-medium text-emerald-600">{backupCodesData.unused.length}</span> z 10 kodów
                        </p>
                        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg font-mono text-sm">
                          {backupCodesData.unused.map((c, i) => (
                            <div key={i} className="text-gray-800 dark:text-gray-200">{c.code}</div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={copyBackupCodes}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                        >
                          <Copy size={16} />
                          Kopiuj
                        </button>
                        <button
                          onClick={downloadBackupCodes}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                        >
                          <Download size={16} />
                          Pobierz
                        </button>
                      </div>

                      {/* Regeneracja kodów */}
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          Wygeneruj nowe kody (wymagany kod z aplikacji):
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={regenerateCode}
                            onChange={(e) => setRegenerateCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-center font-mono tracking-widest"
                          />
                          <button
                            onClick={handleRegenerateBackupCodes}
                            disabled={twoFactorLoading}
                            className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-1"
                          >
                            {twoFactorLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => setShowBackupCodes(false)}
                        className="w-full mt-4 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
                      >
                        Zamknij
                      </button>
                    </div>
                  </div>
                )}

                {/* Wyłączanie 2FA */}
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldOff size={18} className="text-red-600 dark:text-red-400" />
                    <span className="font-medium text-red-800 dark:text-red-300">Wyłącz 2FA</span>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                    Wprowadź kod z aplikacji Google Authenticator, aby wyłączyć uwierzytelnianie dwuskładnikowe.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={disable2FACode}
                      onChange={(e) => setDisable2FACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="flex-1 px-3 py-2 border border-red-200 dark:border-red-800 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-center font-mono tracking-widest"
                    />
                    <button
                      onClick={handleDisable2FA}
                      disabled={twoFactorLoading}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-2"
                    >
                      {twoFactorLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldOff size={16} />}
                      Wyłącz
                    </button>
                  </div>
                </div>

                {twoFactorError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                    <AlertCircle size={16} />
                    {twoFactorError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status: Wyłączone */}
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <ShieldOff size={24} className="text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-300">2FA wyłączone</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Włącz, aby zwiększyć bezpieczeństwo konta
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShow2FASetup(true)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition flex items-center gap-2"
                  >
                    <Shield size={16} />
                    Włącz 2FA
                  </button>
                </div>

                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <p className="mb-2 font-medium">Jak działa 2FA?</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Zainstaluj aplikację Google Authenticator lub podobną na telefonie</li>
                    <li>Zeskanuj kod QR lub wprowadź klucz ręcznie</li>
                    <li>Przy każdym logowaniu wprowadź 6-cyfrowy kod z aplikacji</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

          {/* Modal konfiguracji 2FA */}
          {show2FASetup && (
            <TwoFactorSetup
              userEmail={formData.email}
              onEnabled={handle2FASetupComplete}
              onClose={() => setShow2FASetup(false)}
            />
          )}

          {/* SUBSKRYPCJA KALENDARZA iCAL */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 transition-colors duration-300">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-xl text-orange-600 dark:text-orange-400">
                <Calendar size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Subskrypcja Kalendarza</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Synchronizuj wydarzenia z Google Calendar, Apple Calendar lub Outlook
                </p>
              </div>
            </div>

            {/* Konfiguracja źródeł */}
            <div className="space-y-4 mb-6">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Wybierz co chcesz eksportować:
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { key: 'programs', label: 'Nabożeństwa', icon: '⛪' },
                  { key: 'events', label: 'Wydarzenia', icon: '📅' },
                  { key: 'tasks', label: 'Zadania', icon: '✅' },
                  { key: 'mlodziezowka', label: 'Młodzieżówka', icon: '🎉' },
                  { key: 'worship', label: 'Uwielbienie', icon: '🎵' },
                  { key: 'media', label: 'Media', icon: '🎬' },
                  { key: 'atmosfera', label: 'Atmosfera', icon: '💚' },
                  { key: 'kids', label: 'Dzieci', icon: '👶' },
                  { key: 'homegroups', label: 'Grupy Domowe', icon: '🏠' }
                ].map(item => (
                  <label
                    key={item.key}
                    className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition ${
                      icalPreferences[item.key]
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                        : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={icalPreferences[item.key]}
                      onChange={(e) => setIcalPreferences({
                        ...icalPreferences,
                        [item.key]: e.target.checked
                      })}
                      className="sr-only"
                    />
                    <span className="text-lg">{item.icon}</span>
                    <span className={`text-sm font-medium ${
                      icalPreferences[item.key]
                        ? 'text-orange-800 dark:text-orange-300'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {item.label}
                    </span>
                    {icalPreferences[item.key] && (
                      <CheckCircle size={16} className="ml-auto text-orange-600 dark:text-orange-400" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Link subskrypcji lub przycisk tworzenia */}
            {icalSubscription ? (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Link subskrypcji (dodaj do aplikacji kalendarzowej)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={getIcalSubscriptionUrl()}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 font-mono truncate"
                    />
                    <button
                      onClick={copyIcalUrl}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                      title="Kopiuj link"
                    >
                      <Copy size={18} />
                    </button>
                    <button
                      onClick={() => setShowIcalQrCode(true)}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                      title="Pokaż kod QR"
                    >
                      <QrCode size={18} />
                    </button>
                    <button
                      onClick={downloadIcs}
                      className="px-3 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition"
                      title="Pobierz plik .ics"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    Wklej ten link w Google Calendar (Inne kalendarze → Z adresu URL) lub Apple Calendar (Plik → Nowa subskrypcja)
                  </p>
                </div>

                {/* Statystyki */}
                {icalSubscription.last_accessed_at && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Ostatnia synchronizacja: {new Date(icalSubscription.last_accessed_at).toLocaleString('pl-PL')}
                    {icalSubscription.access_count > 0 && ` (łączna liczba: ${icalSubscription.access_count})`}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleUpdateIcalPreferences}
                    disabled={icalLoading}
                    className="flex-1 px-4 py-2.5 bg-orange-600 text-white font-medium rounded-xl hover:bg-orange-700 transition flex items-center justify-center gap-2"
                  >
                    {icalLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Zapisz preferencje
                  </button>
                  <button
                    onClick={handleCreateOrResetIcal}
                    disabled={icalLoading}
                    className="px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition flex items-center gap-2"
                    title="Resetuj token (poprzedni link przestanie działać)"
                  >
                    <RefreshCw size={16} />
                    Resetuj token
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleCreateOrResetIcal}
                disabled={icalLoading}
                className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition flex items-center justify-center gap-2"
              >
                {icalLoading ? <Loader2 size={18} className="animate-spin" /> : <Calendar size={18} />}
                Utwórz subskrypcję kalendarza
              </button>
            )}

            {/* Modal z kodem QR */}
            {showIcalQrCode && icalSubscription && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                      <QrCode size={20} className="text-orange-600 dark:text-orange-400" />
                      Kod QR kalendarza
                    </h4>
                    <button
                      onClick={() => setShowIcalQrCode(false)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-white rounded-xl">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getIcalSubscriptionUrl())}`}
                        alt="QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
                    Zeskanuj kod QR aparatem telefonu, aby dodać kalendarz do aplikacji
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={copyIcalUrl}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                    >
                      <Copy size={16} />
                      Kopiuj link
                    </button>
                    <button
                      onClick={() => setShowIcalQrCode(false)}
                      className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition"
                    >
                      Zamknij
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Instrukcja */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                Jak dodać kalendarz?
              </p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
                <li><strong>Google Calendar:</strong> Ustawienia → Dodaj kalendarz → Z adresu URL</li>
                <li><strong>Apple Calendar:</strong> Plik → Nowa subskrypcja kalendarza</li>
                <li><strong>Outlook:</strong> Dodaj kalendarz → Subskrybuj z internetu</li>
              </ul>
            </div>
          </div>

          {/* PODPIS EMAIL */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 transition-colors duration-300">
            <div className="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400"><FileText size={24} /></div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Podpis Email (HTML)</h3>
              </div>
              {/* Toggle HTML/Preview */}
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setSignatureMode('html')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    signatureMode === 'html'
                      ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Code size={14} />
                  HTML
                </button>
                <button
                  onClick={() => setSignatureMode('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    signatureMode === 'preview'
                      ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Eye size={14} />
                  Podgląd
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Możesz wkleić gotowy podpis HTML z zewnętrznego narzędzia lub edytora. Podpis będzie automatycznie dodawany na końcu wysyłanych wiadomości.
              </p>

              {signatureMode === 'html' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Kod HTML podpisu</label>
                  <textarea
                    value={mailSignature}
                    onChange={(e) => setMailSignature(e.target.value)}
                    placeholder={`<div style="font-family: Arial, sans-serif;">
  <p style="margin: 0; color: #333;">Z pozdrowieniami,</p>
  <p style="margin: 5px 0 0; font-weight: bold; color: #333;">Jan Kowalski</p>
  <p style="margin: 5px 0 0; color: #666; font-size: 14px;">Kościół [Nazwa]</p>
  <p style="margin: 5px 0 0; color: #666; font-size: 12px;">Tel: +48 123 456 789</p>
</div>`}
                    rows={10}
                    className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-purple-500 dark:focus:border-purple-400 outline-none transition resize-none font-mono text-sm"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    Wskazówka: Możesz skopiować podpis z Gmail, Outlook lub wygenerować go w narzędziach online.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Podgląd podpisu</label>
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 min-h-[120px]">
                    {mailSignature ? (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: mailSignature }}
                      />
                    ) : (
                      <p className="text-gray-400 dark:text-gray-500 italic text-sm">
                        Brak podpisu. Przejdź do zakładki HTML, aby dodać podpis.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveSignature}
                disabled={savingSignature}
                className="bg-purple-600 dark:bg-purple-500 text-white px-6 py-2.5 rounded-xl font-bold hover:shadow-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition flex items-center gap-2"
              >
                {savingSignature ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} Zapisz podpis
              </button>
            </div>
          </div>

          {/* BEZPIECZEŃSTWO */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 transition-colors duration-300">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-xl text-red-600 dark:text-red-400"><Lock size={24} /></div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Bezpieczeństwo</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nowe hasło</label>
                <div className="relative">
                  <Key size={18} className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500"/>
                  <input 
                    type="password"
                    className="w-full p-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-red-400 dark:focus:border-red-500 outline-none transition"
                    placeholder="••••••••"
                    value={passData.newPassword}
                    onChange={e => setPassData({...passData, newPassword: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Potwierdź hasło</label>
                <div className="relative">
                  <Key size={18} className="absolute left-3 top-3.5 text-gray-400 dark:text-gray-500"/>
                  <input 
                    type="password"
                    className="w-full p-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-red-400 dark:focus:border-red-500 outline-none transition"
                    placeholder="••••••••"
                    value={passData.confirmPassword}
                    onChange={e => setPassData({...passData, confirmPassword: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={handleChangePassword} disabled={saving} className="bg-gray-800 dark:bg-gray-700 text-white px-6 py-2.5 rounded-xl font-bold hover:shadow-lg hover:bg-black dark:hover:bg-gray-600 transition flex items-center gap-2">
                {saving ? <Loader2 size={18} className="animate-spin"/> : <Lock size={18}/>} Zmień hasło
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
