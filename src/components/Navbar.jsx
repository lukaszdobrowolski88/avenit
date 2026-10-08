import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, LogOut, User as UserIcon, Circle, Search, LifeBuoy, PlayCircle, ListChecks, GraduationCap, Check, Building2, Globe } from 'lucide-react';
import { openCommandPalette } from './CommandPalette';
import { useOnboarding } from '../onboarding/OnboardingContext';
import { supabase } from '../lib/supabase';
import NotificationCenter from './NotificationCenter';
import { useMyPresence } from '../hooks/usePresence';
import { MobileMenuButton } from './Sidebar';
import { resetUserRoleCache } from '../hooks/useUserRole';
import CampusSelector from './CampusSelector';
import LanguageSwitcher from './LanguageSwitcher';
import { useCampus } from '../contexts/CampusContext';
import { useT, useI18n } from '../i18n';
import { tr } from '../i18n';
import { thumbUrl } from '../lib/imageThumb';

// Wspólna obsługa rozwijanego menu (klik, Esc, klik poza, strzałki) — A11Y-07 / UXE-15.
function useMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) setTimeout(() => buttonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    // Fokus na pierwszą pozycję menu po otwarciu.
    const id = setTimeout(() => {
      const first = menuRef.current?.querySelector('[role^="menuitem"]');
      first?.focus();
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const onMenuKeyDown = (e) => {
    const items = Array.from(menuRef.current?.querySelectorAll('[role^="menuitem"]') || []);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  };

  const onButtonKeyDown = (e) => {
    if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); }
  };

  return { open, setOpen, close, wrapRef, buttonRef, menuRef, onMenuKeyDown, onButtonKeyDown };
}

const itemCls = 'w-full flex items-center gap-2 px-4 min-h-[44px] md:min-h-[40px] text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-accent-primary-lightest dark:hover:bg-gray-700 hover:text-accent-primary focus:bg-accent-primary-lightest dark:focus:bg-gray-700 focus:outline-none transition-colors';
const sectionCls = 'px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400';
// Przyciski paska: min. 44 px na telefonie (UXE-16), 40 px od lg.
const iconBtn = 'w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors';

export default function Navbar({ user, darkMode, toggleTheme }) {
  const t = useT();
  const { lang, setLang, languages } = useI18n();
  const { startTour, openChecklist, openTutorials } = useOnboarding();
  const { campuses = [], selectedCampusId, setSelectedCampusId, canSwitchCampus } = useCampus() || {};
  const [userProfile, setUserProfile] = useState(null);
  const [currentStatus, setCurrentStatus] = useState('online');
  const help = useMenu();
  const account = useMenu();

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
    // Wyczyść cały cache aplikacji przy wylogowaniu
    resetUserRoleCache();
    try {
      ['app_settings_cache', 'app_permissions_cache', 'color_preset', 'custom_preset', 'sidebarCollapsed', 'app_modules_cache', 'selected_campus_id']
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleStatusChange = (status) => {
    setCurrentStatus(status);
    if (status === 'online') setOnline();
    else if (status === 'away') setAway();
    else setOffline();
  };

  // Status: kolor kropki (dekoracja) + zawsze etykieta tekstowa.
  const statusConfig = {
    online: { color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-500', label: tr('Online') },
    away: { color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-500', label: tr('Zaraz wracam') },
    offline: { color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-400', label: tr('Niewidoczny') }
  };

  const displayName = userProfile?.full_name || user?.email;
  const statusInfo = statusConfig[currentStatus];
  const selectedCampus = campuses.find((c) => c.id === selectedCampusId);
  const campusName = selectedCampus?.name || tr('Wszystkie kampusy');
  const showCampusInMenu = campuses.length >= 2;

  return (
    // z-40 aby navbar był nad treścią, ale pod modalami (z-[100]). Gdy któreś menu paska jest
    // rozwinięte (aria-expanded), pasek wskakuje na z-[60] — inaczej menu chowało się pod kartami
    // modułów (sekcje mają relative z-[50]). Na stałe wyżej nie: przykryłby starsze modale z-50.
    <div className="app-topbar relative z-40 has-[[aria-expanded=true]]:z-[60] h-14 lg:h-16 bg-white/80 dark:bg-gray-800/90 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700 flex items-center justify-between px-3 lg:px-6 transition-colors duration-300">

      {/* Lewa strona */}
      <div className="flex items-center gap-2 lg:gap-4 min-w-0">
        {/* Hamburger menu - tylko mobile */}
        <MobileMenuButton />
        {/* Kampus: na telefonie w menu konta (z nazwą), tu od md */}
        <div className="hidden md:block">
          <CampusSelector />
        </div>
      </div>

      {/* Prawa strona */}
      <div className="flex items-center gap-1 md:gap-2 lg:gap-4">

        {/* Globalna wyszukiwarka (Cmd/Ctrl+K) */}
        <button
          type="button"
          data-tour="search"
          onClick={openCommandPalette}
          title={`${t('Szukaj')} (⌘K)`}
          className="hidden md:flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Search size={16} aria-hidden="true" />
          <span className="text-sm">{t('Szukaj…')}</span>
          <kbd className="ml-2 text-[11px] font-sans px-1.5 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label={t('Szukaj')}
          className={`md:hidden ${iconBtn}`}
        >
          <Search size={20} aria-hidden="true" />
        </button>

        {/* Przełącznik języka — na telefonie w menu konta */}
        <span data-tour="language" className="hidden md:inline-flex"><LanguageSwitcher /></span>

        {/* Pomoc / samouczek */}
        <div className="relative" ref={help.wrapRef}>
          <button
            type="button"
            ref={help.buttonRef}
            data-tour="help"
            onClick={() => help.setOpen((v) => !v)}
            onKeyDown={help.onButtonKeyDown}
            className={iconBtn}
            title={t('Pomoc i samouczek')}
            aria-label={t('Pomoc i samouczek')}
            aria-haspopup="menu"
            aria-expanded={help.open}
          >
            <LifeBuoy size={20} aria-hidden="true" />
          </button>
          {help.open && (
            <div
              ref={help.menuRef}
              role="menu"
              aria-label={t('Pomoc')}
              onKeyDown={help.onMenuKeyDown}
              className="absolute right-0 top-full mt-1 w-60 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-[1001] py-1"
            >
              <div className={sectionCls} role="presentation">{t('Pomoc')}</div>
              <button type="button" role="menuitem" onClick={() => { help.close(); startTour('welcome'); }} className={itemCls}>
                <PlayCircle size={16} aria-hidden="true" /> {t('Rozpocznij samouczek')}
              </button>
              <button type="button" role="menuitem" onClick={() => { help.close(); openTutorials(); }} className={itemCls}>
                <GraduationCap size={16} aria-hidden="true" /> {t('Samouczki procesów')}
              </button>
              <button type="button" role="menuitem" onClick={() => { help.close(); openChecklist(); }} className={itemCls}>
                <ListChecks size={16} aria-hidden="true" /> {t('Pierwsze kroki')}
              </button>
              <button type="button" role="menuitem" onClick={() => { help.close(); openCommandPalette(); }} className={itemCls}>
                <Search size={16} aria-hidden="true" /> {t('Szukaj (⌘K / Ctrl+K)')}
              </button>
            </div>
          )}
        </div>

        {/* Przełącznik Motywu — na telefonie w menu konta */}
        <button
          type="button"
          onClick={toggleTheme}
          className={`hidden md:flex ${iconBtn}`}
          title={darkMode ? t('Włącz jasny motyw') : t('Włącz ciemny motyw')}
          aria-label={darkMode ? t('Włącz jasny motyw') : t('Włącz ciemny motyw')}
        >
          {darkMode ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>

        {/* Powiadomienia */}
        <NotificationCenter />

        <div className="hidden sm:block h-8 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1"></div>

        {/* Profil użytkownika — menu otwierane kliknięciem i klawiaturą */}
        <div className="relative flex items-center gap-2 lg:gap-3" ref={account.wrapRef}>
          {/* Nazwa i status (desktop) — otwiera to samo menu konta */}
          <button
            type="button"
            onClick={() => account.setOpen((v) => !v)}
            tabIndex={-1}
            aria-hidden="true"
            className="text-right hidden lg:block"
          >
            <span className="block text-sm font-bold text-gray-800 dark:text-gray-200 leading-none">{displayName}</span>
            <span className={`text-xs font-medium mt-1 flex items-center gap-1 justify-end ${statusInfo.color}`}>
              <Circle size={8} fill="currentColor" aria-hidden="true" />
              {statusInfo.label}
            </span>
          </button>

          <button
            type="button"
            ref={account.buttonRef}
            onClick={() => account.setOpen((v) => !v)}
            onKeyDown={account.onButtonKeyDown}
            aria-haspopup="menu"
            aria-expanded={account.open}
            aria-label={t('Konto: {name}', { name: displayName || '' })}
            className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-accent-primary-light to-accent-secondary p-[2px] cursor-pointer shadow-md hover:shadow-lg transition-all block shrink-0"
          >
            {userProfile?.avatar_url ? (
              <img
                src={thumbUrl(userProfile.avatar_url, 40)}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="w-full h-full rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
                <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-accent-primary to-accent-secondary uppercase">
                  {displayName?.charAt(0) || 'U'}
                </span>
              </span>
            )}
            {/* Status na awatarze */}
            <span className={`absolute bottom-0 right-0 w-3 h-3 ${statusInfo.bgColor} rounded-full ring-2 ring-white dark:ring-gray-800`} aria-hidden="true" />
          </button>

          {account.open && (
            <div
              ref={account.menuRef}
              role="menu"
              aria-label={t('Konto')}
              onKeyDown={account.onMenuKeyDown}
              className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-24px)] max-h-[calc(100vh-80px)] overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-[1000] py-1"
            >
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700" role="presentation">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{displayName}</p>
                {userProfile?.full_name && user?.email && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>}
              </div>

              <Link to="/profile" role="menuitem" onClick={() => account.close()} className={itemCls}>
                <UserIcon size={16} aria-hidden="true" /> {t('Mój profil')}
              </Link>

              {/* Status obecności */}
              <div className={sectionCls} role="presentation">{t('Status')}</div>
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={currentStatus === key}
                  onClick={() => handleStatusChange(key)}
                  className={itemCls}
                >
                  <Circle size={10} className={cfg.color} fill="currentColor" aria-hidden="true" />
                  <span className="flex-1">{cfg.label}</span>
                  {currentStatus === key && <Check size={15} className="text-accent-primary" aria-hidden="true" />}
                </button>
              ))}

              {/* Telefon: kampus, język i motyw (na większych ekranach są na pasku) */}
              <div className="md:hidden">
                {showCampusInMenu && (
                  <>
                    <div className={sectionCls} role="presentation">{t('Kampus')}</div>
                    {canSwitchCampus ? (
                      [{ id: null, name: tr('Wszystkie kampusy') }, ...campuses].map((c) => (
                        <button
                          key={c.id ?? 'all'}
                          type="button"
                          role="menuitemradio"
                          aria-checked={(selectedCampusId ?? null) === c.id}
                          onClick={() => { setSelectedCampusId(c.id); account.close(); }}
                          className={itemCls}
                        >
                          <Building2 size={16} aria-hidden="true" />
                          <span className="flex-1 truncate">{c.name}</span>
                          {(selectedCampusId ?? null) === c.id && <Check size={15} className="text-accent-primary" aria-hidden="true" />}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2" role="presentation">
                        <Building2 size={16} aria-hidden="true" /> {campusName}
                      </div>
                    )}
                  </>
                )}

                <div className={sectionCls} role="presentation">{t('Język')}</div>
                {(languages || []).map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={l.code === lang}
                    onClick={() => { setLang(l.code); account.close(); }}
                    className={itemCls}
                  >
                    <Globe size={16} aria-hidden="true" />
                    <span className="flex-1">{l.label}</span>
                    {l.code === lang && <Check size={15} className="text-accent-primary" aria-hidden="true" />}
                  </button>
                ))}

                <div className="my-1 border-t border-gray-100 dark:border-gray-700" role="presentation" />
                <button type="button" role="menuitem" onClick={() => { toggleTheme(); }} className={itemCls}>
                  {darkMode ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
                  {darkMode ? t('Włącz jasny motyw') : t('Włącz ciemny motyw')}
                </button>
              </div>

              <div className="my-1 border-t border-gray-100 dark:border-gray-700" role="presentation" />
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 min-h-[44px] md:min-h-[40px] text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20 focus:outline-none transition-colors"
              >
                <LogOut size={16} aria-hidden="true" /> {t('Wyloguj')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
