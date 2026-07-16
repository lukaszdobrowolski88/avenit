import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { Users, Music, Video, Home, Baby, UserCircle, Settings, HeartHandshake, Calendar, DollarSign, BookOpen, Heart, LayoutDashboard, FileText, MessageCircle, Sparkles, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useUserRole } from '../hooks/useUserRole';
import { usePermissions } from '../contexts/PermissionsContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { supabase } from '../lib/supabase';
import { useT } from '../i18n';

// Komponent Tooltip zgodny z layoutem aplikacji - używa Portal
function Tooltip({ children, text, show }) {
  const [position, setPosition] = useState({ top: 0, left: 0, visible: false });
  const containerRef = useRef(null);

  const handleMouseEnter = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 12,
        visible: true
      });
    }
  };

  const handleMouseLeave = () => {
    setPosition(prev => ({ ...prev, visible: false }));
  };

  if (!show || !text) return children;

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {position.visible && createPortal(
        <div
          className="fixed z-[99999] pointer-events-none"
          style={{ top: position.top, left: position.left, transform: 'translateY(-50%)' }}
        >
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-sm px-3 py-2 rounded-xl shadow-lg whitespace-nowrap border border-gray-700 dark:border-gray-600 relative">
            {text}
            {/* Strzałka */}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900 dark:border-r-gray-700"></div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Import logo dla zwiniętego sidebara
import sidebarLogo from '../media/schw.svg';
import { tr } from '../i18n';

// Kontekst dla mobile sidebar
const SidebarContext = createContext({
  isOpen: false,
  toggle: () => {},
  close: () => {}
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = () => setIsOpen(prev => !prev);
  const close = () => setIsOpen(false);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close }}>
      {children}
    </SidebarContext.Provider>
  );
}

// Przycisk hamburgera do navbar
export function MobileMenuButton() {
  const { toggle } = useSidebar();

  return (
    <button
      onClick={toggle}
      className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
      aria-label="Menu"
    >
      <Menu size={24} />
    </button>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const active = location.pathname;
  const { userRole, loading: roleLoading } = useUserRole();
  const { permissions, appSettings: moduleSettings, logoUrl } = usePermissions();
  const { isOpen, close } = useSidebar();
  const { hasUnsavedChanges, checkBeforeNavigate } = useUnsavedChanges();

  // Sidebar jest gotowy gdy mamy rolę i uprawnienia
  const sidebarReady = !roleLoading && userRole && permissions.length > 0;

  // Stan zwinięcia sidebara (z localStorage) - tylko dla desktop
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  // Zapisz stan do localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isCollapsed);
  }, [isCollapsed]);

  // Zamknij mobile sidebar przy zmianie ścieżki
  useEffect(() => {
    close();
  }, [location.pathname]);

  // Zablokuj scroll body gdy sidebar mobilny jest otwarty
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Dynamiczne moduły z bazy danych (inicjalizuj z cache)
  const [dynamicModules, setDynamicModules] = useState(() => {
    try {
      const cached = localStorage.getItem('app_modules_cache');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [modulesLoaded, setModulesLoaded] = useState(() => {
    return !!localStorage.getItem('app_modules_cache');
  });

  // Funkcja do ładowania modułów
  const loadModules = async () => {
    try {
      const { data, error } = await supabase
        .from('app_modules')
        .select('*')
        .order('display_order', { ascending: true });

      if (!error && data && data.length > 0) {
        setDynamicModules(data);
        localStorage.setItem('app_modules_cache', JSON.stringify(data));
      }
    } catch (err) {
      console.log('Tabela app_modules nie istnieje jeszcze, używam statycznej listy');
    } finally {
      setModulesLoaded(true);
    }
  };

  // Załaduj moduły z bazy danych i nasłuchuj na zmiany
  useEffect(() => {
    loadModules();

    // Subskrybuj zmiany w tabeli app_modules (realtime)
    let debounceTimer = null;
    const channel = supabase
      .channel('sidebar-modules-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_modules'
        },
        () => {
          // Debounce - poczekaj 300ms na więcej zmian przed przeładowaniem
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadModules();
          }, 300);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Pobierz komponent ikony po nazwie
  const getIconComponent = (iconName) => {
    return LucideIcons[iconName] || LucideIcons.Square;
  };

  // Sprawdź czy użytkownik ma dostęp do modułu (can_read)
  const hasModuleAccess = (moduleResource) => {
    // Superadmin ma dostęp do wszystkiego
    if (userRole === 'superadmin') return true;

    // Rada starszych zawsze ma dostęp do ustawień
    if (userRole === 'rada_starszych' && moduleResource === 'module:settings') return true;

    // Znajdź uprawnienie dla roli i zasobu
    const perm = permissions.find(p => p.role === userRole && p.resource === moduleResource);

    // Brak wpisu lub can_read !== true = brak dostępu
    if (!perm) return false;

    return perm.can_read === true;
  };

  // Mapowanie ścieżek na zasoby uprawnień
  const moduleResourceMap = {
    members: 'module:members',
    worship: 'module:worship',
    media: 'module:media',
    atmosfera: 'module:atmosfera',
    kids: 'module:kids',
    homegroups: 'module:homegroups',
    groups: 'module:homegroups', // alias
    finance: 'module:finance',
    teaching: 'module:teaching',
    prayer: 'module:prayer',
    komunikator: 'module:komunikator',
    mlodziezowka: 'module:mlodziezowka',
    mailing: 'module:mailing',
    push_campaigns: 'module:push_campaigns',
    sms_campaigns: 'module:sms_campaigns',
    settings: 'module:settings'
  };

  // Moduł jest widoczny jeśli: jest włączony globalnie ORAZ użytkownik ma uprawnienia
  const isModuleVisible = (moduleKey) => {
    return moduleSettings[moduleKey] && hasModuleAccess(moduleResourceMap[moduleKey]);
  };

  // Stałe linki nawigacyjne (zawsze widoczne)
  const coreLinks = [
    { path: '/', icon: LayoutDashboard, label: tr('Pulpit'), show: true },
    { path: '/programs', icon: FileText, label: tr('Programy'), show: true },
    { path: '/calendar', icon: Calendar, label: tr('Kalendarz'), show: true },
  ];

  // Statyczne linki modułów (fallback jeśli brak danych z bazy)
  const staticModuleLinks = [
    { path: '/members', icon: Users, label: tr('Członkowie'), show: isModuleVisible('members') },
    { path: '/worship', icon: Music, label: tr('Grupa Uwielbienia'), show: isModuleVisible('worship') },
    { path: '/media', icon: Video, label: tr('MediaTeam'), show: isModuleVisible('media') },
    { path: '/atmosfera', icon: HeartHandshake, label: tr('Atmosfera Team'), show: isModuleVisible('atmosfera') },
    { path: '/kids', icon: Baby, label: tr('Małe Avenit'), show: isModuleVisible('kids') },
    { path: '/home-groups', icon: UserCircle, label: tr('Grupy domowe'), show: isModuleVisible('groups') },
    { path: '/finance', icon: DollarSign, label: tr('Finanse'), show: hasModuleAccess('module:finance') },
    { path: '/teaching', icon: BookOpen, label: tr('Nauczanie'), show: hasModuleAccess('module:teaching') },
    { path: '/prayer', icon: Heart, label: tr('Centrum Modlitwy'), show: isModuleVisible('prayer') },
    { path: '/komunikator', icon: MessageCircle, label: tr('Komunikator'), show: hasModuleAccess('module:komunikator') },
    { path: '/mlodziezowka', icon: Sparkles, label: tr('Młodzieżówka'), show: hasModuleAccess('module:mlodziezowka') },
    { path: '/mailing', icon: LucideIcons.Mail, label: tr('Mailing'), show: hasModuleAccess('module:mailing') },
    { path: '/push-campaigns', icon: LucideIcons.Bell, label: tr('Push Kampanie'), show: hasModuleAccess('module:push_campaigns') },
    { path: '/sms-campaigns', icon: LucideIcons.MessageSquare, label: tr('SMS Kampanie'), show: hasModuleAccess('module:sms_campaigns') },
  ];

  // Wygeneruj linki modułów z bazy danych
  const getDynamicModuleLinks = () => {
    // Filtruj moduły: pomijamy dashboard, programs, calendar (są w coreLinks) oraz settings (osobno)
    const coreKeys = ['dashboard', 'programs', 'calendar', 'settings'];

    return dynamicModules
      .filter(mod => !coreKeys.includes(mod.key))
      .filter(mod => mod.is_enabled) // Tylko włączone moduły
      .map(mod => ({
        path: mod.path,
        icon: getIconComponent(mod.icon),
        label: mod.label,
        show: hasModuleAccess(mod.resource_key)
      }));
  };

  // Użyj dynamicznych modułów jeśli są dostępne, w przeciwnym razie statycznych
  const moduleLinks = dynamicModules.length > 0 ? getDynamicModuleLinks() : staticModuleLinks;
  const allLinks = [...coreLinks, ...moduleLinks];

  // Wspólna zawartość sidebara
  const SidebarContent = ({ isMobile = false }) => (
    <>
      {/* LOGO - Desktop */}
      {!isMobile && (
        <div className={`${isCollapsed ? 'p-3' : 'p-4 lg:p-6'} border-b border-gray-200/50 dark:border-gray-700 flex justify-center items-center shrink-0`}>
          {(logoUrl || sidebarLogo) ? (
            <img
              src={logoUrl || sidebarLogo}
              alt="Logo"
              className={`object-contain transition-all duration-300 ${isCollapsed ? 'w-10 h-10' : 'w-full max-h-20 lg:max-h-32 rounded-md'}`}
              onError={(e) => {
                if (logoUrl && e.target.src !== sidebarLogo) {
                  e.target.src = sidebarLogo;
                }
              }}
            />
          ) : (
            <div className="w-full aspect-video text-3xl lg:text-4xl bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest dark:to-accent-secondary-darkest rounded-xl flex items-center justify-center text-accent-primary dark:text-accent-primary-light font-bold shadow-sm transition-all duration-300">
              S
            </div>
          )}
        </div>
      )}

      {/* Header mobilny - minimalistyczny design */}
      {isMobile && (
        <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoUrl || sidebarLogo} alt="Logo" className="w-8 h-8 object-contain" onError={(e) => { if (logoUrl && e.target.src !== sidebarLogo) e.target.src = sidebarLogo; }} />
            <span className="font-semibold text-gray-800 dark:text-white">Menu</span>
          </div>
          <button
            onClick={close}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* NAWIGACJA */}
      <nav className={`flex-1 ${isCollapsed && !isMobile ? 'p-2' : 'p-3 lg:p-4'} space-y-1 overflow-y-auto custom-scrollbar ${isMobile ? 'mt-0' : 'mt-2'}`}>
        {!sidebarReady ? (
          // Skeleton loader — pulsujące placeholdery zamiast migotania
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`flex items-center ${isCollapsed && !isMobile ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-xl animate-pulse`}>
              <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
              {(isMobile || !isCollapsed) && (
                <div className={`h-4 bg-gray-200 dark:bg-gray-700 rounded ${i < 3 ? 'w-20' : i < 6 ? 'w-32' : 'w-24'}`} />
              )}
            </div>
          ))
        ) : (
          allLinks.filter(l => l.show).map(link => {
            const isActive = active === link.path;

            // Obsługa kliknięcia z sprawdzeniem niezapisanych zmian
            const handleLinkClick = (e) => {
              if (hasUnsavedChanges) {
                e.preventDefault();
                checkBeforeNavigate(() => {
                  navigate(link.path);
                  if (isMobile) close();
                });
              } else if (isMobile) {
                close();
              }
            };

            return (
              <Tooltip key={link.path} text={t(link.label)} show={isCollapsed && !isMobile}>
                <Link
                  to={link.path}
                  onClick={handleLinkClick}
                  className={`flex items-center ${isCollapsed && !isMobile ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-xl transition-all group ${isActive ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-lg shadow-accent-primary-light/30 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-gray-700 hover:text-accent-primary dark:hover:text-white'}`}
                >
                  <link.icon size={20} className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-accent-primary-light dark:group-hover:text-white transition-colors'}`} />
                  {(isMobile || !isCollapsed) && <span className="text-sm truncate">{t(link.label)}</span>}
                </Link>
              </Tooltip>
            );
          })
        )}
      </nav>

      {/* USTAWIENIA */}
      {hasModuleAccess('module:settings') && (
        <div className={`${isCollapsed && !isMobile ? 'p-2' : 'p-3 lg:p-4'} border-t border-gray-200/50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 shrink-0`}>
          <Tooltip text="Ustawienia" show={isCollapsed && !isMobile}>
            <Link
              to="/settings"
              onClick={(e) => {
                if (hasUnsavedChanges) {
                  e.preventDefault();
                  checkBeforeNavigate(() => {
                    navigate('/settings');
                    if (isMobile) close();
                  });
                } else if (isMobile) {
                  close();
                }
              }}
              className={`flex items-center ${isCollapsed && !isMobile ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-xl transition-all w-full ${active === '/settings' ? 'bg-gray-800 dark:bg-gray-900 text-white shadow-lg' : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
            >
              <Settings size={20} className="shrink-0" />
              {(isMobile || !isCollapsed) && <span className="text-sm font-medium">{tr('Ustawienia')}</span>}
            </Link>
          </Tooltip>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden lg:flex ${isCollapsed ? 'w-20' : 'w-64'} bg-white/80 dark:bg-gray-800/90 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-700 shadow-lg flex-col transition-all duration-300 h-full relative z-40`}>
        {/* Przycisk zwijania */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full shadow-md flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light hover:border-accent-primary-light dark:hover:border-accent-primary transition-all z-50"
          title={isCollapsed ? 'Rozwiń sidebar' : 'Zwiń sidebar'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <SidebarContent isMobile={false} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-[60] transition-opacity"
          onClick={close}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <div className={`lg:hidden fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-gray-800 shadow-2xl z-[60] transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent isMobile={true} />
      </div>
    </>
  );
}
