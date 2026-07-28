// Konfiguracja onboardingu — jedno źródło prawdy dla samouczka (product tour),
// checklisty „Pierwsze kroki", kontekstowych podpowiedzi i kreatora nowego tenanta.
//
// Wszystkie napisy to POLSKIE stringi = klucze i18n. Komponenty renderują je przez
// t()/tr(), a tłumaczenia EN/UK żyją w src/i18n/translations.js. Dzięki temu dodanie
// nowego kroku sprowadza się do edycji tego pliku.

import {
  Calendar, Users, ListChecks, Palette, Boxes, UserPlus, FileText, UserCircle,
  Compass, CalendarClock, ClipboardCheck, CalendarPlus, GraduationCap,
  Coins, Home, Send, Video,
  Heart, BookOpen, ClipboardList, Baby, Bell, MessageCircle,
  MessageSquare, Target, Sparkles, CalendarCheck, HeartHandshake,
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

  // ── Proces: jak zaksięgować wpływ (kolekta / darowizna) ──
  'finance-income': [
    { selector: '[data-tour="fin-income-tab"]', route: '/finance', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Otwórz „Wpływy"', body: 'Wpłaty — kolekty i darowizny — księgujemy w zakładce „Wpływy". Kliknij ją.' },
    { selector: '[data-tour="fin-income-add"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 10000,
      title: 'Dodaj wpływ', body: 'Kliknij „Dodaj wpływ", aby zaksięgować nową wpłatę.' },
    { selector: '[data-tour="fin-income-amount"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Kwota', body: 'Wpisz kwotę wpłaty (PLN). Wyżej ustawisz datę oraz typ — kolekta, darowizna lub inne.' },
    { selector: '[data-tour="fin-income-source"]', placement: 'bottom', interactive: true,
      title: 'Źródło', body: 'Opisz źródło wpłaty — np. „Kolekta niedzielna".' },
    { selector: '[data-tour="fin-income-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz wpływ', body: 'Zapisz — wpłata trafi do zestawień i raportów finansowych.' },
  ],

  // ── Proces: jak założyć grupę domową ──
  'homegroup-create': [
    { selector: '[data-tour="hg-add-group"]', route: '/home-groups', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Nowa grupa domowa', body: 'Kliknij „Dodaj grupę", aby utworzyć nową grupę domową.' },
    { selector: '[data-tour="hg-group-name"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Nazwa grupy', body: 'Nadaj grupie nazwę — np. „Grupa środowa u Kowalskich".' },
    { selector: '[data-tour="hg-group-day"]', placement: 'bottom', interactive: true,
      title: 'Dzień spotkań', body: 'Ustaw dzień i godzinę cyklicznych spotkań.' },
    { selector: '[data-tour="hg-group-location"]', placement: 'bottom', interactive: true,
      title: 'Lokalizacja', body: 'Wskaż miejsce spotkań. Możesz też wybrać lidera grupy (jeśli już go dodałeś).' },
    { selector: '[data-tour="hg-group-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz grupę', body: 'Zapisz. Następnie na karcie grupy kliknij „Członkowie", aby dodać do niej osoby.' },
  ],

  // ── Proces: jak wysłać mailing (newsletter) ──
  'mailing-send': [
    { selector: '[data-tour="mail-new"]', route: '/mailing', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Nowy mail', body: 'Kliknij „Nowy mail", aby otworzyć kreator wiadomości.' },
    { selector: '[data-tour="mail-name"]', placement: 'bottom', interactive: true, waitMs: 12000,
      title: 'Nazwa wiadomości', body: 'Krok „Podstawy": nadaj nazwę wewnętrzną (widoczną tylko dla Ciebie).' },
    { selector: '[data-tour="mail-subject"]', placement: 'bottom', interactive: true,
      title: 'Temat', body: 'Wpisz temat wiadomości — to zobaczą odbiorcy w skrzynce.' },
    { selector: '[data-tour="mail-next"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Przejdź dalej', body: 'Przyciskiem „Dalej" przechodzisz przez kolejne kroki: treść, odbiorcy, podsumowanie.' },
    { selector: '[data-tour="mail-recipients"]', placement: 'top', interactive: true, waitMs: 20000, optional: true,
      title: 'Wybierz odbiorców', body: 'W kroku „Odbiorcy" wskaż segmenty: wszyscy, konkretne służby lub grupy.' },
    { selector: '[data-tour="mail-send"]', placement: 'top', interactive: true, optional: true,
      title: 'Wyślij', body: 'W podsumowaniu wyślij wiadomość teraz albo zaplanuj wysyłkę na później.' },
  ],

  // ── Proces: jak ułożyć grafik zespołu medialnego ──
  'media-schedule': [
    { selector: '[data-tour="media-grafik-section"]', route: '/media', placement: 'top', interactive: true, waitMs: 10000,
      title: 'Grafik zespołu medialnego', body: 'To grafik mediów: wiersze to nabożeństwa, kolumny to służby medialne (prezentacja, wideo, foto, nagłośnienie).' },
    { selector: '[data-tour="media-grafik-section"]', placement: 'top', interactive: true,
      title: 'Przypisz osobę', body: 'Kliknij komórkę roli przy wybranym nabożeństwie i wybierz osobę z listy. Zapis następuje automatycznie, a osoba dostanie powiadomienie.' },
  ],

  // ── Proces: jak dodać intencję modlitewną ──
  'prayer-request': [
    { selector: '[data-tour="prayer-add"]', route: '/prayer', placement: 'left', interactive: true, advanceOn: 'click',
      title: 'Dodaj intencję', body: 'Kliknij „Dodaj intencję", aby dodać nową prośbę modlitewną.' },
    { selector: '[data-tour="prayer-content"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Treść intencji', body: 'Opisz prośbę modlitewną. Możesz ustawić anonimowość oraz widoczność — dla wszystkich lub tylko dla liderów.' },
    { selector: '[data-tour="prayer-category"]', placement: 'top', interactive: true,
      title: 'Kategoria', body: 'Wybierz kategorię intencji — ułatwi to jej odnalezienie.' },
    { selector: '[data-tour="prayer-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz', body: 'Zapisz — intencja pojawi się na ścianie modlitwy.' },
  ],

  // ── Proces: jak zaplanować kazanie (nauczanie) ──
  'teaching-plan': [
    { selector: '[data-tour="teaching-schedule-tab"]', route: '/teaching', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Zakładka Grafik', body: 'Kazania planujesz w zakładce „Grafik". Kliknij ją.' },
    { selector: '[data-tour="teaching-schedule-section"]', placement: 'top', interactive: true, waitMs: 10000,
      title: 'Zaplanuj kazanie', body: 'Dla każdego nabożeństwa (wiersz) uzupełnij mówcę, serię, tytuł kazania i fragment Pisma. Zmiany zapisują się automatycznie. Same nabożeństwa dodajesz w module „Programy".' },
  ],

  // ── Proces: jak stworzyć formularz ──
  'forms-build': [
    { selector: '[data-tour="forms-new"]', route: '/forms', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Nowy formularz', body: 'Kliknij „Nowy formularz", aby otworzyć kreator.' },
    { selector: '[data-tour="fb-title"]', placement: 'bottom', interactive: true, waitMs: 12000,
      title: 'Nazwa formularza', body: 'Nadaj formularzowi tytuł, który zobaczą wypełniający.' },
    { selector: '[data-tour="fb-palette"]', placement: 'right', interactive: true,
      title: 'Dodaj pola', body: 'Przeciągnij pola z tego panelu na formularz (tekst, e-mail, wybór, zgoda…). Tak dodajesz pytania.' },
    { selector: '[data-tour="fb-save"]', placement: 'bottom', interactive: true,
      title: 'Zapisz', body: 'Zapisuj postępy pracy nad formularzem.' },
    { selector: '[data-tour="fb-publish"]', placement: 'bottom', interactive: true, optional: true,
      title: 'Opublikuj', body: 'Gdy skończysz — opublikuj formularz i udostępnij link do wypełnienia.' },
  ],

  // ── Proces: jak dodać grupę i dziecko (Małe Avenit) ──
  'kids-add-child': [
    { selector: '[data-tour="kids-tab-groups"]', route: '/kids', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Zakładka Grupy', body: 'Zacznij od grup wiekowych. Kliknij zakładkę „Grupy".' },
    { selector: '[data-tour="kids-group-new"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 10000,
      title: 'Dodaj grupę', body: 'Kliknij „Dodaj grupę", aby utworzyć grupę wiekową.' },
    { selector: '[data-tour="kids-group-name"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Nazwa grupy', body: 'Nadaj grupie nazwę (np. „Przedszkolaki"). Możesz przypisać nauczycieli i salę.' },
    { selector: '[data-tour="kids-group-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz grupę', body: 'Zapisz grupę.' },
    { selector: '[data-tour="kids-tab-students"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 10000,
      title: 'Zakładka Uczniowie', body: 'Teraz dodajmy dziecko. Kliknij zakładkę „Uczniowie".' },
    { selector: '[data-tour="kids-student-new"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 10000,
      title: 'Nowy uczeń', body: 'Kliknij „Nowy uczeń".' },
    { selector: '[data-tour="kids-student-name"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Dane dziecka', body: 'Wpisz imię i nazwisko. Możesz ustawić rocznik oraz przypisać dziecko do rodziny i grupy.' },
    { selector: '[data-tour="kids-student-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz', body: 'Zapisz — dziecko trafi do bazy i będzie gotowe do check-inu.' },
  ],

  // ── Proces: jak wysłać powiadomienie push ──
  'push-send': [
    { selector: '[data-tour="push-new"]', route: '/push-campaigns', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Nowa kampania', body: 'Kliknij „Nowa kampania", aby stworzyć powiadomienie push.' },
    { selector: '[data-tour="push-name"]', placement: 'bottom', interactive: true, waitMs: 12000,
      title: 'Nazwa', body: 'Nadaj kampanii nazwę wewnętrzną (widoczną tylko dla Ciebie).' },
    { selector: '[data-tour="push-title"]', placement: 'bottom', interactive: true,
      title: 'Tytuł', body: 'Tytuł powiadomienia — to zobaczą odbiorcy na ekranie.' },
    { selector: '[data-tour="push-body"]', placement: 'bottom', interactive: true,
      title: 'Treść', body: 'Napisz treść powiadomienia. Potem w sekcji „Odbiorcy" wskaż, do kogo ma trafić.' },
    { selector: '[data-tour="push-send"]', placement: 'bottom', interactive: true, optional: true,
      title: 'Wyślij', body: 'Wyślij powiadomienie teraz albo zaplanuj wysyłkę na później.' },
  ],

  // ── Proces: jak napisać wiadomość w komunikatorze ──
  'komunikator-message': [
    { selector: '[data-tour="komunikator-new"]', route: '/komunikator', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Nowa rozmowa', body: 'Kliknij, aby rozpocząć nową rozmowę.' },
    { selector: '[data-tour="komunikator-user-search"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Znajdź osobę', body: 'Wyszukaj osobę, z którą chcesz porozmawiać (albo przełącz na „Grupa", by założyć czat grupowy).' },
    { selector: '[data-tour="komunikator-users"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 10000,
      title: 'Wybierz osobę', body: 'Kliknij osobę z listy — rozmowa zostanie od razu utworzona.' },
    { selector: '[data-tour="komunikator-message"]', placement: 'top', interactive: true, waitMs: 12000,
      title: 'Napisz wiadomość', body: 'Wpisz treść wiadomości w polu na dole ekranu.' },
    { selector: '[data-tour="komunikator-send"]', placement: 'left', interactive: true, optional: true,
      title: 'Wyślij', body: 'Wyślij wiadomość (albo naciśnij Enter).' },
  ],

  // ── Proces: jak wysłać kampanię SMS ──
  'sms-send': [
    { selector: '[data-tour="sms-new"]', route: '/sms-campaigns', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Nowa kampania SMS', body: 'Kliknij „Nowa kampania", aby stworzyć wysyłkę SMS.' },
    { selector: '[data-tour="sms-name"]', placement: 'bottom', interactive: true, waitMs: 12000,
      title: 'Nazwa', body: 'Nadaj kampanii nazwę wewnętrzną (widoczną tylko dla Ciebie).' },
    { selector: '[data-tour="sms-body"]', placement: 'bottom', interactive: true,
      title: 'Treść SMS', body: 'Napisz treść wiadomości. Pamiętaj o limicie znaków. Potem w sekcji „Odbiorcy" wskaż adresatów.' },
    { selector: '[data-tour="sms-send"]', placement: 'bottom', interactive: true, optional: true,
      title: 'Wyślij', body: 'Wyślij SMS teraz albo zaplanuj wysyłkę na później.' },
  ],

  // ── Proces: jak założyć zbiórkę (darowizny) ──
  'giving-campaign': [
    { selector: '[data-tour="giving-campaigns-tab"]', route: '/giving', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Zakładka Kampanie', body: 'Zbiórki z celem kwotowym zakładasz w zakładce „Kampanie". Kliknij ją.' },
    { selector: '[data-tour="giving-campaign-new"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 10000,
      title: 'Nowa zbiórka', body: 'Kliknij „Nowa kampania", aby utworzyć zbiórkę z celem.' },
    { selector: '[data-tour="giving-campaign-name"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Nazwa zbiórki', body: 'Nadaj zbiórce nazwę (np. „Remont dachu").' },
    { selector: '[data-tour="giving-campaign-goal"]', placement: 'bottom', interactive: true,
      title: 'Cel kwotowy', body: 'Ustaw cel w złotówkach — na tej podstawie wyświetli się „termometr" postępu zbiórki.' },
    { selector: '[data-tour="giving-campaign-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz', body: 'Zapisz — zbiórka będzie widoczna, a wpłaty online (link /give) będą ją zasilać.' },
  ],

  // ── Proces: jak dodać wydarzenie młodzieżowe ──
  'mlodziezowka-event': [
    { selector: '[data-tour="mlodz-event-add"]', route: '/mlodziezowka', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Dodaj wydarzenie', body: 'Kliknij „Dodaj wydarzenie", aby zaplanować spotkanie młodzieżowe.' },
    { selector: '[data-tour="mlodz-event-title"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Tytuł', body: 'Nadaj wydarzeniu nazwę (np. „Wieczór uwielbienia").' },
    { selector: '[data-tour="mlodz-event-date"]', placement: 'bottom', interactive: true,
      title: 'Data', body: 'Ustaw datę wydarzenia. Możesz dodać godzinę, miejsce i limit uczestników.' },
    { selector: '[data-tour="mlodz-event-save"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Zapisz', body: 'Zapisz — wydarzenie pojawi się na liście młodzieżówki.' },
  ],

  // ── Proces: jak utworzyć zapisy (RSVP) na wydarzenie ──
  'rsvp-campaign': [
    { selector: '[data-tour="rsvp-new"]', route: '/rsvp', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Nowe zapisy', body: 'Kliknij „Nowa kampania", aby uruchomić zapisy „Będę / Nie będę".' },
    { selector: '[data-tour="rsvp-title"]', placement: 'bottom', interactive: true, waitMs: 10000,
      title: 'Tytuł i szczegóły', body: 'Nadaj tytuł, wybierz typ, ustaw datę oraz kanały (push / e-mail / SMS) i wskaż odbiorców.' },
    { selector: '[data-tour="rsvp-create"]', placement: 'top', interactive: true, advanceOn: 'click',
      title: 'Utwórz', body: 'Utwórz — zaproszenia trafią do wybranych osób, a Ty zobaczysz odpowiedzi na bieżąco.' },
  ],

  // ── Proces: jak zanotować kontakt duszpasterski (Care) ──
  'care-log': [
    { selector: '[data-tour="care-search"]', route: '/care', placement: 'right', interactive: true, waitMs: 10000,
      title: 'Wybierz osobę', body: 'Znajdź i kliknij osobę na liście po lewej, aby otworzyć jej kartę opieki.' },
    { selector: '[data-tour="care-tab"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 15000,
      title: 'Zakładka Opieka', body: 'Kliknij zakładkę „Opieka", aby zobaczyć historię kontaktów duszpasterskich.' },
    { selector: '[data-tour="care-add"]', placement: 'top', interactive: true, waitMs: 10000,
      title: 'Dodaj kontakt', body: 'Wybierz typ kontaktu (wizyta, telefon, modlitwa…), datę i opis, a następnie kliknij „Dodaj kontakt". Wpis trafi do historii opieki.' },
  ],

  // ── Proces: jak zarezerwować salę ──
  'rooms-booking': [
    { selector: '[data-tour="rooms-bookings-tab"]', route: '/rooms', placement: 'bottom', interactive: true, advanceOn: 'click',
      title: 'Zakładka Rezerwacje', body: 'Rezerwacje sal robisz w zakładce „Rezerwacje". Kliknij ją.' },
    { selector: '[data-tour="rooms-booking-new"]', placement: 'bottom', interactive: true, advanceOn: 'click', waitMs: 10000, optional: true,
      title: 'Nowa rezerwacja', body: 'Kliknij „Nowa rezerwacja". Jeśli przycisk jest nieaktywny — najpierw dodaj salę/zasób w zakładce „Zasoby".' },
    { selector: '[data-tour="rooms-booking-title"]', placement: 'bottom', interactive: true, waitMs: 10000, optional: true,
      title: 'Szczegóły', body: 'Wybierz zasób (salę), nadaj tytuł oraz ustaw początek i koniec rezerwacji.' },
    { selector: '[data-tour="rooms-booking-save"]', placement: 'top', interactive: true, advanceOn: 'click', optional: true,
      title: 'Zapisz', body: 'Zapisz — system automatycznie sprawdzi konflikty terminów i utworzy rezerwację.' },
  ],
};

// ── Katalog przewodników (biblioteka „Samouczki") ───────────────────────────
// Każdy wpis odpala tour z TOURS (pole id = klucz w TOURS). category grupuje w UI.
export const TUTORIALS = [
  { id: 'welcome', title: 'Szybkie wprowadzenie', desc: 'Przegląd całego panelu w minutę.', icon: Compass, category: 'Podstawy' },
  { id: 'program-build', title: 'Jak zbudować program', desc: 'Zaplanuj nabożeństwo krok po kroku.', icon: FileText, category: 'Planowanie' },
  { id: 'grafik-fill', title: 'Jak uzupełnić grafik', desc: 'Przypisz osoby do służb.', icon: CalendarClock, category: 'Planowanie' },
  { id: 'calendar-event', title: 'Jak dodać wydarzenie', desc: 'Utwórz wpis w kalendarzu.', icon: CalendarPlus, category: 'Planowanie' },
  { id: 'media-schedule', title: 'Jak ułożyć grafik mediów', desc: 'Przypisz zespół medialny do nabożeństw.', icon: Video, category: 'Planowanie' },
  { id: 'attendance-mark', title: 'Jak zaznaczyć obecność', desc: 'Notuj obecność i nieobecność.', icon: ClipboardCheck, category: 'Ludzie' },
  { id: 'member-add', title: 'Jak dodać członka', desc: 'Dopisz nową osobę do bazy.', icon: UserPlus, category: 'Ludzie' },
  { id: 'homegroup-create', title: 'Jak założyć grupę domową', desc: 'Utwórz grupę i dodaj osoby.', icon: Home, category: 'Ludzie' },
  { id: 'finance-income', title: 'Jak zaksięgować wpływ', desc: 'Zapisz kolektę lub darowiznę.', icon: Coins, category: 'Finanse' },
  { id: 'mailing-send', title: 'Jak wysłać mailing', desc: 'Stwórz i wyślij wiadomość e-mail.', icon: Send, category: 'Komunikacja' },
  { id: 'push-send', title: 'Jak wysłać powiadomienie push', desc: 'Stwórz i wyślij kampanię push.', icon: Bell, category: 'Komunikacja' },
  { id: 'komunikator-message', title: 'Jak napisać wiadomość', desc: 'Rozpocznij rozmowę w komunikatorze.', icon: MessageCircle, category: 'Komunikacja' },
  { id: 'forms-build', title: 'Jak stworzyć formularz', desc: 'Zbuduj i opublikuj formularz.', icon: ClipboardList, category: 'Komunikacja' },
  { id: 'teaching-plan', title: 'Jak zaplanować kazanie', desc: 'Przypisz mówcę i temat do nabożeństwa.', icon: BookOpen, category: 'Planowanie' },
  { id: 'prayer-request', title: 'Jak dodać intencję modlitewną', desc: 'Dodaj prośbę na ścianę modlitwy.', icon: Heart, category: 'Ludzie' },
  { id: 'kids-add-child', title: 'Jak dodać dziecko (Małe Avenit)', desc: 'Utwórz grupę i dopisz dziecko.', icon: Baby, category: 'Ludzie' },
  { id: 'sms-send', title: 'Jak wysłać SMS', desc: 'Stwórz i wyślij kampanię SMS.', icon: MessageSquare, category: 'Komunikacja' },
  { id: 'giving-campaign', title: 'Jak założyć zbiórkę', desc: 'Kampania z celem i termometrem.', icon: Target, category: 'Finanse' },
  { id: 'mlodziezowka-event', title: 'Jak dodać wydarzenie młodzieżowe', desc: 'Zaplanuj spotkanie młodzieżówki.', icon: Sparkles, category: 'Ludzie' },
  { id: 'rsvp-campaign', title: 'Jak uruchomić zapisy (RSVP)', desc: 'Zbieraj potwierdzenia obecności.', icon: CalendarCheck, category: 'Planowanie' },
  { id: 'care-log', title: 'Jak zanotować opiekę', desc: 'Zapisz kontakt duszpasterski.', icon: HeartHandshake, category: 'Ludzie' },
  { id: 'rooms-booking', title: 'Jak zarezerwować salę', desc: 'Rezerwacja z wykrywaniem konfliktów.', icon: CalendarClock, category: 'Planowanie' },
];

// Kolejność kategorii w bibliotece.
export const TUTORIAL_CATEGORIES = ['Podstawy', 'Planowanie', 'Ludzie', 'Finanse', 'Komunikacja'];

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
