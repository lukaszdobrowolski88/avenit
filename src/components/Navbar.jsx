import React, { useState, useEffect } from 'react';
import { Sun, Moon, LogOut, User as UserIcon, Circle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import NotificationCenter from './NotificationCenter';
import { useMyPresence, statusLabels } from '../hooks/usePresence';
import { MobileMenuButton } from './Sidebar';

export default function Navbar({ user, darkMode, toggleTheme }) {
  const [userProfile, setUserProfile] = useState(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('online');

  // Zarządzaj własnym statusem presence
  const { setOnline, setAway, setOffline } = useMyPresence(user?.email);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user?.email) return;

      try {
        const { data: profile, error } = await supabase
          .from('app_users')
          .select('full_name, avatar_url')
          .eq('email', user.email)
          .maybeSingle();

        if (profile && !error) {
          setUserProfile(profile);
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
      }
    };

    fetchUserProfile();
  }, [user?.email]);

  const handleLogout = async () => {
    setOffline();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleStatusChange = (status) => {
    setCurrentStatus(status);
    setShowStatusMenu(false);
    if (status === 'online') setOnline();
    else if (status === 'away') setAway();
    else setOffline();
  };

  // Status colors
  const statusConfig = {
    online: { color: 'text-green-500', bgColor: 'bg-green-500', label: 'Online' },
    away: { color: 'text-yellow-500', bgColor: 'bg-yellow-500', label: 'Zaraz wracam' },
    offline: { color: 'text-gray-400', bgColor: 'bg-gray-400', label: 'Niewidoczny' }
  };

  const displayName = userProfile?.full_name || user?.email;
  const statusInfo = statusConfig[currentStatus];

  return (
    // z-40 aby navbar był nad treścią, ale pod modalami (z-[100])
    <div className="relative z-40 h-14 lg:h-16 bg-white/80 dark:bg-gray-800/90 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700 flex items-center justify-between px-3 lg:px-6 transition-colors duration-300">

      {/* Lewa strona */}
      <div className="flex items-center gap-2 lg:gap-4">
        {/* Hamburger menu - tylko mobile */}
        <MobileMenuButton />
      </div>

      {/* Prawa strona */}
      <div className="flex items-center gap-2 lg:gap-4">

        {/* Przełącznik Motywu */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          title="Zmień motyw"
        >
          {darkMode ? <Sun size={18} className="lg:w-5 lg:h-5" /> : <Moon size={18} className="lg:w-5 lg:h-5" />}
        </button>

        {/* Powiadomienia */}
        <NotificationCenter />

        <div className="hidden sm:block h-8 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1"></div>

        {/* Profil Użytkownika */}
        <div className="flex items-center gap-2 lg:gap-3">
          {/* Status i nazwa - z menu do zmiany statusu */}
          <div className="text-right hidden lg:block relative">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200 leading-none">
              {displayName}
            </p>
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={`text-xs font-medium mt-1 flex items-center gap-1 justify-end hover:opacity-80 transition ${statusInfo.color}`}
            >
              <Circle size={8} fill="currentColor" />
              {statusInfo.label}
            </button>

            {/* Menu zmiany statusu */}
            {showStatusMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-[1001]">
                <div className="py-1">
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => handleStatusChange(key)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition ${
                        currentStatus === key ? 'bg-gray-50 dark:bg-gray-700/50' : ''
                      }`}
                    >
                      <Circle size={10} className={config.color} fill="currentColor" />
                      <span className="text-gray-700 dark:text-gray-300">{config.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Kontener grupy musi być relative */}
          <div className="relative group">
            <button className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-gradient-to-tr from-pink-500 to-orange-600 p-[2px] cursor-pointer shadow-md hover:shadow-lg transition-all block">
              {userProfile?.avatar_url ? (
                <img
                  src={userProfile.avatar_url}
                  alt="Avatar"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
                  <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-orange-600 uppercase">
                    {displayName?.charAt(0) || 'U'}
                  </span>
                </div>
              )}
              {/* Status indicator on avatar */}
              <span className={`absolute bottom-0 right-0 w-3 h-3 ${statusInfo.bgColor} rounded-full ring-2 ring-white dark:ring-gray-800`} />
            </button>

            {/*
               POPRAWKA:
               1. Zamiast 'mt-2' używamy 'pt-2' na zewnętrznym divie.
                  Dzięki temu 'powietrze' między przyciskiem a menu jest częścią elementu i myszka nie gubi hovera.
               2. Wewnętrzny div ma tło i obramowanie.
               3. Dodany wysoki z-index [1000].
            */}
            <div className="absolute right-0 top-full pt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 z-[1000]">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Konto</p>
                </div>
                <a href="/profile" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-gray-700 hover:text-pink-600 transition-colors cursor-pointer">
                  <UserIcon size={16}/> Mój Profil
                </a>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                >
                  <LogOut size={16}/> Wyloguj
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
