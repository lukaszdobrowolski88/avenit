// Konfiguracja onboardingu — jedno źródło prawdy dla samouczka (product tour),
// checklisty „Pierwsze kroki", kontekstowych podpowiedzi i kreatora nowego tenanta.
//
// Wszystkie napisy to POLSKIE stringi = klucze i18n. Komponenty renderują je przez
// t()/tr(), a tłumaczenia EN/UK żyją w src/i18n/translations.js. Dzięki temu dodanie
// nowego kroku sprowadza się do edycji tego pliku.

import {
  Calendar, Users, ListChecks, Palette, Boxes, UserPlus, FileText, UserCircle,
  Compass, CalendarClock, ClipboardCheck, CalendarPlus, GraduationCap,
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
      body: 'W każdej chwili kliknij tutaj, aby ponownie uruchomić samouczek albo otworzyć listę kroków i przewodników.',
      placement: 'bottom',
    },
  ],

  // ── Proces: jak zbudować program (plan nabożeństwa) ──
  'program-build': [
    { selector: '[data-tour="prog-new"]', route: '/programs', placement: 'left', interactive: true, advanceOn: 'click',
      title: 'Utwórz nowy program', body: 'Zacznijmy od planu nabożeństwa. Kliknij „Nowy" przy wybranym typie, aby otworzyć edytor programu.' },
    { selector: '[data-tour="prog-title"]', placement: 'bottom', interactive: true, waitMs: 12000,
      title: 'Nadaj nazwę', body: 'Wpisz nazwę programu — np. „Nabożeństwo niedzielne".' },
    { selector: '[data-tour="prog-date"]', placement: 'bottom', interactive: true,
      title: 'Ustaw datę', body: 'Wybierz datę, w której odbędzie się program.' },
    { selector: '[data-tour="prog-add-item"]', placement: 'bottom', interactive: true,
      title: 'Dodaj elementy planu', body: 'Tu budujesz przebieg: pieśni, nagłówki, ogłoszenia, media. Kliknij „Dodaj", aby dołożyć pozycję do planu.' },
    { selector: '[data-tour="prog-team"]', placement: 'top', interactive: true, optional: true,
      title: 'Przypisz służby', body: 'W tej sekcji przypisujesz osoby do służb (zespół uwielbienia, media…). Przypisane osoby dostaną powiadomienie.' },
    { selector: '[data-tour="prog-save"]', placement: 'bottom', interactive: true,
      title: 'Zapisz program', body: 'Na koniec zapisz. Gotowe — Twój plan nabożeństwa jest utworzony i widoczny dla zespołu!' },
  ],

  // ── Proces: jak zaznaczyć obecność / nieobecność ──
  'attendance-mark': [
    { selector: '[data-tour="att-add-session"]', route: '/attendance', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Utwórz sesję', body: 'Obecność notujemy w „sesjach" — czyli konkretne spotkanie danego dnia. Kliknij „Dodaj sesję".' },
    { selector: '[data-tour="att-session-date"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Data i typ', body: 'Wybierz datę sesji oraz jej typ (np. nabożeństwo, spotkanie grupy).' },
    { selector: '[data-tour="att-session-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz sesję', body: 'Zapisz — sesja pojawi się na liście.' },
    { selector: '[data-tour="att-session-list"]', placement: 'top', interactive: true, advanceOn: 'click', waitMs: 10000,
      title: 'Otwórz sesję', body: 'Kliknij sesję na liście, aby otworzyć imienną listę obecności.' },
    { selector: '[data-tour="att-mark"]', placement: 'left', interactive: true, waitMs: 10000,
      title: 'Zaznacz obecność', body: 'Kliknij osobę, aby oznaczyć ją jako obecną (zielony znacznik). Ponowne kliknięcie = nieobecność. Zmiany zapisują się automatycznie.' },
  ],

  // ── Proces: jak uzupełnić grafik służb ──
  'grafik-fill': [
    { selector: '[data-tour="grafik-tab"]', route: '/worship', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Otwórz grafik', body: 'Grafik służb jest w zakładce „Grafik". Kliknij ją, aby zobaczyć rozpiskę.' },
    { selector: '[data-tour="grafik-section"]', placement: 'top', interactive: true, waitMs: 10000,
      title: 'Tak wygląda grafik', body: 'Wiersze to kolejne programy/nabożeństwa, a kolumny to poszczególne służby (np. wokal, dźwięk, prowadzenie).' },
    { selector: '[data-tour="grafik-section"]', placement: 'top', interactive: true,
      title: 'Przypisz osobę do służby', body: 'Kliknij komórkę roli przy wybranym programie i wybierz osobę z listy. Zostanie powiadomiona e-mailem i potwierdzi służbę. Zapis następuje automatycznie.' },
  ],

  // ── Proces: jak dodać członka ──
  'member-add': [
    { selector: '[data-tour="member-add"]', route: '/members', placement: 'bottom', interactive: true, advanceOn: 'click', optional: true,
      title: 'Dodaj osobę', body: 'Kliknij „Dodaj osobę", aby dopisać nowego członka do bazy.' },
    { selector: '[data-tour="member-first"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Imię', body: 'Wpisz imię nowej osoby.' },
    { selector: '[data-tour="member-last"]', placement: 'bottom', interactive: true,
      title: 'Nazwisko', body: 'Uzupełnij nazwisko (imię i nazwisko są wymagane). Pozostałe dane — telefon, e-mail, służby — możesz dodać teraz lub później.' },
    { selector: '[data-tour="member-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz', body: 'Zapisz — osoba trafi do bazy członków i będzie dostępna w innych modułach.' },
  ],

  // ── Proces: jak dodać wydarzenie do kalendarza ──
  'calendar-event': [
    { selector: '[data-tour="cal-add"]', route: '/calendar', placement: 'right', interactive: true, advanceOn: 'click',
      title: 'Dodaj do kalendarza', body: 'Kliknij „Dodaj", aby utworzyć nowy wpis w kalendarzu.' },
    { selector: '[data-tour="cal-type-event"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 10000,
      title: 'Wybierz „Wydarzenie"', body: 'Wybierz „Wydarzenie". Następnie wskażesz kalendarz (np. ogólny lub konkretnej służby).' },
    { selector: '[data-tour="cal-event-title"]', placement: 'bottom', interactive: true, waitMs: 12000, optional: true,
      title: 'Szczegóły wydarzenia', body: 'Nadaj wydarzeniu nazwę, ustaw datę oraz godziny rozpoczęcia i zakończenia.' },
    { selector: '[data-tour="cal-event-save"]', placement: 'top', interactive: true, optional: true,
      title: 'Zapisz wydarzenie', body: 'Zapisz — wydarzenie pojawi się w kalendarzu, a jeśli włączysz zapisy (RSVP), członkowie będą mogli się zgłaszać.' },
  ],
};

// ── Katalog przewodników (biblioteka „Samouczki") ───────────────────────────
// Każdy wpis odpala tour z TOURS (pole id = klucz w TOURS). category grupuje w UI.
export const TUTORIALS = [
  { id: 'welcome', title: 'Szybkie wprowadzenie', desc: 'Przegląd całego panelu w minutę.', icon: Compass, category: 'Podstawy' },
  { id: 'program-build', title: 'Jak zbudować program', desc: 'Zaplanuj nabożeństwo krok po kroku.', icon: FileText, category: 'Planowanie' },
  { id: 'grafik-fill', title: 'Jak uzupełnić grafik', desc: 'Przypisz osoby do służb.', icon: CalendarClock, category: 'Planowanie' },
  { id: 'calendar-event', title: 'Jak dodać wydarzenie', desc: 'Utwórz wpis w kalendarzu.', icon: CalendarPlus, category: 'Planowanie' },
  { id: 'attendance-mark', title: 'Jak zaznaczyć obecność', desc: 'Notuj obecność i nieobecność.', icon: ClipboardCheck, category: 'Ludzie' },
  { id: 'member-add', title: 'Jak dodać członka', desc: 'Dopisz nową osobę do bazy.', icon: UserPlus, category: 'Ludzie' },
];

// Kolejność kategorii w bibliotece.
export const TUTORIAL_CATEGORIES = ['Podstawy', 'Planowanie', 'Ludzie'];

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
    id: 'tutorials',
    title: 'Naucz się procesów krok po kroku',
    desc: 'Program, grafik, obecność i więcej — w bibliotece przewodników.',
    icon: GraduationCap,
    action: { type: 'tutorials' },
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
