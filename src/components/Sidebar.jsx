import React, { useState, useEffect, useRef, useMemo, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { Settings, ChevronLeft, ChevronRight, ChevronDown, Menu, X } from 'lucide-react';
import { useUserRole } from '../hooks/useUserRole';
import { usePermissions } from '../contexts/PermissionsContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { useOnboarding } from '../onboarding/OnboardingContext';
import { useT } from '../i18n';
import { getSidebar } from '../lib/appearance';
import { useModuleColors, normalizeModuleLabel } from '../hooks/useModuleLabel';
import { useAppModules } from '../hooks/useAppModules';
import { groupNavLinks, dedupeIconNames, resolveActiveKey, HIDDEN_NAV_KEYS } from './navConfig';

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
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
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

// localStorage bywa niedostępny (tryb prywatny, zablokowane dane) — zawsze przez try/catch.
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const GROUPS_KEY = 'sidebar_nav_groups_collapsed';

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
  const { toggle, isOpen } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggle}
      className="lg:hidden w-11 h-11 -ml-2 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
      aria-label={tr('Menu')}
      aria-expanded={isOpen}
      aria-controls="mobile-nav-drawer"
    >
      <Menu size={24} aria-hidden="true" />
    </button>
  );
}

// Statyczne pozycje (zapas, gdy app_modules nie da się wczytać). Etykiety zgodne z menu z bazy.
const STATIC_MODULES = [
  { key: 'calendar', path: '/wydarzenia', iconName: 'CalendarDays', label: 'Wydarzenia', resource: 'module:calendar' },
  { key: 'members', path: '/members', iconName: 'Users', label: 'Członkowie', setting: 'members' },
  { key: 'worship', path: '/worship', iconName: 'Music', label: 'Grupa Uwielbienia', setting: 'worship' },
  { key: 'media', path: '/media', iconName: 'Video', label: 'MediaTeam', setting: 'media' },
  { key: 'atmosfera', path: '/atmosfera', iconName: 'Coffee', label: 'Atmosfera Team', setting: 'atmosfera' },
  { key: 'kids', path: '/kids', iconName: 'Baby', label: 'Dzieci', setting: 'kids' },
  { key: 'homegroups', path: '/home-groups', iconName: 'Home', label: 'Grupy domowe', setting: 'groups' },
  { key: 'finance', path: '/finance', iconName: 'Wallet', label: 'Finanse', resource: 'module:finance' },
  { key: 'giving', path: '/giving', iconName: 'Gift', label: 'Hojność', resource: 'module:giving' },
  { key: 'attendance', path: '/attendance', iconName: 'ClipboardCheck', label: 'Frekwencja', resource: 'module:attendance' },
  { key: 'serve', path: '/serve', iconName: 'UserCheck', label: 'Dostępność', resource: 'module:serve' },
  { key: 'rsvp', path: '/rsvp', iconName: 'MailCheck', label: 'Zapisy (RSVP)', resource: 'module:rsvp' },
  { key: 'rooms', path: '/rooms', iconName: 'DoorOpen', label: 'Rezerwacje sal', resource: 'module:rooms' },
  { key: 'automation', path: '/automation', iconName: 'Workflow', label: 'Automatyzacje', resource: 'module:automation' },
  { key: 'analytics', path: '/analytics', iconName: 'BarChart3', label: 'Analityka', resource: 'module:analytics' },
  { key: 'ai', path: '/ai', iconName: 'Sparkles', label: 'Asystent AI', resource: 'module:ai' },
  { key: 'teaching', path: '/teaching', iconName: 'BookOpen', label: 'Nauczanie', resource: 'module:teaching' },
  { key: 'prayer', path: '/prayer', iconName: 'Heart', label: 'Ściana modlitwy', setting: 'prayer' },
  { key: 'komunikator', path: '/komunikator', iconName: 'MessageCircle', label: 'Komunikator', resource: 'module:komunikator' },
  { key: 'mlodziezowka', path: '/mlodziezowka', iconName: 'Flame', label: 'Młodzieżówka', resource: 'module:mlodziezowka' },
  { key: 'mailing', path: '/mailing', iconName: 'Send', label: 'Kampanie e-mail', resource: 'module:mailing' },
  { key: 'push_campaigns', path: '/push-campaigns', iconName: 'BellRing', label: 'Kampanie push', resource: 'module:push_campaigns' },
  { key: 'sms_campaigns', path: '/sms-campaigns', iconName: 'Smartphone', label: 'Kampanie SMS', resource: 'module:sms_campaigns' },
];

// Zasób uprawnień dla pozycji z fallbacku sterowanych ustawieniem modułu.
const SETTING_RESOURCE = { members: 'module:members', worship: 'module:worship', media: 'module:media', atmosfera: 'module:atmosfera', kids: 'module:kids', groups: 'module:homegroups', prayer: 'module:prayer' };

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const { userRole, loading: roleLoading } = useUserRole();
  const { can, ready, appSettings: moduleSettings, logoUrl } = usePermissions();
  const { isOpen, close } = useSidebar();
  const { hasUnsavedChanges, checkBeforeNavigate } = useUnsavedChanges();
  const { activeTour } = useOnboarding();

  // Sidebar jest gotowy gdy mamy rolę i granty
  const sidebarReady = !roleLoading && userRole && ready;

  // Styl paska bocznego (Ustawienia → Wygląd): 'theme' | 'dark' | 'accent'. Owija panele
  // klasą .dark (jasny tekst niezależnie od motywu); 'accent' dokłada tło akcentu (CSS).
  const [sidebarStyle, setSidebarStyle] = useState(getSidebar);
  useEffect(() => {
    const h = () => setSidebarStyle(getSidebar());
    window.addEventListener('appearance:sidebar', h);
    return () => window.removeEventListener('appearance:sidebar', h);
  }, []);
  const sidebarWrap = sidebarStyle === 'accent' ? 'dark sidebar-accent' : sidebarStyle === 'dark' ? 'dark' : '';

  // Kolory per-moduł (Ustawienia → Moduły) — kolorują ikony i aktywną pozycję w menu.
  const moduleColors = useModuleColors();

  // Stan zwinięcia sidebara (z localStorage) - tylko dla desktop
  const [isCollapsed, setIsCollapsed] = useState(() => lsGet('sidebarCollapsed') === 'true');
  useEffect(() => { lsSet('sidebarCollapsed', String(isCollapsed)); }, [isCollapsed]);

  // Zwinięte grupy menu (zapamiętane w przeglądarce).
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try { const v = JSON.parse(lsGet(GROUPS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const toggleGroup = (id) => {
    setCollapsedGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      lsSet(GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Zamknij mobile sidebar przy zmianie ścieżki
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Zablokuj scroll body gdy sidebar mobilny jest otwarty; Esc zamyka szufladę.
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    if (!isOpen) return () => { document.body.style.overflow = ''; };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Moduły z bazy (wspólny magazyn z trasami i ⌘K; start z cache).
  const { modules: dynamicModules } = useAppModules();

  // Pobierz komponent ikony po nazwie
  const getIconComponent = (iconName) => LucideIcons[iconName] || LucideIcons.Square;

  // Dostęp do modułu = capability module:<mod> (resolver: admini/granty/legacy).
  const hasModuleAccess = (moduleResource) => (moduleResource ? can(moduleResource) : true);

  // Wszystkie pozycje menu (bez Ustawień — te są na dole).
  const navLinks = useMemo(() => {
    const dbByKey = new Map(dynamicModules.map((m) => [m.key, m]));
    const prog = dbByKey.get('programs');
    // „Rdzeń”: Pulpit dla wszystkich; Programy bramkowane zdolnością module:programs.
    const core = [
      { key: 'dashboard', path: '/', iconName: 'LayoutDashboard', label: tr('Pulpit'), show: true },
      { key: 'programs', path: '/programs', iconName: prog?.icon || 'ListOrdered', label: prog?.label ? normalizeModuleLabel(prog.label) : tr('Programy'), show: hasModuleAccess('module:programs') },
    ];
    let mods;
    if (dynamicModules.length > 0) {
      mods = dynamicModules
        .filter((m) => m && m.path && m.is_enabled)
        .filter((m) => !['dashboard', 'programs', 'settings'].includes(m.key) && !HIDDEN_NAV_KEYS.includes(m.key))
        .map((m) => ({
          key: m.key,
          path: m.path,
          iconName: m.icon,
          label: normalizeModuleLabel(m.label),
          show: hasModuleAccess(m.resource_key),
        }));
    } else {
      mods = STATIC_MODULES.map((m) => ({
        key: m.key,
        path: m.path,
        iconName: m.iconName,
        label: tr(m.label),
        show: m.setting
          ? !!moduleSettings?.[m.setting] && hasModuleAccess(SETTING_RESOURCE[m.setting])
          : hasModuleAccess(m.resource),
      }));
    }
    return dedupeIconNames([...core, ...mods].filter((l) => l.show));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicModules, can, moduleSettings]);

  const groups = useMemo(() => groupNavLinks(navLinks), [navLinks]);
  const activeKey = resolveActiveKey(location.pathname, [...navLinks, { key: 'settings', path: '/settings' }]);

  // Nawigacja z ochroną niezapisanych zmian. state.navReset: klik w menu = zakładka domyślna
  // modułu (ResponsiveTabs), także gdy jesteśmy już w tym module.
  const goTo = (e, path, isMobile) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      checkBeforeNavigate(() => {
        navigate(path, { state: { navReset: true } });
        if (isMobile) close();
      });
    } else if (isMobile) {
      close();
    }
  };

  const iconOnly = (isMobile) => isCollapsed && !isMobile;

  const renderLink = (link, isMobile) => {
    const isActive = activeKey === link.key;
    const mColor = moduleColors[link.key] || null;
    const Icon = getIconComponent(link.iconName);
    const label = t(link.label);
    return (
      <Tooltip key={link.key || link.path} text={label} show={iconOnly(isMobile)}>
        <Link
          to={link.path}
          state={{ navReset: true }}
          data-tour={`nav-${link.path}`}
          data-nav-key={link.key}
          aria-current={isActive ? 'page' : undefined}
          aria-label={iconOnly(isMobile) ? label : undefined}
          onClick={(e) => goTo(e, link.path, isMobile)}
          style={isActive && mColor ? { background: mColor, boxShadow: `0 10px 15px -3px ${mColor}59` } : undefined}
          className={`flex items-center ${iconOnly(isMobile) ? 'justify-center px-2' : 'gap-3 px-4'} min-h-[42px] py-2 rounded-xl transition-all group ${isActive ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-lg shadow-accent-primary-light/30 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-gray-700 hover:text-accent-primary dark:hover:text-white'}`}
        >
          <Icon size={20} aria-hidden="true" style={!isActive && mColor ? { color: mColor } : undefined} className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-accent-primary-light dark:group-hover:text-white transition-colors'}`} />
          {!iconOnly(isMobile) && <span className="text-sm truncate">{label}</span>}
        </Link>
      </Tooltip>
    );
  };

  const renderGroups = (isMobile) => {
    const compact = iconOnly(isMobile);
    return groups.map((g, gi) => {
      const hasActive = g.links.some((l) => l.key === activeKey);
      // Podczas samouczka wszystkie grupy są rozwinięte (kroki wskazują pozycje menu).
      const collapsed = !compact && !activeTour && collapsedGroups.includes(g.id);
      // Zwinięta grupa nadal pokazuje pozycję, na której jesteś.
      const visible = collapsed ? g.links.filter((l) => l.key === activeKey) : g.links;
      const headerId = `navgrp-${isMobile ? 'm' : 'd'}-${g.id}`;
      const groupLabel = t(g.label);
      return (
        <div
          key={g.id}
          role="group"
          aria-labelledby={compact ? undefined : headerId}
          aria-label={compact ? groupLabel : undefined}
          className={gi > 0 ? (compact ? 'pt-2 mt-2 border-t border-gray-200/70 dark:border-gray-700' : 'pt-3') : ''}
        >
          {!compact && (
            <button
              type="button"
              id={headerId}
              onClick={() => toggleGroup(g.id)}
              aria-expanded={!collapsed}
              className="w-full flex items-center justify-between gap-2 px-4 min-h-[32px] py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              <span className="truncate">{groupLabel}</span>
              <span className="flex items-center gap-1 shrink-0">
                {collapsed && !hasActive && (
                  <span className="normal-case tracking-normal font-medium">{g.links.length}</span>
                )}
                <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
              </span>
            </button>
          )}
          <div className="space-y-0.5 mt-0.5">
            {visible.map((link) => renderLink(link, isMobile))}
          </div>
        </div>
      );
    });
  };

  // Wspólna zawartość sidebara. Funkcja, nie komponent — inaczej każde odświeżenie
  // przemontowałoby całe menu i gubiło fokus klawiatury (np. po zwinięciu grupy).
  const renderContent = (isMobile) => (
    <>
      {/* LOGO - Desktop */}
      {!isMobile && (
        <div className={`${isCollapsed ? 'p-3' : 'p-4 lg:p-6'} border-b border-gray-200/50 dark:border-gray-700 flex justify-center items-center shrink-0`}>
          {(logoUrl || sidebarLogo) ? (
            <img
              src={logoUrl || sidebarLogo}
              alt={tr('Logo kościoła')}
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
            <img src={logoUrl || sidebarLogo} alt="" className="w-8 h-8 object-contain" onError={(e) => { if (logoUrl && e.target.src !== sidebarLogo) e.target.src = sidebarLogo; }} />
            <span className="font-semibold text-gray-800 dark:text-white">{tr('Menu')}</span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={tr('Zamknij menu')}
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* NAWIGACJA */}
      <nav
        data-tour="sidebar"
        aria-label={tr('Menu główne')}
        className={`flex-1 ${iconOnly(isMobile) ? 'p-2' : 'p-3 lg:p-4'} overflow-y-auto custom-scrollbar ${isMobile ? 'mt-0' : 'mt-2'}`}
      >
        {!sidebarReady ? (
          // Skeleton loader — pulsujące placeholdery zamiast migotania
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`flex items-center ${iconOnly(isMobile) ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-xl animate-pulse`}>
              <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
              {!iconOnly(isMobile) && (
                <div className={`h-4 bg-gray-200 dark:bg-gray-700 rounded ${i < 3 ? 'w-20' : i < 6 ? 'w-32' : 'w-24'}`} />
              )}
            </div>
          ))
        ) : (
          renderGroups(isMobile)
        )}
      </nav>

      {/* USTAWIENIA */}
      {hasModuleAccess('module:settings') && (
        <div className={`${iconOnly(isMobile) ? 'p-2' : 'p-3 lg:p-4'} border-t border-gray-200/50 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 shrink-0`}>
          <Tooltip text={tr('Ustawienia')} show={iconOnly(isMobile)}>
            <Link
              to="/settings"
              state={{ navReset: true }}
              data-tour="nav-/settings"
              data-nav-key="settings"
              aria-current={activeKey === 'settings' ? 'page' : undefined}
              aria-label={iconOnly(isMobile) ? tr('Ustawienia') : undefined}
              onClick={(e) => goTo(e, '/settings', isMobile)}
              className={`flex items-center ${iconOnly(isMobile) ? 'justify-center px-2' : 'gap-3 px-4'} min-h-[42px] py-2 rounded-xl transition-all w-full ${activeKey === 'settings' ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-lg shadow-accent-primary-light/30 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
            >
              <Settings size={20} className="shrink-0" aria-hidden="true" />
              {!iconOnly(isMobile) && <span className="text-sm font-medium">{tr('Ustawienia')}</span>}
            </Link>
          </Tooltip>
        </div>
      )}
    </>
  );

  return (
    <div className={sidebarWrap} style={{ display: 'contents' }}>
      {/* Desktop Sidebar */}
      <div
        className={`app-sidebar-panel hidden lg:flex ${isCollapsed ? 'w-20' : ''} bg-white/80 dark:bg-gray-800/90 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-700 shadow-lg flex-col transition-all duration-300 h-full relative z-40`}
        style={isCollapsed ? undefined : { width: 'var(--sidebar-w, 16rem)' }}
      >
        {/* Przycisk zwijania */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full shadow-md flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-primary-light hover:border-accent-primary-light dark:hover:border-accent-primary transition-all z-50"
          title={isCollapsed ? tr('Rozwiń menu') : tr('Zwiń menu')}
          aria-label={isCollapsed ? tr('Rozwiń menu') : tr('Zwiń menu')}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronLeft size={14} aria-hidden="true" />}
        </button>

        {renderContent(false)}
      </div>

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-[60] transition-opacity"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar Drawer — ukryty (invisible) poza otwarciem, żeby Tab nie wchodził w schowane menu */}
      <div
        id="mobile-nav-drawer"
        className={`app-sidebar-panel lg:hidden fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-gray-800 shadow-2xl z-[60] transform transition-all duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'}`}
      >
        {renderContent(true)}
      </div>
    </div>
  );
}
