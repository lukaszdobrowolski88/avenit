import React, { useState, useEffect, useCallback } from 'react';
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
import { UserCheck, UserPlus, LogOut, ClipboardList, Settings } from 'lucide-react';

const MODES = {
  CHECKIN: 'checkin',
  GUEST: 'guest',
  CHECKOUT: 'checkout',
  ATTENDANCE: 'attendance',
  SETTINGS: 'settings'
};

const CHECKIN_STEPS = {
  PHONE_SEARCH: 'phone_search',
  HOUSEHOLD_SELECT: 'household_select',
  MEMBER_CHECKIN: 'member_checkin',
  SUCCESS: 'success'
};

export default function CheckinTab() {
  const [mode, setMode] = useState(MODES.CHECKIN);
  const [checkinStep, setCheckinStep] = useState(CHECKIN_STEPS.PHONE_SEARCH);
  const [session, setSession] = useState(null);
  const [locations, setLocations] = useState([]);
  const [selectedHousehold, setSelectedHousehold] = useState(null);
  const [multipleHouseholds, setMultipleHouseholds] = useState([]);
  const [checkinResults, setCheckinResults] = useState([]);
  const [settingsTab, setSettingsTab] = useState('sessions');

  const {
    loading,
    error,
    searchByPhone,
    getOrCreateTodaySession,
    getLocations,
    checkInStudent,
    checkInGuest,
    getSecurityCodesForHousehold
  } = useCheckin();

  useEffect(() => {
    const init = async () => {
      const [sessionData, locationsData] = await Promise.all([
        getOrCreateTodaySession(),
        getLocations()
      ]);
      setSession(sessionData);
      setLocations(locationsData);
    };
    init();
  }, []);

  useEffect(() => {
    if (mode === MODES.CHECKIN) {
      setCheckinStep(CHECKIN_STEPS.PHONE_SEARCH);
      setSelectedHousehold(null);
      setMultipleHouseholds([]);
      setCheckinResults([]);
    }
  }, [mode]);

  const handleHouseholdFound = useCallback((household) => {
    setSelectedHousehold(household);
    setCheckinStep(CHECKIN_STEPS.MEMBER_CHECKIN);
  }, []);

  const handleMultipleHouseholds = useCallback((households) => {
    setMultipleHouseholds(households);
    setCheckinStep(CHECKIN_STEPS.HOUSEHOLD_SELECT);
  }, []);

  const handleHouseholdSelect = useCallback((household) => {
    setSelectedHousehold(household);
    setCheckinStep(CHECKIN_STEPS.MEMBER_CHECKIN);
  }, []);

  const handleMemberCheckin = useCallback(async (members) => {
    if (!session) return;

    // Pobierz kody bezpieczeństwa dla rodziny (ostatnie 4 cyfry telefonów osób z can_pickup)
    const securityCodes = await getSecurityCodesForHousehold(selectedHousehold.id);

    const results = [];
    for (const member of members) {
      const result = await checkInStudent(
        session.id,
        member.studentId,
        member.locationId,
        selectedHousehold.id,
        securityCodes
      );
      if (result) {
        results.push(result);
      }
    }

    if (results.length > 0) {
      setCheckinResults(results);
      setCheckinStep(CHECKIN_STEPS.SUCCESS);
    }
  }, [session, selectedHousehold, checkInStudent, getSecurityCodesForHousehold]);

  const handleGuestCheckin = useCallback(async (guestData) => {
    if (!session) return;

    const result = await checkInGuest(session.id, guestData.locationId, guestData);

    if (result) {
      setCheckinResults([result]);
      setMode(MODES.CHECKIN);
      setCheckinStep(CHECKIN_STEPS.SUCCESS);
    }
  }, [session, checkInGuest]);

  const handleSuccessDone = useCallback(() => {
    setCheckinStep(CHECKIN_STEPS.PHONE_SEARCH);
    setSelectedHousehold(null);
    setMultipleHouseholds([]);
    setCheckinResults([]);
  }, []);

  const handleBackToSearch = useCallback(() => {
    setCheckinStep(CHECKIN_STEPS.PHONE_SEARCH);
    setSelectedHousehold(null);
    setMultipleHouseholds([]);
  }, []);

  const handleBackFromHouseholdSelect = useCallback(() => {
    setCheckinStep(CHECKIN_STEPS.PHONE_SEARCH);
    setMultipleHouseholds([]);
  }, []);

  const navItems = [
    { id: MODES.CHECKIN, icon: UserCheck, label: 'Check-in' },
    { id: MODES.GUEST, icon: UserPlus, label: 'Gość' },
    { id: MODES.CHECKOUT, icon: LogOut, label: 'Checkout' },
    { id: MODES.ATTENDANCE, icon: ClipboardList, label: 'Lista obecności' },
    { id: MODES.SETTINGS, icon: Settings, label: 'Ustawienia' }
  ];

  const renderNav = () => (
    <div className="flex gap-2 p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-wrap">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = mode === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setMode(item.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all
              ${isActive
                ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-lg shadow-pink-500/25'
                : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600 hover:text-pink-600 dark:hover:text-pink-400'
              }`}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderSessionBar = () => {
    if (!session) return null;

    return (
      <div className="flex items-center justify-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
        <span>📅</span>
        <span>
          <strong>{session.name}</strong>
          {' • '}
          {new Date(session.session_date).toLocaleDateString('pl-PL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          })}
        </span>
      </div>
    );
  };

  const renderContent = () => {
    if (mode === MODES.SETTINGS) {
      return (
        <div className="p-6">
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setSettingsTab('sessions')}
              className={`px-6 py-3 text-base font-medium rounded-xl transition-all
                ${settingsTab === 'sessions'
                  ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-lg'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
                }`}
            >
              Sesje
            </button>
            <button
              onClick={() => setSettingsTab('locations')}
              className={`px-6 py-3 text-base font-medium rounded-xl transition-all
                ${settingsTab === 'locations'
                  ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-lg'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
                }`}
            >
              Sale
            </button>
          </div>
          {settingsTab === 'sessions' ? (
            <SessionManager onSessionChange={setSession} />
          ) : (
            <LocationManager onLocationsChange={setLocations} />
          )}
        </div>
      );
    }

    if (mode === MODES.ATTENDANCE) {
      return <AttendanceDashboard session={session} locations={locations} />;
    }

    if (mode === MODES.CHECKOUT) {
      return <CheckoutScreen session={session} />;
    }

    if (mode === MODES.GUEST) {
      return (
        <GuestCheckinForm
          locations={locations}
          onCheckin={handleGuestCheckin}
          onBack={() => setMode(MODES.CHECKIN)}
          loading={loading}
        />
      );
    }

    switch (checkinStep) {
      case CHECKIN_STEPS.PHONE_SEARCH:
        return (
          <PhoneSearchScreen
            searchByPhone={searchByPhone}
            onHouseholdFound={handleHouseholdFound}
            onMultipleHouseholds={handleMultipleHouseholds}
            onNoResults={() => {}}
            onGuestClick={() => setMode(MODES.GUEST)}
            loading={loading}
          />
        );

      case CHECKIN_STEPS.HOUSEHOLD_SELECT:
        return (
          <HouseholdSelection
            households={multipleHouseholds}
            onSelect={handleHouseholdSelect}
            onBack={handleBackFromHouseholdSelect}
          />
        );

      case CHECKIN_STEPS.MEMBER_CHECKIN:
        return (
          <MemberCheckin
            household={selectedHousehold}
            locations={locations}
            onCheckin={handleMemberCheckin}
            onBack={handleBackToSearch}
            loading={loading}
          />
        );

      case CHECKIN_STEPS.SUCCESS:
        return (
          <CheckinSuccess
            checkins={checkinResults}
            onDone={handleSuccessDone}
          />
        );

      default:
        return null;
    }
  };

  if (error) {
    return (
      <div className="p-10 text-center text-red-600 dark:text-red-400">
        <h2 className="text-xl font-bold mb-2">Wystąpił błąd</h2>
        <p className="mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg transition"
        >
          Odśwież stronę
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 transition-colors">
      {renderNav()}
      {renderSessionBar()}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
