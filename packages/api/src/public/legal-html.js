// Serwerowy (statyczny) HTML stron prawnych: polityka prywatności / regulamin.
//
// Powód istnienia: crawler weryfikacji marki OAuth Google (i inne boty) NIE
// wykonuje JavaScriptu. Nasza SPA renderuje treść stron prawnych dopiero w
// przeglądarce, więc bot widzi pustą powłokę index.html → „strona nie zawiera
// wystarczająco szczegółowych treści". Te trasy zwracają pełny HTML z treścią,
// bez potrzeby JS.
//
// Bez requireTenant — docelowy URL to app.avenit.pl (host globalnego logowania,
// bez tenanta). Gdy jednak trafi tu żądanie z subdomeny tenanta (req.db ustawione
// przez contextPlugin), best-effort dociągamy nazwę organizacji / własną treść.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function shell(title, contentHtml) {
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Avenit</title>
<meta name="robots" content="index, follow">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1rem 4rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.65; color: #1f2937; background: #f9fafb;
  }
  .wrap { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 .25rem; color: #111827; }
  h2 { font-size: 1.25rem; margin: 2rem 0 .5rem; color: #111827; }
  p, li { margin: .5rem 0; }
  ul { padding-left: 1.4rem; }
  .updated { color: #6b7280; font-size: .9rem; margin: 0 0 1.5rem; }
  .foot { margin-top: 3rem; font-size: .9rem; color: #6b7280; }
  .foot a { color: #4f46e5; text-decoration: none; }
  .foot a:hover { text-decoration: underline; }
  strong { color: #111827; }
  @media (prefers-color-scheme: dark) {
    body { color: #d1d5db; background: #0b0f17; }
    h1, h2, strong { color: #f3f4f6; }
    .updated, .foot { color: #9ca3af; }
    .foot a { color: #a5b4fc; }
  }
</style>
</head>
<body>
  <main class="wrap">
    ${contentHtml}
    <p class="foot">
      <a href="/polityka-prywatnosci">Polityka prywatności</a>
      &nbsp;·&nbsp;
      <a href="/regulamin">Regulamin</a>
      &nbsp;·&nbsp;
      <a href="/">Powrót do logowania</a>
    </p>
  </main>
</body>
</html>`;
}

function privacyBody(org, contact, today) {
  const o = esc(org);
  const c = esc(contact);
  return `
  <h1>Polityka prywatności</h1>
  <p class="updated">Ostatnia aktualizacja: ${esc(today)}</p>

  <h2>1. Administrator danych</h2>
  <p>Administratorem Twoich danych osobowych jest ${o} („Administrator"), która korzysta z aplikacji do zarządzania życiem wspólnoty. Oprogramowanie dostarcza platforma <strong>Avenit</strong> jako podmiot przetwarzający dane na zlecenie Administratora.</p>
  <p>Kontakt w sprawach danych: <strong>${c}</strong>.</p>

  <h2>2. Jakie dane przetwarzamy</h2>
  <ul>
    <li>dane konta: imię i nazwisko, adres e-mail, hasło (w postaci zaszyfrowanej), rola;</li>
    <li>dane kontaktowe i profilowe: telefon, zdjęcie profilowe (jeśli podane);</li>
    <li>przynależność do służb, grup i wydarzeń oraz obecność;</li>
    <li>dane związane z darowiznami (jeśli korzystasz z modułu wsparcia finansowego);</li>
    <li>dane logowania zewnętrznego (Google/Microsoft): adres e-mail, imię, zdjęcie — pobierane tylko po Twojej zgodzie na ekranie dostawcy;</li>
    <li>dane techniczne: logi, adres IP, informacje o urządzeniu/sesji, pliki cookie/localStorage niezbędne do działania i bezpieczeństwa.</li>
  </ul>

  <h2>3. Cele i podstawy prawne</h2>
  <ul>
    <li>świadczenie usługi i zarządzanie wspólnotą — niezbędność do realizacji usługi (art. 6 ust. 1 lit. b/f RODO);</li>
    <li>komunikacja (e-mail, powiadomienia) — prawnie uzasadniony interes lub zgoda;</li>
    <li>bezpieczeństwo konta (2FA, wykrywanie nadużyć) — prawnie uzasadniony interes;</li>
    <li>ewidencja darowizn i obowiązki księgowe — obowiązek prawny;</li>
    <li>cele oparte na zgodzie — w zakresie, w jakim jej udzielono (zgodę można cofnąć w każdej chwili).</li>
  </ul>

  <h2>4. Odbiorcy danych</h2>
  <p>Dane mogą być powierzane zaufanym podmiotom przetwarzającym wyłącznie w celu świadczenia usługi: dostawcy hostingu, usłudze wysyłki e-mail, usłudze SMS oraz operatorowi płatności (jeśli używany jest moduł darowizn). Podmioty te działają na podstawie umów powierzenia i nie wykorzystują danych do własnych celów.</p>

  <h2>5. Logowanie przez Google / Microsoft</h2>
  <p>Jeśli logujesz się kontem Google lub Microsoft, otrzymujemy od dostawcy Twój adres e-mail, imię oraz zdjęcie profilowe, aby utworzyć lub dopasować konto w aplikacji. Nie uzyskujemy dostępu do Twojej skrzynki, kontaktów ani innych danych. Zakres jest ograniczony do: identyfikatora, adresu e-mail i podstawowego profilu.</p>

  <h2>6. Okres przechowywania</h2>
  <p>Dane przechowujemy przez czas korzystania z konta oraz po jego usunięciu tylko w zakresie wymaganym prawem (np. dane księgowe darowizn) lub do czasu przedawnienia ewentualnych roszczeń. Logi bezpieczeństwa przechowujemy przez ograniczony czas.</p>

  <h2>7. Twoje prawa</h2>
  <p>Masz prawo do: dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia, wniesienia sprzeciwu oraz cofnięcia zgody. Przysługuje Ci także skarga do Prezesa Urzędu Ochrony Danych Osobowych (PUODO). Aby skorzystać z praw, napisz na ${c}.</p>

  <h2>8. Cookies i pamięć przeglądarki</h2>
  <p>Aplikacja używa plików cookie oraz pamięci przeglądarki (localStorage) niezbędnych do logowania, utrzymania sesji, bezpieczeństwa oraz działania offline (PWA). Nie używamy ich do śledzenia reklamowego.</p>

  <h2>9. Zmiany polityki</h2>
  <p>Politykę możemy aktualizować. Istotne zmiany zakomunikujemy w aplikacji lub e-mailem.</p>`;
}

function termsBody(org, contact, today) {
  const o = esc(org);
  const c = esc(contact);
  return `
  <h1>Regulamin</h1>
  <p class="updated">Ostatnia aktualizacja: ${esc(today)}</p>

  <h2>1. Postanowienia ogólne</h2>
  <p>Regulamin określa zasady korzystania z aplikacji do zarządzania wspólnotą udostępnianej przez ${o} na platformie <strong>Avenit</strong>. Korzystając z aplikacji, akceptujesz niniejszy regulamin.</p>

  <h2>2. Konto i bezpieczeństwo</h2>
  <ul>
    <li>konto jest imienne; nie udostępniaj danych logowania osobom trzecim;</li>
    <li>odpowiadasz za poufność hasła; zalecamy włączenie weryfikacji dwuetapowej (2FA);</li>
    <li>o nieautoryzowanym dostępie niezwłocznie poinformuj administratora.</li>
  </ul>

  <h2>3. Dozwolone korzystanie</h2>
  <ul>
    <li>korzystasz z aplikacji zgodnie z prawem i jej przeznaczeniem;</li>
    <li>nie podejmujesz działań zagrażających bezpieczeństwu lub stabilności usługi;</li>
    <li>nie wykorzystujesz danych innych osób w celach niezgodnych z ich przeznaczeniem.</li>
  </ul>

  <h2>4. Treści użytkownika</h2>
  <p>Odpowiadasz za treści, które wprowadzasz do aplikacji. Administrator może moderować lub usuwać treści naruszające prawo lub regulamin.</p>

  <h2>5. Dostępność i odpowiedzialność</h2>
  <p>Dokładamy starań, aby usługa działała nieprzerwanie, jednak nie gwarantujemy braku przerw (konserwacja, przyczyny techniczne). W granicach dozwolonych prawem wyłączona jest odpowiedzialność za szkody wynikłe z przerw lub nieprawidłowego korzystania.</p>

  <h2>6. Zmiany regulaminu</h2>
  <p>Regulamin może być aktualizowany; istotne zmiany zostaną zakomunikowane w aplikacji.</p>

  <h2>7. Kontakt</h2>
  <p>W sprawach dotyczących regulaminu: ${c}.</p>`;
}

export default async function legalHtmlRoutes(app) {
  async function render(req, reply, kind) {
    let org = 'wspólnota korzystająca z aplikacji';
    let contact = 'kontakt@avenit.pl';
    let custom = null;
    // Best-effort branding, tylko gdy żądanie przyszło z subdomeny tenanta.
    if (req.db) {
      try {
        const { rows } = await req.db.query(
          `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
          [['org_name', 'legal_contact_email', 'legal_privacy', 'legal_terms']]
        );
        const m = {};
        rows.forEach((r) => { m[r.key] = r.value; });
        if (m.org_name) org = m.org_name;
        if (m.legal_contact_email) contact = m.legal_contact_email;
        custom = kind === 'privacy' ? (m.legal_privacy || null) : (m.legal_terms || null);
      } catch { /* strona publiczna — brak danych nie blokuje */ }
    }
    const today = new Date().toISOString().slice(0, 10);
    const title = kind === 'privacy' ? 'Polityka prywatności' : 'Regulamin';
    const inner = custom
      ? custom
      : (kind === 'privacy' ? privacyBody(org, contact, today) : termsBody(org, contact, today));
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=3600');
    reply.header('X-Robots-Tag', 'index, follow');
    return reply.send(shell(title, inner));
  }

  app.get('/polityka-prywatnosci', (req, reply) => render(req, reply, 'privacy'));
  app.get('/regulamin', (req, reply) => render(req, reply, 'terms'));
}
