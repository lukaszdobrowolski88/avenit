import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCheckin } from './hooks/useCheckin';
import PhoneSearchScreen from './components/PhoneSearchScreen';
import HouseholdSelection from './components/HouseholdSelection';
import MemberCheckin from './components/MemberCheckin';
import GuestCheckinForm from './components/GuestCheckinForm';
import CheckinSuccess from './components/CheckinSuccess';
import CheckoutScreen from './components/CheckoutScreen';
import AttendanceDashboard from './components/AttendanceDashboard';
import SessionManager from './components/SessionManager';
import LocationManager from './components/LocationManager';
import { KioskShell, KioskStartDialog, exitKioskFullscreen } from './components/KioskMode';
import Button from '../../../components/Button';
import { UserCheck, UserPlus, LogOut, ClipboardList, Settings, Calendar, DoorOpen, Play, ShieldCheck, X, AlertCircle } from 'lucide-react';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { useCampusQuery } from '../../../hooks/useCampusQuery';
import { readKioskState, writeKioskState, clearKioskState, parseLocalDate } from './utils/kiosk';

const MODES = {
  CHECKIN: 'checkin',
  GUEST: 'guest',
  CHECKOUT: 'checkout',
  ATTENDANCE: 'attendance',
  SETTINGS: 'settings',
};

const CHECKIN_STEPS = {
  PHONE_SEARCH: 'phone_search',
  HOUSEHOLD_SELECT: 'household_select',
  MEMBER_CHECKIN: 'member_checkin',
  SUCCESS: 'success',
};

const sessionLabelOf = (session) => {
  if (!session) return '';
  const d = parseLocalDate(session.session_date);
  const date = d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  return [session.name, date].filter(Boolean).join(' · ');
};

export default function CheckinTab() {
  const [mode, setMode] = useState(MODES.CHECKIN);
  const [checkinStep, setCheckinStep] = useState(CHECKIN_STEPS.PHONE_SEARCH);
  const [session, setSession] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [locations, setLocations] = useState([]);
  const [selectedHousehold, setSelectedHousehold] = useState(null);
  const [multipleHouseholds, setMultipleHouseholds] = useState([]);
  const [activeByStudent, setActiveByStudent] = useState({});
  const [checkinResults, setCheckinResults] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [guestPrefill, setGuestPrefill] = useState(null);
  const [settingsTab, setSettingsTab] = useState('sessions');
  const [kioskState, setKioskState] = useState(() => readKioskState());
  const [showKioskStart, setShowKioskStart] = useState(false);
  const [notice, setNotice] = useState(null);
  const [idleTick, setIdleTick] = useState(0); // zmiana = świeży ekran kiosku po bezczynności
  const kiosk = !!kioskState;
  const { campusIdForInsert } = useCampusQuery();

  const {
    loading,
    error,
    clearError,
    searchByPhone,
    getActiveSession,
    createTodaySession,
    getLocations,
    getActiveCheckinsForHousehold,
    checkInHousehold,
    checkInGuest,
    addChildToHousehold,
  } = useCheckin();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [sessionData, locationsData] = await Promise.all([getActiveSession(), getLocations()]);
      if (!alive) return;
      setSession(sessionData);
      setLocations(locationsData);
      setSessionLoaded(true);
    })();
    return () => { alive = false; };
  }, [getActiveSession, getLocations]);

  // Poza kioskiem błędy idą do toastu; w kiosku nakładka zasłania toasty — pokazujemy baner.
  useEffect(() => {
    if (error && !kiosk) toast.error(error);
  }, [error, kiosk]);

  const resetCheckinFlow = useCallback(() => {
    setCheckinStep(CHECKIN_STEPS.PHONE_SEARCH);
    setSelectedHousehold(null);
    setMultipleHouseholds([]);
    setActiveByStudent({});
    setCheckinResults([]);
    setSkipped([]);
    setGuestPrefill(null);
    setNotice(null);
  }, []);

  const goToMode = useCallback((next) => {
    clearError();
    if (next === MODES.CHECKIN) resetCheckinFlow();
    if (next !== MODES.GUEST) setGuestPrefill(null);
    setMode(next);
  }, [clearError, resetCheckinFlow]);

  // Sesja powstaje dopiero przy pierwszym meldowaniu (albo po „Rozpocznij sesję”).
  // Równoległe wywołania (podwójne stuknięcie) dzielą jedno tworzenie — bez zdublowanych sesji.
  const sessionPromise = useRef(null);
  const ensureSession = useCallback(async () => {
    if (session) return session;
    if (!sessionPromise.current) {
      sessionPromise.current = createTodaySession().finally(() => { sessionPromise.current = null; });
    }
    const created = await sessionPromise.current;
    if (created) setSession(created);
    return created;
  }, [session, createTodaySession]);

  // Blokada ponownego wysłania meldowania, zanim poprzednie się skończy.
  const submitting = useRef(false);
  const once = useCallback((fn) => async (...args) => {
    if (submitting.current) return;
    submitting.current = true;
    try { await fn(...args); } finally { submitting.current = false; }
  }, []);

  const handleStartSession = async () => {
    setStartingSession(true);
    try {
      const created = await ensureSession();
      if (created) toast.success(tr('Sesja rozpoczęta'));
    } finally {
      setStartingSession(false);
    }
  };

  const loadActiveForHousehold = useCallback(async (household) => {
    if (!session || !household) { setActiveByStudent({}); return; }
    const rows = await getActiveCheckinsForHousehold(session.id, household.id);
    setActiveByStudent(Object.fromEntries(rows.filter((r) => r.student_id != null).map((r) => [r.student_id, r.checked_in_at])));
  }, [session, getActiveCheckinsForHousehold]);

  const openHousehold = useCallback((household) => {
    setSelectedHousehold(household);
    setActiveByStudent({});
    setCheckinStep(CHECKIN_STEPS.MEMBER_CHECKIN);
    loadActiveForHousehold(household);
  }, [loadActiveForHousehold]);

  const handleMultipleHouseholds = useCallback((households) => {
    setMultipleHouseholds(households);
    setCheckinStep(CHECKIN_STEPS.HOUSEHOLD_SELECT);
  }, []);

  const handleMemberCheckin = useCallback(once(async (members) => {
    if (!selectedHousehold) return;
    const s = await ensureSession();
    if (!s) return;
    const { results, skipped: skippedNow } = await checkInHousehold(s.id, selectedHousehold.id, members);
    if (results.length > 0) {
      setCheckinResults(results);
      setSkipped(skippedNow);
      setCheckinStep(CHECKIN_STEPS.SUCCESS);
    } else if (skippedNow.length > 0) {
      const msg = tr('Wybrane dzieci są już zameldowane w tej sesji.');
      if (kiosk) setNotice(msg); else toast.info(msg);
      loadActiveForHousehold(selectedHousehold);
    }
  }), [once, selectedHousehold, ensureSession, checkInHousehold, loadActiveForHousehold, kiosk]);

  const handleGuestCheckin = useCallback(once(async (guestData) => {
    const s = await ensureSession();
    if (!s) return;
    const result = await checkInGuest(s.id, guestData.locationId, guestData);
    if (result) {
      setCheckinResults([result]);
      setSkipped([]);
      setGuestPrefill(null);
      setMode(MODES.CHECKIN);
      setCheckinStep(CHECKIN_STEPS.SUCCESS);
    }
  }), [once, ensureSession, checkInGuest]);

  const handleAddChild = useCallback(async (child) => {
    if (!selectedHousehold) return null;
    const created = await addChildToHousehold(selectedHousehold.id, child, campusIdForInsert);
    if (created) {
      setSelectedHousehold((h) => ({ ...h, kids_students: [...(h?.kids_students || []), created] }));
      if (!kiosk) toast.success(tr('Dodano dziecko do rodziny'));
    }
    return created;
  }, [selectedHousehold, addChildToHousehold, campusIdForInsert, kiosk]);

  const handleGuestFromHousehold = useCallback(() => {
    const contact = selectedHousehold?.parent_contacts?.find((c) => c.is_primary) || selectedHousehold?.parent_contacts?.[0];
    setGuestPrefill(contact ? { parentName: contact.full_name || '', parentPhone: contact.phone || '' } : null);
    clearError();
    setMode(MODES.GUEST);
  }, [selectedHousehold, clearError]);

  const handleBackToSearch = useCallback(() => {
    resetCheckinFlow();
  }, [resetCheckinFlow]);

  // ── Tryb kiosku ──────────────────────────────────────────────────────────
  const handleKioskStart = (state) => {
    if (!writeKioskState(state)) {
      toast.error(tr('Nie udało się włączyć trybu kiosku w tej przeglądarce (zablokowana pamięć strony).'));
      return;
    }
    setKioskState(state);
    setShowKioskStart(false);
    goToMode(MODES.CHECKIN);
  };

  const handleKioskExit = () => {
    clearKioskState();
    exitKioskFullscreen();
    setKioskState(null);
    goToMode(MODES.CHECKIN);
    toast.success(tr('Tryb kiosku wyłączony'));
  };

  // ── Widoki ───────────────────────────────────────────────────────────────
  const navItems = [
    { id: MODES.CHECKIN, icon: UserCheck, label: tr('Meldowanie') },
    { id: MODES.GUEST, icon: UserPlus, label: tr('Gość') },
    { id: MODES.CHECKOUT, icon: LogOut, label: tr('Odbiór') },
    { id: MODES.ATTENDANCE, icon: ClipboardList, label: tr('Lista obecności') },
    { id: MODES.SETTINGS, icon: Settings, label: tr('Ustawienia') },
  ];

  const pillClass = (active) => `flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition
    ${active
      ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md'
      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-accent-primary hover:text-accent-primary dark:hover:text-accent-primary-light'
    }`;

  const renderNav = () => (
    <div className="flex gap-2 p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-wrap items-center">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = mode === item.id;
        return (
          <button key={item.id} type="button" onClick={() => goToMode(item.id)} className={pillClass(isActive)} aria-current={isActive ? 'page' : undefined}>
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
      <div className="flex-1" />
      <Button variant="outline" icon={ShieldCheck} onClick={() => setShowKioskStart(true)}>
        {tr('Tryb kiosku')}
      </Button>
    </div>
  );

  const renderSessionBar = () => {
    if (!sessionLoaded) return null;
    return (
      <div className="flex items-center justify-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 text-sm flex-wrap">
        {session ? (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
            <Calendar size={14} className="text-accent-primary" />
            <span className="font-semibold">{session.name}</span>
            <span className="text-gray-500 dark:text-gray-400">· {sessionLabelOf({ ...session, name: '' })}</span>
          </span>
        ) : (
          <>
            <span className="text-gray-600 dark:text-gray-300">
              {tr('Dziś nie ma jeszcze sesji — rozpocznie się przy pierwszym meldowaniu.')}
            </span>
            <Button size="sm" variant="outline" icon={Play} loading={startingSession} onClick={handleStartSession}>
              {tr('Rozpocznij sesję')}
            </Button>
          </>
        )}
      </div>
    );
  };

  const renderNoRoomsHint = () => {
    if (kiosk || locations.length > 0 || !sessionLoaded) return null;
    if (mode !== MODES.CHECKIN && mode !== MODES.GUEST) return null;
    return (
      <div className="flex items-center justify-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-sm flex-wrap">
        <DoorOpen size={16} className="text-gray-500" />
        <span className="text-gray-700 dark:text-gray-200">
          {tr('Nie dodano jeszcze sal — dzieci zameldujesz bez przydziału do sali.')}
        </span>
        <Button size="sm" variant="outline" onClick={() => { setSettingsTab('locations'); goToMode(MODES.SETTINGS); }}>
          {tr('Dodaj salę')}
        </Button>
      </div>
    );
  };

  const kioskBanner = (kiosk && (error || notice)) ? (
    <div role="alert" className="flex items-center justify-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-base">
      <AlertCircle size={18} className={error ? 'text-red-600' : 'text-accent-primary'} />
      <span>{error || notice}</span>
      <button type="button" onClick={() => { clearError(); setNotice(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={tr('Zamknij')}>
        <X size={16} />
      </button>
    </div>
  ) : null;

  const renderCheckinFlow = () => {
    if (mode === MODES.GUEST) {
      return (
        <GuestCheckinForm
          key={guestPrefill ? 'prefill' : 'blank'}
          locations={locations}
          initialData={guestPrefill}
          onCheckin={handleGuestCheckin}
          onBack={() => goToMode(MODES.CHECKIN)}
          loading={loading}
        />
      );
    }

    switch (checkinStep) {
      case CHECKIN_STEPS.HOUSEHOLD_SELECT:
        return (
          <HouseholdSelection
            households={multipleHouseholds}
            onSelect={openHousehold}
            onBack={handleBackToSearch}
          />
        );
      case CHECKIN_STEPS.MEMBER_CHECKIN:
        return (
          <MemberCheckin
            key={selectedHousehold?.id}
            household={selectedHousehold}
            locations={locations}
            activeByStudent={activeByStudent}
            onCheckin={handleMemberCheckin}
            // W kiosku rodzic nie dopisuje dzieci do bazy — zostaje meldowanie gościa.
            onAddChild={kiosk ? undefined : handleAddChild}
            onGuest={handleGuestFromHousehold}
            onBack={handleBackToSearch}
            loading={loading}
          />
        );
      case CHECKIN_STEPS.SUCCESS:
        return (
          <CheckinSuccess
            checkins={checkinResults}
            skipped={skipped}
            onDone={resetCheckinFlow}
          />
        );
      case CHECKIN_STEPS.PHONE_SEARCH:
      default:
        return (
          <PhoneSearchScreen
            searchByPhone={searchByPhone}
            onHouseholdFound={openHousehold}
            onMultipleHouseholds={handleMultipleHouseholds}
            onGuestClick={() => goToMode(MODES.GUEST)}
            loading={loading}
            keyboardActive={!showKioskStart}
          />
        );
    }
  };

  const renderContent = () => {
    if (mode === MODES.SETTINGS) {
      return (
        <div className="p-6">
          <div className="flex gap-3 mb-6" role="tablist">
            <button type="button" role="tab" aria-selected={settingsTab === 'sessions'} onClick={() => setSettingsTab('sessions')} className={pillClass(settingsTab === 'sessions')}>
              {tr('Sesje')}
            </button>
            <button type="button" role="tab" aria-selected={settingsTab === 'locations'} onClick={() => setSettingsTab('locations')} className={pillClass(settingsTab === 'locations')}>
              {tr('Sale')}
            </button>
          </div>
          {settingsTab === 'sessions' ? (
            <SessionManager
              onSessionChange={(s) => { if (s?.is_active) setSession(s); }}
              onSessionRemoved={(id) => setSession((cur) => (cur?.id === id ? null : cur))}
            />
          ) : (
            <LocationManager onLocationsChange={(list) => setLocations((list || []).filter((l) => l.is_active !== false))} />
          )}
        </div>
      );
    }
    if (mode === MODES.ATTENDANCE) {
      return <AttendanceDashboard session={session} locations={locations} />;
    }
    if (mode === MODES.CHECKOUT) {
      return <CheckoutScreen session={session} onGoToAttendance={() => goToMode(MODES.ATTENDANCE)} keyboardActive={!showKioskStart} />;
    }
    return renderCheckinFlow();
  };

  if (kiosk) {
    const kioskScreen = mode === MODES.CHECKOUT ? 'checkout' : 'checkin';
    return (
      <KioskShell
        kioskState={kioskState}
        screen={kioskScreen}
        onScreenChange={(s) => goToMode(s === 'checkout' ? MODES.CHECKOUT : MODES.CHECKIN)}
        onExit={handleKioskExit}
        onIdle={() => { goToMode(mode === MODES.CHECKOUT ? MODES.CHECKOUT : MODES.CHECKIN); setIdleTick((n) => n + 1); }}
        sessionLabel={sessionLabelOf(session)}
        banner={kioskBanner}
      >
        {kioskScreen === 'checkout'
          ? <CheckoutScreen key={`kiosk-checkout-${idleTick}`} session={session} kiosk />
          : <React.Fragment key={`kiosk-checkin-${idleTick}`}>{renderCheckinFlow()}</React.Fragment>}
      </KioskShell>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 transition-colors">
      {renderNav()}
      {renderSessionBar()}
      {renderNoRoomsHint()}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
      <KioskStartDialog
        isOpen={showKioskStart}
        onClose={() => setShowKioskStart(false)}
        onStart={handleKioskStart}
      />
    </div>
  );
}
