// Konfiguracja onboardingu — jedno źródło prawdy dla samouczka (product tour),
// checklisty „Pierwsze kroki", kontekstowych podpowiedzi i kreatora nowego tenanta.
//
// Wszystkie napisy to POLSKIE stringi = klucze i18n. Komponenty renderują je przez
// t()/tr(), a tłumaczenia EN/UK żyją w src/i18n/translations.js. Dzięki temu dodanie
// nowego kroku sprowadza się do edycji tego pliku.

import {
  Calendar, Users, ListChecks, Palette, Boxes, UserPlus, FileText, UserCircle,
} from 'lucide-react';

// ── Product tour (spotlight / coach-marks) ──────────────────────────────────
// Krok: { selector, title, body, route?, placement?, sidebar? }
//  - selector       — CSS selektor elementu do podświetlenia (data-tour="…")
//  - route          — jeśli podany, tour najpierw przechodzi na tę trasę
//  - placement      — preferowana strona dymka: 'top'|'bottom'|'left'|'right'
//  - sidebar        — krok wskazuje element w menu bocznym (na mobile otwórz drawer)
//  - optional       — jeśli true i elementu brak (np. moduł wyłączony), krok jest pomijany
export const TOURS = {
  welcome: [
    {
      selector: '[data-tour="sidebar"]',
      title: 'Menu główne',
      body: 'Stąd przechodzisz do wszystkich modułów kościoła — członków, kalendarza, finansów i więcej. Widoczne są tylko te, do których masz dostęp.',
      placement: 'right',
      sidebar: true,
      route: '/',
    },
    {
      selector: '[data-tour="nav-/"]',
      title: 'Pulpit',
      body: 'Twój ekran startowy — skróty, nadchodzące wydarzenia i najważniejsze informacje w jednym miejscu.',
      placement: 'right',
      sidebar: true,
    },
    {
      selector: '[data-tour="nav-/calendar"]',
      title: 'Kalendarz',
      body: 'Planuj nabożeństwa, spotkania i wydarzenia. Członkowie mogą zapisywać się (RSVP) i widzieć je w aplikacji.',
      placement: 'right',
      sidebar: true,
    },
    {
      selector: '[data-tour="nav-/members"]',
      title: 'Członkowie',
      body: 'Baza osób w Twoim kościele — dane kontaktowe, grupy, obecność i notatki duszpasterskie.',
      placement: 'right',
      sidebar: true,
      optional: true,
    },
    {
      selector: '[data-tour="search"]',
      title: 'Szybkie wyszukiwanie',
      body: 'Naciśnij ⌘K (lub Ctrl+K), aby błyskawicznie znaleźć osobę, pieśń, grupę lub wydarzenie i przejść wprost do niej.',
      placement: 'bottom',
    },
    {
      selector: '[data-tour="language"]',
      title: 'Język interfejsu',
      body: 'Przełączaj panel między polskim, angielskim i ukraińskim — każdy użytkownik wybiera własny.',
      placement: 'bottom',
      optional: true,
    },
    {
      selector: '[data-tour="getting-started"]',
      title: 'Lista pierwszych kroków',
      body: 'Ten przycisk otwiera checklistę wdrożenia. Odhaczaj kroki, a poznasz system w kilka minut.',
      placement: 'left',
      optional: true,
    },
    {
      selector: '[data-tour="help"]',
      title: 'Pomoc zawsze pod ręką',
      body: 'W każdej chwili kliknij tutaj, aby ponownie uruchomić samouczek albo otworzyć listę kroków.',
      placement: 'bottom',
    },
  ],
};

// ── Checklista „Pierwsze kroki" ─────────────────────────────────────────────
// Zadanie: { id, title, desc, icon, action, autoSignal?, adminOnly? }
//  - action     — { type:'tour', tourId } | { type:'navigate', to } | { type:'wizard' }
//  - autoSignal — nazwa sygnału z OnboardingContext/uprawnień; jeśli spełniony,
//                 krok liczy się jako wykonany automatycznie (bez ręcznego odhaczania).
//                 Kroki BEZ autoSignal oznaczane są jako wykonane po kliknięciu (zaangażowanie).
const COMMON_STEPS = [
  {
    id: 'tour',
    title: 'Poznaj panel w minutę',
    desc: 'Przejdź krótki interaktywny samouczek.',
    icon: ListChecks,
    action: { type: 'tour', tourId: 'welcome' },
    autoSignal: 'tourDone',
  },
  {
    id: 'profile',
    title: 'Uzupełnij swój profil',
    desc: 'Dodaj imię, zdjęcie i dane kontaktowe.',
    icon: UserCircle,
    action: { type: 'navigate', to: '/profile' },
  },
  {
    id: 'calendar',
    title: 'Zobacz kalendarz wydarzeń',
    desc: 'Sprawdź, jak planowane są nabożeństwa i spotkania.',
    icon: Calendar,
    action: { type: 'navigate', to: '/calendar' },
  },
];

const ADMIN_STEPS = [
  {
    id: 'brand',
    title: 'Dodaj logo i kolory kościoła',
    desc: 'Spersonalizuj wygląd panelu pod swoją społeczność.',
    icon: Palette,
    action: { type: 'wizard' },
    autoSignal: 'hasLogo',
    adminOnly: true,
  },
  {
    id: 'modules',
    title: 'Włącz moduły, których używacie',
    desc: 'Finanse, grupy domowe, uwielbienie, media i inne.',
    icon: Boxes,
    action: { type: 'navigate', to: '/settings' },
    adminOnly: true,
  },
  {
    id: 'members',
    title: 'Dodaj pierwszych członków',
    desc: 'Zbuduj bazę osób swojego kościoła.',
    icon: Users,
    action: { type: 'navigate', to: '/members' },
    autoSignal: 'hasMembers',
    adminOnly: true,
  },
  {
    id: 'program',
    title: 'Zaplanuj pierwszy program',
    desc: 'Ułóż przebieg nabożeństwa i przypisz służby.',
    icon: FileText,
    action: { type: 'navigate', to: '/programs' },
    autoSignal: 'hasPrograms',
    adminOnly: true,
  },
  {
    id: 'team',
    title: 'Zaproś współpracowników',
    desc: 'Dodaj liderów i koordynatorów do panelu.',
    icon: UserPlus,
    action: { type: 'navigate', to: '/settings' },
    adminOnly: true,
  },
];

// Zwraca listę kroków zależną od roli. Admin dostaje pełną konfigurację kościoła,
// zwykły użytkownik — lekki przewodnik po funkcjach.
export function getChecklist({ isAdmin }) {
  return isAdmin ? [...COMMON_STEPS, ...ADMIN_STEPS] : COMMON_STEPS;
}

// ── Kontekstowe podpowiedzi (beacony) ───────────────────────────────────────
// Klucz = ścieżka trasy. Beacon: { id, selector, title, body, placement? }
// Kotwiczone do elementów, które kontrolujemy (navbar) — bez ingerencji w moduły.
export const HINTS = {
  '/': [
    {
      id: 'dash-help',
      selector: '[data-tour="help"]',
      title: 'Zgubiłeś się?',
      body: 'Kliknij tutaj, aby wrócić do samouczka lub otworzyć listę pierwszych kroków.',
      placement: 'bottom',
    },
    {
      id: 'dash-search',
      selector: '[data-tour="search"]',
      title: 'Znajdź wszystko w sekundę',
      body: 'Naciśnij ⌘K / Ctrl+K, aby wyszukać osoby, pieśni, grupy i wydarzenia.',
      placement: 'bottom',
    },
  ],
};

// ── Kreator nowego tenanta (dla admina) ─────────────────────────────────────
// Sterowany wewnątrz SetupWizard.jsx; tu tylko metadane kroków (dla nagłówków/paska).
export const WIZARD_STEPS = [
  { id: 'brand', title: 'Marka kościoła', desc: 'Logo i kolory' },
  { id: 'modules', title: 'Moduły', desc: 'Włącz to, czego używacie' },
  { id: 'team', title: 'Zespół', desc: 'Zaproś współpracowników' },
  { id: 'done', title: 'Gotowe!', desc: 'Zaczynamy' },
];

// Moduły proponowane w kreatorze (klucz = app_settings module_<key>_enabled).
export const WIZARD_MODULES = [
  { key: 'members', label: 'Członkowie' },
  { key: 'worship', label: 'Grupa Uwielbienia' },
  { key: 'kids', label: 'Małe Avenit (dzieci)' },
  { key: 'groups', label: 'Grupy domowe' },
  { key: 'finance', label: 'Finanse' },
  { key: 'prayer', label: 'Centrum Modlitwy' },
  { key: 'media', label: 'MediaTeam' },
  { key: 'komunikator', label: 'Komunikator' },
];
