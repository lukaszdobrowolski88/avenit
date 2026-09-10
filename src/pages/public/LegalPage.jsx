import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Publiczne strony prawne (bez logowania): polityka prywatności / regulamin.
// Treść domyślna (RODO, kontekst wspólnoty) — organizacja może ją nadpisać własną
// w Ustawienia → Użytkownicy → „Strony prawne" (app_settings: legal_privacy / legal_terms).
export default function LegalPage({ kind = 'privacy' }) {
  const [logo, setLogo] = useState(() => localStorage.getItem('app_logo_cache') || null);
  const [custom, setCustom] = useState(null); // nadpisana treść (HTML) lub null
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('key, value')
          .in('key', ['org_logo_url', 'org_name', 'legal_privacy', 'legal_terms', 'legal_contact_email']);
        const m = {}; (data || []).forEach((s) => { m[s.key] = s.value; });
        if (m.org_logo_url) setLogo(m.org_logo_url);
        if (m.org_name) setOrgName(m.org_name);
        const c = kind === 'privacy' ? m.legal_privacy : m.legal_terms;
        setCustom(c || null);
        if (m.legal_contact_email) setContact(m.legal_contact_email);
      } catch { /* strona publiczna — brak danych nie blokuje */ }
    })();
  }, [kind]);

  const [contact, setContact] = useState('kontakt@' + (typeof window !== 'undefined' ? window.location.hostname.split('.').slice(-2).join('.') : 'avenit.pl'));
  const org = orgName || 'wspólnota korzystająca z aplikacji';
  const today = new Date().toLocaleDateString('pl-PL');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {logo && <img src={logo} alt="Logo" className="h-16 object-contain mb-6" />}
        {custom ? (
          <article className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: custom }} />
        ) : kind === 'privacy' ? (
          <PrivacyDefault org={org} contact={contact} today={today} />
        ) : (
          <TermsDefault org={org} contact={contact} today={today} />
        )}
        <p className="mt-10 text-sm">
          <a href="/polityka-prywatnosci" className="text-accent-primary hover:underline">Polityka prywatności</a>
          <span className="mx-2 text-gray-400">·</span>
          <a href="/regulamin" className="text-accent-primary hover:underline">Regulamin</a>
          <span className="mx-2 text-gray-400">·</span>
          <a href="/" className="text-accent-primary hover:underline">Powrót do logowania</a>
        </p>
      </div>
    </div>
  );
}

const H = ({ children }) => <h2 className="text-xl font-bold mt-6 mb-2 text-gray-900 dark:text-white">{children}</h2>;
const P = ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>;
const LI = ({ children }) => <li className="mb-1">{children}</li>;

function PrivacyDefault({ org, contact, today }) {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Polityka prywatności</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Ostatnia aktualizacja: {today}</p>

      <H>1. Administrator danych</H>
      <P>Administratorem Twoich danych osobowych jest {org} („Administrator"), która korzysta z aplikacji do zarządzania życiem wspólnoty. Oprogramowanie dostarcza platforma <strong>Avenit</strong> jako podmiot przetwarzający dane na zlecenie Administratora.</P>
      <P>Kontakt w sprawach danych: <strong>{contact}</strong>.</P>

      <H>2. Jakie dane przetwarzamy</H>
      <ul className="list-disc pl-6 mb-3">
        <LI>dane konta: imię i nazwisko, adres e-mail, hasło (w postaci zaszyfrowanej), rola;</LI>
        <LI>dane kontaktowe i profilowe: telefon, zdjęcie profilowe (jeśli podane);</LI>
        <LI>przynależność do służb, grup i wydarzeń oraz obecność;</LI>
        <LI>dane związane z darowiznami (jeśli korzystasz z modułu wsparcia finansowego);</LI>
        <LI>dane logowania zewnętrznego (Google/Microsoft): adres e-mail, imię, zdjęcie — pobierane tylko po Twojej zgodzie na ekranie dostawcy;</LI>
        <LI>dane techniczne: logi, adres IP, informacje o urządzeniu/sesji, pliki cookie/localStorage niezbędne do działania i bezpieczeństwa.</LI>
      </ul>

      <H>3. Cele i podstawy prawne</H>
      <ul className="list-disc pl-6 mb-3">
        <LI>świadczenie usługi i zarządzanie wspólnotą — niezbędność do realizacji usługi (art. 6 ust. 1 lit. b/f RODO);</LI>
        <LI>komunikacja (e-mail, powiadomienia) — prawnie uzasadniony interes lub zgoda;</LI>
        <LI>bezpieczeństwo konta (2FA, wykrywanie nadużyć) — prawnie uzasadniony interes;</LI>
        <LI>ewidencja darowizn i obowiązki księgowe — obowiązek prawny;</LI>
        <LI>cele oparte na zgodzie — w zakresie, w jakim jej udzielono (zgodę można cofnąć w każdej chwili).</LI>
      </ul>

      <H>4. Odbiorcy danych</H>
      <P>Dane mogą być powierzane zaufanym podmiotom przetwarzającym wyłącznie w celu świadczenia usługi: dostawcy hostingu, usłudze wysyłki e-mail, usłudze SMS oraz operatorowi płatności (jeśli używany jest moduł darowizn). Podmioty te działają na podstawie umów powierzenia i nie wykorzystują danych do własnych celów.</P>

      <H>5. Logowanie przez Google / Microsoft</H>
      <P>Jeśli logujesz się kontem Google lub Microsoft, otrzymujemy od dostawcy Twój adres e-mail, imię oraz zdjęcie profilowe, aby utworzyć lub dopasować konto w aplikacji. Nie uzyskujemy dostępu do Twojej skrzynki, kontaktów ani innych danych. Zakres jest ograniczony do: identyfikatora, adresu e-mail i podstawowego profilu.</P>

      <H>6. Okres przechowywania</H>
      <P>Dane przechowujemy przez czas korzystania z konta oraz po jego usunięciu tylko w zakresie wymaganym prawem (np. dane księgowe darowizn) lub do czasu przedawnienia ewentualnych roszczeń. Logi bezpieczeństwa przechowujemy przez ograniczony czas.</P>

      <H>7. Twoje prawa</H>
      <P>Masz prawo do: dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia, wniesienia sprzeciwu oraz cofnięcia zgody. Przysługuje Ci także skarga do Prezesa Urzędu Ochrony Danych Osobowych (PUODO). Aby skorzystać z praw, napisz na {contact}.</P>

      <H>8. Cookies i pamięć przeglądarki</H>
      <P>Aplikacja używa plików cookie oraz pamięci przeglądarki (localStorage) niezbędnych do logowania, utrzymania sesji, bezpieczeństwa oraz działania offline (PWA). Nie używamy ich do śledzenia reklamowego.</P>

      <H>9. Zmiany polityki</H>
      <P>Politykę możemy aktualizować. Istotne zmiany zakomunikujemy w aplikacji lub e-mailem.</P>
    </div>
  );
}

function TermsDefault({ org, contact, today }) {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Regulamin</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Ostatnia aktualizacja: {today}</p>

      <H>1. Postanowienia ogólne</H>
      <P>Regulamin określa zasady korzystania z aplikacji do zarządzania wspólnotą udostępnianej przez {org} na platformie <strong>Avenit</strong>. Korzystając z aplikacji, akceptujesz niniejszy regulamin.</P>

      <H>2. Konto i bezpieczeństwo</H>
      <ul className="list-disc pl-6 mb-3">
        <LI>konto jest imienne; nie udostępniaj danych logowania osobom trzecim;</LI>
        <LI>odpowiadasz za poufność hasła; zalecamy włączenie weryfikacji dwuetapowej (2FA);</LI>
        <LI>o nieautoryzowanym dostępie niezwłocznie poinformuj administratora.</LI>
      </ul>

      <H>3. Dozwolone korzystanie</H>
      <ul className="list-disc pl-6 mb-3">
        <LI>korzystasz z aplikacji zgodnie z prawem i jej przeznaczeniem;</LI>
        <LI>nie podejmujesz działań zagrażających bezpieczeństwu lub stabilności usługi;</LI>
        <LI>nie wykorzystujesz danych innych osób w celach niezgodnych z ich przeznaczeniem.</LI>
      </ul>

      <H>4. Treści użytkownika</H>
      <P>Odpowiadasz za treści, które wprowadzasz do aplikacji. Administrator może moderować lub usuwać treści naruszające prawo lub regulamin.</P>

      <H>5. Dostępność i odpowiedzialność</H>
      <P>Dokładamy starań, aby usługa działała nieprzerwanie, jednak nie gwarantujemy braku przerw (konserwacja, przyczyny techniczne). W granicach dozwolonych prawem wyłączona jest odpowiedzialność za szkody wynikłe z przerw lub nieprawidłowego korzystania.</P>

      <H>6. Zmiany regulaminu</H>
      <P>Regulamin może być aktualizowany; istotne zmiany zostaną zakomunikowane w aplikacji.</P>

      <H>7. Kontakt</H>
      <P>W sprawach dotyczących regulaminu: {contact}.</P>
    </div>
  );
}
