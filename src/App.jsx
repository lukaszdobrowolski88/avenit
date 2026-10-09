import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import Spinner from './components/Spinner';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import NotFound from './components/NotFound';
import { useAppModules, refreshAppModules } from './hooks/useAppModules';
import { MERGED_MODULE_TARGETS } from './components/navConfig';
import { supabase } from './lib/supabase';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { CampusProvider } from './contexts/CampusContext';
import { NotificationProvider, useNotificationContext } from './contexts/NotificationContext';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import ToastContainer from './components/ToastNotification';
import Toaster from './components/Toaster';
import DialogHost from './components/DialogHost';

import Sidebar, { SidebarProvider } from './components/Sidebar';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import KioskGuard from './modules/Kids/checkin/KioskGuard';
import InstallPrompt from './components/InstallPrompt';
import AnnouncementBanner from './components/AnnouncementBanner';
import PlanUsageNotice from './modules/Billing/PlanUsageNotice';
import CommandPalette from './components/CommandPalette';
import { OnboardingProvider } from './onboarding/OnboardingContext';
import { CallProvider } from './modules/Komunikator/calls/CallProvider';
import OnboardingLayer from './onboarding/OnboardingLayer';
import { I18nProvider, useI18n } from './i18n';
import { PageTracker, identify as analyticsIdentify, trackLogin } from './lib/analytics';
import useOffline from './hooks/useOffline';
import Login from './modules/Login';
import ResetPassword from './modules/ResetPassword';
import TwoFactorSetup from './components/TwoFactorSetup';
// Publiczne strony (osobne wejścia bez logowania) — zwykły import, bo renderowane
// w gałęziach early-return, które nie mają granicy <Suspense>.
import GiveOnlinePage from './modules/Giving/GiveOnlinePage';
import CampaignWidgetPage from './modules/Giving/CampaignWidgetPage';
import SermonPublicPage from './modules/Sermons/SermonPublicPage';
import LegalPage from './pages/public/LegalPage';
import RsvpPublicPage from './modules/Rsvp/RsvpPublicPage';
import PublicFormPage from './modules/Forms/pages/PublicFormPage';
import PublicModulePage from './modules/CustomModule/pages/PublicModulePage';
import PublicBoardForm from './modules/Boards/pages/PublicBoardForm';
import AssignmentResponsePage from './modules/AssignmentResponse/AssignmentResponsePage';

// Moduły uwierzytelnionej apki — code-splitting (React.lazy): każdy trafia do
// osobnego chunku ładowanego dopiero przy wejściu w trasę. Skraca bundle logowania
// (wcześniej strona logowania ciągnęła kod ~35 modułów naraz).
const PersonalDashboard = lazy(() => import('./modules/Dashboard/PersonalDashboard'));
const ProgramsList = lazy(() => import('./modules/Programs/ProgramsList'));
const ProgramDetail = lazy(() => import('./modules/Programs/ProgramDetail'));
const Members = lazy(() => import('./modules/Members'));
const WorshipModule = lazy(() => import('./modules/MusicTeam/WorshipModule'));
const MediaTeamModule = lazy(() => import('./modules/MediaTeamModule'));
const AtmosferaTeamModule = lazy(() => import('./modules/AtmosferaTeamModule'));
const KidsModule = lazy(() => import('./modules/Kids/KidsModule'));
const HomeGroupsModule = lazy(() => import('./modules/HomeGroups/HomeGroupsModule'));
const FinanceModule = lazy(() => import('./modules/FinanceModule'));
const GivingModule = lazy(() => import('./modules/Giving/GivingModule'));
const AttendanceModule = lazy(() => import('./modules/Attendance/AttendanceModule'));
const AnalyticsModule = lazy(() => import('./modules/Analytics/AnalyticsModule'));
const AutomationModule = lazy(() => import('./modules/Automation/AutomationModule'));
const AiAssistantModule = lazy(() => import('./modules/AI/AiAssistantModule'));
const RoomsModule = lazy(() => import('./modules/Rooms/RoomsModule'));
const ServeModule = lazy(() => import('./modules/Serve/ServeModule'));
const RsvpModule = lazy(() => import('./modules/Rsvp/RsvpModule'));
const GlobalSettings = lazy(() => import('./modules/Settings/GlobalSettings'));
const UserSettings = lazy(() => import('./modules/Settings/UserSettings'));
const CalendarModule = lazy(() => import('./modules/CalendarModule'));
const TeachingModule = lazy(() => import('./modules/Teaching/TeachingModule'));
const PrayerWallModule = lazy(() => import('./modules/PrayerWall/PrayerWallModule'));
const KomunikatorModule = lazy(() => import('./modules/Komunikator/KomunikatorModule'));
const MlodziezowkaModule = lazy(() => import('./modules/MlodziezowkaModule'));
const MailingModule = lazy(() => import('./modules/Mailing/MailingModule'));
const PushCampaignsModule = lazy(() => import('./modules/PushCampaigns/PushCampaignsModule'));
const SmsCampaignsModule = lazy(() => import('./modules/SmsCampaigns/SmsCampaignsModule'));
const MailModule = lazy(() => import('./modules/Mail/MailModule'));
const FormsModule = lazy(() => import('./modules/Forms/FormsModule'));
const CustomModule = lazy(() => import('./modules/CustomModule/CustomModule'));
const BoardsModule = lazy(() => import('./modules/Boards/BoardsModule'));
const EventDetailPage = lazy(() => import('./modules/EventDetailPage'));
const EventsModule = lazy(() => import('./modules/Events/EventsModule'));
import { tr } from './i18n';
import { AI_ENABLED } from './lib/features';

// Lista kluczy systemowych modułów (mają dedykowane komponenty)
const SYSTEM_MODULE_KEYS = [
  'dashboard', 'programs', 'calendar', 'members', 'worship', 'media',
  'atmosfera', 'kids', 'homegroups', 'finance', 'giving', 'teaching', 'prayer',
  'komunikator', 'mlodziezowka', 'mailing', 'mail', 'forms', 'settings', 'push_campaigns', 'sms_campaigns',
  'attendance', 'analytics', 'automation', 'ai', 'sermons', 'care', 'rooms', 'serve', 'rsvp', 'boards'
];

// Fallback dla granicy <Suspense> — pokazywany na czas doładowania chunku modułu (lazy).
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={32} />
    </div>
  );
}

// Komponent do wyświetlania toast notifications (używa context)
function ToastNotifications() {
  const { toasts, closeToast, handleToastClick } = useNotificationContext();
  return <ToastContainer toasts={toasts} onClose={closeToast} onClick={handleToastClick} />;
}

// Błąd ładowania fragmentu kodu po wdrożeniu nowej wersji (stary chunk zniknął z serwera).
const isChunkLoadError = (err) => /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(String(err?.message || err || ''));

// Error Boundary - zapobiega crashowi całej aplikacji. resetKey (ścieżka) czyści błąd przy
// przejściu na inną stronę, żeby jeden zepsuty widok nie blokował całej nawigacji (UXE-22).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }
  render() {
    if (this.state.hasError) {
      const chunk = isChunkLoadError(this.state.error);
      return (
        <div className="max-w-lg mx-auto p-10 text-center" role="alert">
          <h1 className="text-gray-900 dark:text-white mb-2 text-xl font-bold">
            {chunk ? tr('Jest nowa wersja aplikacji') : tr('Nie udało się wyświetlić tej strony')}
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">
            {chunk
              ? tr('Odśwież stronę, aby wczytać najnowszą wersję. Twoje zapisane dane są bezpieczne.')
              : tr('Coś poszło nie tak po naszej stronie. Odśwież stronę albo wróć na pulpit. Jeśli problem się powtarza, napisz do administratora.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button type="button" onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }} className="min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl text-sm font-medium">{tr('Odśwież stronę')}</button>
            {!chunk && (
              <a href="/" className="min-h-[44px] inline-flex items-center justify-center px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium">{tr('Wróć do pulpitu')}</a>
            )}
          </div>
          {!chunk && this.state.error?.message && (
            <details className="mt-6 text-left text-xs text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer select-none">{tr('Szczegóły techniczne')}</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{String(this.state.error.message)}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// Granica błędu zależna od ścieżki — reset po zmianie strony.
function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

// Trasa „*”: dopóki lista modułów (także tych z kreatora) się nie wczyta, pokazujemy spinner
// zamiast przekierowania — odświeżenie /faceci nie wyrzuca już na Pulpit (UXE-02).
// Wejście z /login, /register itp. (linki ze strony głównej, maile): po zalogowaniu adres zostawał
// /login i trafiał w stronę 404 — przenosimy na ?next= (tylko ścieżka w obrębie aplikacji) albo Pulpit.
const AUTH_ENTRY = /^\/(login|logowanie|zaloguj|signin|register|rejestracja|auth)(\/|$)/i;
function CatchAllRoute({ modulesLoaded }) {
  const { pathname, search } = useLocation();
  if (AUTH_ENTRY.test(pathname)) {
    const next = new URLSearchParams(search).get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') && !AUTH_ENTRY.test(next) ? next : '/';
    return <Navigate to={safeNext} replace />;
  }
  return modulesLoaded ? <NotFound /> : <PageLoader />;
}

// Przy zmianie strony przenieś fokus do treści (czytnik ekranu ogłasza nową stronę), ale tylko
// gdy fokus był w menu albo nigdzie — nie zabieramy go polom z autofocusem (A11Y-14).
function FocusMainOnRouteChange() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const main = document.getElementById('tresc');
    if (!main) return;
    const ae = document.activeElement;
    const inNav = !ae || ae === document.body || ae.closest?.('[data-tour="sidebar"], .app-topbar, .app-sidebar-panel');
    if (inNav) {
      try { main.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }, [pathname]);
  return null;
}

// Link „Przejdź do treści” — pierwszy element strony dla klawiatury (A11Y-14).
function SkipToContent() {
  return (
    <a
      href="#tresc"
      onClick={(e) => { e.preventDefault(); const m = document.getElementById('tresc'); if (m) m.focus(); }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100100] focus:px-4 focus:py-3 focus:rounded-xl focus:bg-white focus:text-gray-900 focus:shadow-xl focus:ring-2 focus:ring-accent-primary dark:focus:bg-gray-800 dark:focus:text-white"
    >
      {tr('Przejdź do treści')}
    </a>
  );
}

// Komponent baneru offline
function OfflineBanner() {
  const { isOffline } = useOffline();

  if (!isOffline) return null;

  return (
    <div className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium">
      {tr('Brak połączenia z internetem. Niektóre funkcje mogą być niedostępne.')}
    </div>
  );
}

// Jedno źródło prawdy szerokości modułów: wszystkie strony mają szerokość pulpitu (cała
// dostępna szerokość, te same marginesy), z limitem tylko na bardzo szerokich ekranach.
// Pełnoekranowe powłoki (Komunikator/Mail) idą bez limitu.
const FULL_BLEED_PATHS = new Set(['/komunikator', '/mail']);
function ModuleContainer({ children }) {
  const { pathname } = useLocation();
  const full = FULL_BLEED_PATHS.has(pathname);
  return <div className={full ? 'w-full' : 'w-full max-w-[1920px] mx-auto'}>{children}</div>;
}

function AppInner() {
  const { lang } = useI18n(); // język do remountu powłoki przy zmianie (globalne tr())
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requires2FASetup, setRequires2FASetup] = useState(false);
  // Moduły z bazy (wspólny magazyn z menu i ⌘K). Trasy modułów z kreatora startują z cache,
  // a trasa „*” czeka na pierwsze pobranie (modulesLoaded), zamiast przekierowywać (UXE-02).
  const { modules: appModules, loaded: modulesLoaded } = useAppModules({ autoLoad: false });
  const customModules = appModules.filter((m) => m && m.is_enabled && m.path && !SYSTEM_MODULE_KEYS.includes(m.key));

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

  // Pobierz moduły (także niestandardowe) dopiero, gdy jest sesja — wcześniej API odpowie 401,
  // a po zalogowaniu bez przeładowania strony trasy modułów z kreatora by się nie pojawiły.
  const sessionEmail = session?.user?.email || null;
  useEffect(() => {
    if (sessionEmail && !requires2FASetup) refreshAppModules();
  }, [sessionEmail, requires2FASetup]);

  // Sprawdź czy użytkownik ma wymagane 2FA - z timeout i bez blokowania
  const check2FARequirement = async (userEmail) => {
    if (!userEmail) return;

    // Użyj Promise.race z 2-sekundowym timeout
    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve({ data: null, timeout: true }), 2000)
    );

    try {
      // Wymóg 2FA liczy serwer (claim n2fa) i zwraca w /me jako needs2fa — czytamy z sesji,
      // a nie z /api/db (który jest blokowany, gdy 2FA jest wymagane).
      const result = await Promise.race([supabase.auth.getUser(), timeoutPromise]);
      if (result.timeout) { setRequires2FASetup(false); return; }
      setRequires2FASetup(Boolean(result?.data?.user?.needs2fa));
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
        // Logowanie przez bilet SSO z app.<domena> (?ticket=...) — wymień na sesję.
        const params = new URLSearchParams(window.location.search);
        const ticket = params.get('ticket');
        if (ticket && supabase.auth.loginWithTicket) {
          await supabase.auth.loginWithTicket(ticket).catch(() => {});
          // Usuń bilet z URL (żeby nie został w historii/odświeżeniu).
          params.delete('ticket');
          const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
          window.history.replaceState({}, '', clean);
        }

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
        // Analityka: powiąż odwiedzającego z użytkownikiem (serwer weryfikuje cookie).
        if (_event === 'SIGNED_IN') trackLogin();
        analyticsIdentify(session.user);
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
          <Spinner size={48} className="mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">{tr('Ładowanie...')}</p>
        </div>
      </div>
    );
  }

  // Sprawdź czy to jest strona resetowania hasła (dostępna bez logowania przy odpowiednim tokenie)
  const isResetPasswordPage = window.location.pathname === '/reset-password' ||
                               window.location.hash.includes('type=recovery');

  // Sprawdź czy to jest publiczna strona formularza (dostępna bez logowania)
  const isPublicFormPage = window.location.pathname.startsWith('/form/');

  // Publiczny formularz tablicy (Boards / WorkForms) — bez logowania
  const isPublicBoardForm = window.location.pathname.startsWith('/formularz/');

  // Sprawdź czy to jest strona odpowiedzi na przypisanie (dostępna bez logowania)
  const isAssignmentResponsePage = window.location.pathname === '/assignment-response';

  // Sprawdź czy to jest publiczna strona kazania (dostępna bez logowania)
  const isPublicSermonPage = window.location.pathname.startsWith('/sermon/');

  // Publiczne strony prawne (polityka prywatności / regulamin) — bez logowania.
  // Wymagane m.in. przez publikację logowania Google (link do polityki prywatności).
  const isLegalPage = window.location.pathname === '/polityka-prywatnosci' || window.location.pathname === '/regulamin';
  if (isLegalPage) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/polityka-prywatnosci" element={<LegalPage kind="privacy" />} />
          <Route path="/regulamin" element={<LegalPage kind="terms" />} />
          <Route path="*" element={<Navigate to="/polityka-prywatnosci" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Publiczne kazanie - renderuj bez wymogu logowania
  if (isPublicSermonPage) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/sermon/:slug" element={<SermonPublicPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Publiczna strona dawania online - dostępna bez logowania
  const isPublicGivePage = window.location.pathname === '/give' || window.location.pathname.startsWith('/give/');
  if (isPublicGivePage) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/give" element={<GiveOnlinePage />} />
          <Route path="/give/success" element={<GiveOnlinePage success />} />
          <Route path="*" element={<Navigate to="/give" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Publiczny widget termometru zbiórki (osadzany iframe) - bez logowania
  const isWidgetCampaignPage = window.location.pathname.startsWith('/widget/campaign/');
  if (isWidgetCampaignPage) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/widget/campaign/:id" element={<CampaignWidgetPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Publiczna strona odpowiedzi RSVP (/rsvp/:token) - dostępna bez logowania
  const isPublicRsvpPage = window.location.pathname.startsWith('/rsvp/');
  if (isPublicRsvpPage) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/rsvp/:token" element={<RsvpPublicPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

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

  // Publiczna strona kreatora (/p/:slug) - dostępna bez logowania
  if (window.location.pathname.startsWith('/p/')) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/p/:slug" element={<PublicModulePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Publiczny formularz tablicy - renderuj bez wymogu logowania
  if (isPublicBoardForm) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/formularz/:token" element={<PublicBoardForm />} />
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
      {/* Analityka: odsłony przy zmianie trasy + otwarcia modułów */}
      <PageTracker />
      {/* Tryb kiosku meldowania dzieci: każda trasa poza /kids wraca do kiosku */}
      <KioskGuard />
      <PermissionsProvider>
        <OnboardingProvider user={session.user}>
        <CampusProvider>
          <NotificationProvider userEmail={session.user?.email}>
            <UnsavedChangesProvider>
            {/* Połączenia audio/wideo (Komunikator): dzwonek i okno rozmowy na każdej trasie.
                Poza <div key={lang}> — zmiana języka nie przerywa rozmowy. */}
            <CallProvider userEmail={session.user?.email}>
            <SidebarProvider>
              <SkipToContent />
              <FocusMainOnRouteChange />
              <div key={lang} className="flex h-screen app-shell-bg transition-colors duration-300">
                <Sidebar />
              <div className="flex-1 flex flex-col overflow-hidden">
                <Navbar user={session.user} darkMode={darkMode} toggleTheme={toggleTheme} />
                {/* Globalna wyszukiwarka (Cmd/Ctrl+K) */}
                <CommandPalette />
                {/* Onboarding: powitanie, kreator, samouczek, checklista, podpowiedzi */}
                <OnboardingLayer />
                {/* Toast Notifications - fixed positioned */}
                <ToastNotifications />
              {/* PWA Install Prompt */}
              <InstallPrompt />
              {/* Offline Banner */}
              <OfflineBanner />
              {/* Ogłoszenia systemowe z platformy */}
              <AnnouncementBanner />
              {/* Limit dorosłych w planie — tylko dla osób z dostępem do rozliczeń, do zamknięcia */}
              <PlanUsageNotice />
              <main id="tresc" tabIndex={-1} className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar outline-none focus:outline-none">
              <RouteErrorBoundary>
              <Suspense fallback={<PageLoader />}>
              <ModuleContainer>
              <Routes>
                <Route path="/" element={<PersonalDashboard user={session.user} />} />
                <Route path="/programs" element={
                  <ProtectedRoute resource="module:programs"><ProgramsList /></ProtectedRoute>
                } />
                <Route path="/programs/:id" element={
                  <ProtectedRoute resource="module:programs"><ProgramDetail /></ProtectedRoute>
                } />
                <Route path="/wydarzenia" element={
                  <ProtectedRoute resource="module:calendar"><EventsModule /></ProtectedRoute>
                } />
                <Route path="/calendar" element={
                  <ProtectedRoute resource="module:calendar"><EventsModule /></ProtectedRoute>
                } />
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
                <Route path="/giving" element={
                  <ProtectedRoute resource="module:giving"><GivingModule /></ProtectedRoute>
                } />
                <Route path="/attendance" element={
                  <ProtectedRoute resource="module:attendance"><AttendanceModule /></ProtectedRoute>
                } />
                <Route path="/analytics" element={
                  <ProtectedRoute resource="module:analytics"><AnalyticsModule /></ProtectedRoute>
                } />
                <Route path="/automation" element={
                  <ProtectedRoute resource="module:automation"><AutomationModule /></ProtectedRoute>
                } />
                <Route path="/ai" element={
                  !AI_ENABLED ? <Navigate to="/" replace /> : <ProtectedRoute resource="module:ai"><AiAssistantModule /></ProtectedRoute>
                } />
                {/* Kazania wtopione w Nauczanie — /sermons prowadzi prosto na zakładkę „Kazania” */}
                <Route path="/sermons" element={<Navigate to={MERGED_MODULE_TARGETS.sermons} replace />} />
                {/* Opieka/CRM scalona z Członkami — /care prowadzi prosto na zakładkę „Opieka” */}
                <Route path="/care" element={<Navigate to={MERGED_MODULE_TARGETS.care} replace />} />
                <Route path="/rooms" element={
                  <ProtectedRoute resource="module:rooms"><RoomsModule /></ProtectedRoute>
                } />
                <Route path="/serve" element={
                  <ProtectedRoute resource="module:serve"><ServeModule /></ProtectedRoute>
                } />
                <Route path="/rsvp" element={
                  <ProtectedRoute resource="module:rsvp"><RsvpModule /></ProtectedRoute>
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
                <Route path="/push-campaigns" element={
                  <ProtectedRoute resource="module:push_campaigns"><PushCampaignsModule /></ProtectedRoute>
                } />
                <Route path="/sms-campaigns" element={
                  <ProtectedRoute resource="module:sms_campaigns"><SmsCampaignsModule /></ProtectedRoute>
                } />
                <Route path="/mail" element={
                  <ProtectedRoute resource="module:mail"><MailModule /></ProtectedRoute>
                } />
                <Route path="/forms" element={
                  <ProtectedRoute resource="module:forms"><FormsModule userEmail={session.user?.email} /></ProtectedRoute>
                } />
                <Route path="/projekty" element={
                  <ProtectedRoute resource="module:boards"><BoardsModule /></ProtectedRoute>
                } />
                <Route path="/wydarzenie/:id" element={
                  <ProtectedRoute resource="module:calendar"><EventDetailPage /></ProtectedRoute>
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

                <Route path="*" element={<CatchAllRoute modulesLoaded={modulesLoaded} />} />
              </Routes>
              </ModuleContainer>
              </Suspense>
              </RouteErrorBoundary>
              </main>
            </div>
          </div>
            </SidebarProvider>
            </CallProvider>
            </UnsavedChangesProvider>
          </NotificationProvider>
        </CampusProvider>
        </OnboardingProvider>
      </PermissionsProvider>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
      <Toaster />
      <DialogHost />
    </I18nProvider>
  );
}
