import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { NotificationProvider, useNotificationContext } from './contexts/NotificationContext';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import ToastContainer from './components/ToastNotification';

import Sidebar, { SidebarProvider } from './components/Sidebar';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import InstallPrompt from './components/InstallPrompt';
import useOffline from './hooks/useOffline';
import Login from './modules/Login';
import ResetPassword from './modules/ResetPassword';
import TwoFactorSetup from './components/TwoFactorSetup';
import PersonalDashboard from './modules/Dashboard/PersonalDashboard';
import ProgramsDashboard from './modules/Programs/Dashboard';
import Members from './modules/Members';
import WorshipModule from './modules/MusicTeam/WorshipModule';
import MediaTeamModule from './modules/MediaTeamModule';
import AtmosferaTeamModule from './modules/AtmosferaTeamModule';
import KidsModule from './modules/Kids/KidsModule';
import HomeGroupsModule from './modules/HomeGroups/HomeGroupsModule';
import FinanceModule from './modules/FinanceModule';
import GlobalSettings from './modules/Settings/GlobalSettings';
import UserSettings from './modules/Settings/UserSettings';
import CalendarModule from './modules/CalendarModule';
import TeachingModule from './modules/Teaching/TeachingModule';
import PrayerWallModule from './modules/PrayerWall/PrayerWallModule';
import KomunikatorModule from './modules/Komunikator/KomunikatorModule';
import MlodziezowkaModule from './modules/MlodziezowkaModule';
import MailingModule from './modules/Mailing/MailingModule';
import MailModule from './modules/Mail/MailModule';
import FormsModule from './modules/Forms/FormsModule';
import PublicFormPage from './modules/Forms/pages/PublicFormPage';
import AssignmentResponsePage from './modules/AssignmentResponse/AssignmentResponsePage';
import CustomModule from './modules/CustomModule/CustomModule';

// Lista kluczy systemowych modułów (mają dedykowane komponenty)
const SYSTEM_MODULE_KEYS = [
  'dashboard', 'programs', 'calendar', 'members', 'worship', 'media',
  'atmosfera', 'kids', 'homegroups', 'finance', 'teaching', 'prayer',
  'komunikator', 'mlodziezowka', 'mailing', 'mail', 'forms', 'settings'
];

// Komponent do wyświetlania toast notifications (używa context)
function ToastNotifications() {
  const { toasts, closeToast, handleToastClick } = useNotificationContext();
  return <ToastContainer toasts={toasts} onClose={closeToast} onClick={handleToastClick} />;
}

// Komponent baneru offline
function OfflineBanner() {
  const { isOffline } = useOffline();

  if (!isOffline) return null;

  return (
    <div className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium">
      Brak połączenia z internetem. Niektóre funkcje mogą być niedostępne.
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customModules, setCustomModules] = useState([]);
  const [requires2FASetup, setRequires2FASetup] = useState(false);

  // Stan dla trybu ciemnego (domyślnie false)
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme') === 'dark');

  // Efekt do nakładania klasy 'dark' na HTML
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleTheme = () => setDarkMode(!darkMode);

  // Pobierz niestandardowe moduły z bazy danych
  useEffect(() => {
    const fetchCustomModules = async () => {
      try {
        const { data, error } = await supabase
          .from('app_modules')
          .select('*')
          .eq('is_enabled', true)
          .order('display_order', { ascending: true });

        if (!error && data) {
          // Filtruj tylko moduły niestandardowe (nie systemowe)
          const custom = data.filter(m => !SYSTEM_MODULE_KEYS.includes(m.key));
          setCustomModules(custom);
        }
      } catch (err) {
        console.log('Błąd pobierania niestandardowych modułów:', err);
      }
    };

    fetchCustomModules();

    // Subskrybuj zmiany w modułach
    const channel = supabase
      .channel('app-modules-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_modules' }, () => {
        fetchCustomModules();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Sprawdź czy użytkownik ma wymagane 2FA - z timeout i bez blokowania
  const check2FARequirement = async (userEmail) => {
    if (!userEmail) return;

    // Użyj Promise.race z 2-sekundowym timeout
    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve({ data: null, timeout: true }), 2000)
    );

    try {
      const result = await Promise.race([
        supabase
          .from('app_users')
          .select('totp_required, totp_enabled')
          .eq('email', userEmail)
          .maybeSingle(),
        timeoutPromise
      ]);

      // Jeśli timeout lub błąd - nie wymagaj 2FA
      if (result.timeout || result.error) {
        setRequires2FASetup(false);
        return;
      }

      // Jeśli 2FA jest wymagane ale nie skonfigurowane
      if (result.data?.totp_required && !result.data?.totp_enabled) {
        setRequires2FASetup(true);
      } else {
        setRequires2FASetup(false);
      }
    } catch (err) {
      console.error('Error checking 2FA requirement:', err);
      setRequires2FASetup(false);
    }
  };

  useEffect(() => {
    // Timeout bezpieczeństwa - jeśli auth nie odpowie w 3 sekundy, zakończ ładowanie
    const safetyTimeout = setTimeout(() => {
      console.warn('Auth timeout - forcing loading to complete');
      setLoading(false);
    }, 3000);

    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setSession(data.session);
          // Sprawdź 2FA w tle - nie blokuj ładowania
          check2FARequirement(data.session.user?.email);
        }
      } catch (error) {
        console.error('Auth error:', error);
      } finally {
        clearTimeout(safetyTimeout);
        setLoading(false);
      }
    };
    initAuth();

    const authListener = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        await check2FARequirement(session.user?.email);
      } else {
        setRequires2FASetup(false);
      }
    });

    return () => {
      if (authListener?.data?.subscription) {
        authListener.data.subscription.unsubscribe();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">Ładowanie...</p>
        </div>
      </div>
    );
  }

  // Sprawdź czy to jest strona resetowania hasła (dostępna bez logowania przy odpowiednim tokenie)
  const isResetPasswordPage = window.location.pathname === '/reset-password' ||
                               window.location.hash.includes('type=recovery');

  // Sprawdź czy to jest publiczna strona formularza (dostępna bez logowania)
  const isPublicFormPage = window.location.pathname.startsWith('/form/');

  // Sprawdź czy to jest strona odpowiedzi na przypisanie (dostępna bez logowania)
  const isAssignmentResponsePage = window.location.pathname === '/assignment-response';

  // Publiczny formularz - renderuj bez wymogu logowania
  if (isPublicFormPage) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/form/:formId" element={<PublicFormPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Strona odpowiedzi na przypisanie - renderuj bez wymogu logowania
  if (isAssignmentResponsePage) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/assignment-response" element={<AssignmentResponsePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (!session && !isResetPasswordPage) return <Login />;

  // Jeśli użytkownik ma wymagane 2FA ale jeszcze go nie skonfigurował
  if (session && requires2FASetup) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative overflow-hidden">
        {/* Tło ozdobne */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-400/20 dark:bg-emerald-600/10 rounded-full blur-3xl"></div>
          <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] bg-teal-400/20 dark:bg-teal-600/10 rounded-full blur-3xl"></div>
        </div>
        <TwoFactorSetup
          userEmail={session.user?.email}
          isRequired={true}
          onEnabled={() => {
            setRequires2FASetup(false);
          }}
          onClose={async () => {
            // Wyloguj użytkownika jeśli odmówi konfiguracji 2FA
            await supabase.auth.signOut();
          }}
        />
      </div>
    );
  }

  // Jeśli użytkownik jest na stronie reset-password (z tokenem w URL)
  if (isResetPasswordPage) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<ResetPassword />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <PermissionsProvider>
        <NotificationProvider userEmail={session.user?.email}>
          <UnsavedChangesProvider>
            <SidebarProvider>
              <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                <Sidebar />
              <div className="flex-1 flex flex-col overflow-hidden">
                <Navbar user={session.user} darkMode={darkMode} toggleTheme={toggleTheme} />
                {/* Toast Notifications - fixed positioned */}
                <ToastNotifications />
              {/* PWA Install Prompt */}
              <InstallPrompt />
              {/* Offline Banner */}
              <OfflineBanner />
              <main className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar">
              <Routes>
                <Route path="/" element={<PersonalDashboard user={session.user} />} />
                <Route path="/programs" element={<ProgramsDashboard />} />
                <Route path="/calendar" element={<CalendarModule />} />
                <Route path="/members" element={
                  <ProtectedRoute resource="module:members"><Members /></ProtectedRoute>
                } />
                <Route path="/worship" element={
                  <ProtectedRoute resource="module:worship"><WorshipModule /></ProtectedRoute>
                } />
                <Route path="/media" element={
                  <ProtectedRoute resource="module:media"><MediaTeamModule /></ProtectedRoute>
                } />
                <Route path="/atmosfera" element={
                  <ProtectedRoute resource="module:atmosfera"><AtmosferaTeamModule /></ProtectedRoute>
                } />
                <Route path="/kids" element={
                  <ProtectedRoute resource="module:kids"><KidsModule /></ProtectedRoute>
                } />
                <Route path="/home-groups" element={
                  <ProtectedRoute resource="module:homegroups"><HomeGroupsModule /></ProtectedRoute>
                } />
                <Route path="/finance" element={
                  <ProtectedRoute resource="module:finance"><FinanceModule /></ProtectedRoute>
                } />
                <Route path="/teaching" element={
                  <ProtectedRoute resource="module:teaching"><TeachingModule /></ProtectedRoute>
                } />
                <Route path="/prayer" element={
                  <ProtectedRoute resource="module:prayer"><PrayerWallModule /></ProtectedRoute>
                } />
                <Route path="/komunikator" element={
                  <ProtectedRoute resource="module:komunikator"><KomunikatorModule /></ProtectedRoute>
                } />
                <Route path="/mlodziezowka" element={
                  <ProtectedRoute resource="module:mlodziezowka"><MlodziezowkaModule /></ProtectedRoute>
                } />
                <Route path="/mailing" element={
                  <ProtectedRoute resource="module:mailing"><MailingModule /></ProtectedRoute>
                } />
                <Route path="/mail" element={
                  <ProtectedRoute resource="module:mail"><MailModule /></ProtectedRoute>
                } />
                <Route path="/forms" element={
                  <ProtectedRoute resource="module:forms"><FormsModule userEmail={session.user?.email} /></ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute resource="module:settings"><GlobalSettings /></ProtectedRoute>
                } />
                <Route path="/profile" element={<UserSettings />} />

                {/* Dynamiczne trasy dla niestandardowych modułów */}
                {customModules.map(mod => (
                  <Route
                    key={mod.id}
                    path={mod.path}
                    element={
                      <ProtectedRoute resource={mod.resource_key}>
                        <CustomModule />
                      </ProtectedRoute>
                    }
                  />
                ))}

                {/* Trasa generyczna dla modułów z parametrem (fallback) */}
                <Route path="/module/:moduleKey" element={<CustomModule />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </main>
            </div>
          </div>
            </SidebarProvider>
          </UnsavedChangesProvider>
        </NotificationProvider>
      </PermissionsProvider>
    </BrowserRouter>
  );
}
