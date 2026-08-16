// Funkcja backendowa modułu AI — asystent oparty na Claude (Anthropic).
// Wejście (JSON): { task, input, context }
// Wyjście (JSON): { result }
//
// Zadania (task):
//   sermon_newsletter  — treść newslettera z tekstu/notatek kazania
//   sermon_social      — 3 krótkie posty do mediów społecznościowych
//   sermon_discussion  — konspekt do grupy domowej (pytania)
//   sermon_kids        — zarys lekcji dla dzieci
//   draft_message      — szkic komunikatu (email/sms) z promptu
//   ask_data           — odpowiedź na pytanie w języku naturalnym (na podstawie context)
//
// Wywołuje Anthropic Messages API (POST https://api.anthropic.com/v1/messages).
// Nagłówki: x-api-key = process.env.ANTHROPIC_API_KEY, anthropic-version: 2023-06-01.
// Model: claude-sonnet-5 (najnowszy Sonnet). Node 20 => globalny fetch.

export const name = 'ai-assist';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8000;

// Zamień kontekst (obiekt/tablica/string) na czytelny tekst do promptu.
function contextToText(context) {
  if (context == null) return '';
  if (typeof context === 'string') return context;
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

// Definicje promptów per zadanie (po polsku). buildUser(input, contextText) => treść tury użytkownika.
const PROMPTS = {
  sermon_newsletter: {
    system:
      'Jesteś asystentem redakcyjnym kościoła. Na podstawie notatek lub pełnego tekstu kazania ' +
      'piszesz gotową treść newslettera e-mail do wspólnoty. Struktura: chwytliwy tytuł, ciepłe ' +
      'wprowadzenie (2-3 zdania), 3-5 kluczowych myśli z kazania, jeden werset/cytat do zapamiętania, ' +
      'wezwanie do działania oraz krótkie zaproszenie na kolejne spotkanie. Ton pastoralny, ciepły i ' +
      'zachęcający. Pisz po polsku. Zwróć gotowy tekst do skopiowania (bez komentarzy od siebie).',
    buildUser: (input) => `Tekst / notatki kazania:\n\n${input}`,
  },
  sermon_social: {
    system:
      'Tworzysz 3 krótkie, angażujące posty do mediów społecznościowych na podstawie kazania. ' +
      'Każdy post ma 1-3 zdania, używa emoji z umiarem i kończy się 2-4 trafnymi hashtagami. ' +
      'Zróżnicuj posty (myśl przewodnia, zachęta/werset, zaproszenie). Ponumeruj je 1-3. ' +
      'Pisz po polsku. Zwróć wyłącznie gotowe posty.',
    buildUser: (input) => `Tekst / notatki kazania:\n\n${input}`,
  },
  sermon_discussion: {
    system:
      'Przygotowujesz konspekt spotkania grupy domowej na podstawie kazania. Struktura: krótkie ' +
      'streszczenie (2-3 zdania), pytanie na rozgrzewkę (lodołamacz), 5-7 pytań do dyskusji ' +
      '(od obserwacji tekstu, przez pogłębiające, po aplikacyjne), werset do wspólnego rozważenia ' +
      'oraz propozycja tematu modlitwy na zakończenie. Pisz po polsku. Zwróć gotowy konspekt.',
    buildUser: (input) => `Tekst / notatki kazania:\n\n${input}`,
  },
  sermon_kids: {
    system:
      'Tworzysz zarys lekcji dla dzieci (wiek 5-11) na podstawie kazania. Struktura: temat wyrażony ' +
      'prostymi słowami, krótka historia biblijna do opowiedzenia, werset do zapamiętania (prosty), ' +
      'jedna aktywność lub zabawa ilustrująca temat, 3-4 pytania dla dzieci oraz krótka modlitwa. ' +
      'Ton radosny, ciepły i przystępny dla dziecka. Pisz po polsku. Zwróć gotowy zarys lekcji.',
    buildUser: (input) => `Tekst / notatki kazania:\n\n${input}`,
  },
  draft_message: {
    system:
      'Jesteś asystentem komunikacji kościoła. Na podstawie polecenia użytkownika piszesz gotowy ' +
      'szkic komunikatu do wspólnoty (e-mail lub krótki SMS — dobierz format do treści polecenia). ' +
      'Dla SMS pisz maksymalnie zwięźle. Dobierz odpowiedni ton (ogłoszenie, zaproszenie, ' +
      'podziękowanie itd.). Pisz po polsku. Zwróć gotowy tekst komunikatu.',
    buildUser: (input, contextText) =>
      contextText
        ? `Polecenie:\n${input}\n\nDodatkowy kontekst:\n${contextText}`
        : `Polecenie:\n${input}`,
  },
  ask_data: {
    system:
      'Odpowiadasz na pytania dotyczące życia i danych kościoła w naturalnym języku. Opieraj się ' +
      'wyłącznie na dostarczonym kontekście (dane). Jeśli w kontekście brakuje potrzebnych ' +
      'informacji, powiedz to wprost i zaproponuj, jakich danych potrzeba, aby odpowiedzieć. ' +
      'Nie zmyślaj liczb ani faktów. Pisz po polsku, zwięźle i konkretnie.',
    buildUser: (input, contextText) =>
      `Kontekst (dane):\n${contextText || '(brak przekazanych danych)'}\n\nPytanie:\n${input}`,
  },
  builder_layout: {
    system:
      'Jesteś generatorem układów stron dla graficznego kreatora modułów aplikacji kościelnej Avenit. ' +
      'Na podstawie opisu użytkownika zwracasz WYŁĄCZNIE poprawny JSON — tablicę elementów (bez markdown, ' +
      'bez komentarzy, bez potrójnych backticków). Każdy element ma kształt: ' +
      '{"type":"...","props":{...},"children":[...]} — pole children TYLKO dla kontenerów. ' +
      'Dozwolone typy i ich propsy:\n' +
      '- section {} +children; columns {columns:1-6} +children; grid {columns} +children; card {title} +children; ' +
      'divider {}; spacer {size:"sm|md|lg"}; tabs {labels:[...]} +children; accordion {labels:[...]} +children\n' +
      '- heading {text, level:1-6, align:"left|center|right"}; text {html}; image {src, alt}; ' +
      'button {label, href, variant:"primary|secondary|outline"}; list {items:[...], style:"disc|decimal|none"}; ' +
      'quote {text, author}; alert {text, variant:"info|success|warning|error"}; icon {name, size}; ' +
      'video {url}; map {query}; embed {url, height}; countdown {target:"YYYY-MM-DDTHH:MM", label}; ' +
      'gallery {images:[...], columns}; verse {text, reference}; giving {label, url, note}; songlist {title, songs:[...]}\n' +
      'Buduj estetyczny, sensowny układ (nagłówek, sekcje, ewentualnie kolumny). Cała treść po polsku. ' +
      'NIE używaj innych typów. Zwróć TYLKO tablicę JSON.',
    buildUser: (input) => `Opis strony do zbudowania:\n${input}`,
  },
  builder_module: {
    system:
      'Jesteś generatorem modułów aplikacji kościelnej Avenit. Na podstawie opisu użytkownika zwracasz ' +
      'WYŁĄCZNIE poprawny JSON (bez markdown, bez backticków, bez komentarzy) o kształcie: ' +
      '{"name": string, "icon": string, "tabs": [{"label": string, "type": string}]}. ' +
      '"name" = krótka nazwa modułu po polsku. "icon" = nazwa ikony z lucide-react pasująca do tematu ' +
      '(np. "Users","Calendar","Camera","Music","Heart","BookOpen","Wrench","Baby","HandHeart","Mic2","Palette","Coffee"). ' +
      'Dozwolone typy zakładek ("type", używaj TYLKO tych): members, events, tasks, board, finance, wall, schedule, duty, ' +
      'materials, equipment, gallery, links, contacts, faq, announcements, poll. ' +
      'Dobierz 3-6 zakładek trafnie pasujących do opisu, w sensownej kolejności (najważniejsze najpierw). ' +
      '"label" = krótka polska nazwa zakładki. NIE używaj innych typów ani pól. Zwróć TYLKO obiekt JSON.',
    buildUser: (input) => `Opis modułu do zbudowania:\n${input}`,
  },
  board_generate: {
    system:
      'Jesteś generatorem tablic projektowych (Work OS w stylu Monday) dla aplikacji kościelnej Avenit. ' +
      'Na podstawie opisu procesu/projektu zwracasz WYŁĄCZNIE poprawny JSON (bez markdown, bez backticków, bez komentarzy) ' +
      'o kształcie: {"name": string, "description": string, ' +
      '"columns": [{"name": string, "type": string, "labels"?: [{"title": string, "color": string}], "options"?: [{"title": string, "color": string}], "unit"?: string}], ' +
      '"groups": [{"name": string, "color": string}], ' +
      '"items": [{"name": string, "group": number, "cells": {"<nazwa kolumny>": <wartość>}}]}. ' +
      'Dozwolone typy kolumn: status, priority, text, long_text, number, date, timeline, people, dropdown, checkbox, link, rating, progress. ' +
      'Zawsze dodaj kolumnę "Status" (type:status) z 3-4 etykietami. Kolumny status/priority WYMAGAJĄ pola "labels"; dropdown WYMAGA "options". ' +
      'Kolory podawaj jako HEX z palety: #00c875 #fdab3d #e2445c #579bfc #a25ddc #0086c0 #ff5ac4 #9cd326 #784bd1 #c4c4c4. ' +
      'Wartości w "cells": dla status/priority = dokładny "title" etykiety; dropdown = tablica tytułów opcji; date = "YYYY-MM-DD"; checkbox = true/false; number/rating/progress = liczba; text = string; people = pomiń (zostaw puste). ' +
      '"group" to indeks grupy (0-based). Twórz 2-3 grupy, 3-6 kolumn, 3-8 przykładowych elementów. Cała treść po polsku. Zwróć TYLKO obiekt JSON.',
    buildUser: (input) => `Opis tablicy/procesu do zbudowania:\n${input}`,
  },
  board_automation: {
    system:
      'Jesteś generatorem automatyzacji tablic (styl "kiedy → to" z Monday). Na podstawie opisu w języku naturalnym ' +
      'oraz KONTEKSTU (kolumny tablicy z ich id, typami i etykietami) zwracasz WYŁĄCZNIE poprawny JSON (bez markdown/backticków) ' +
      'o kształcie: {"name": string, "trigger": {"type": string, "columnId"?: string, "value"?: string}, ' +
      '"actions": [{"type": string, "params": {}}]}. ' +
      'Typy wyzwalaczy: "status_changes_to" (wymaga columnId kolumny status/priority + value = id etykiety), ' +
      '"column_changes" (columnId), "person_assigned" (opcjonalny columnId kolumny people), "item_created", "date_arrives" (columnId kolumny date/timeline). ' +
      'Typy akcji: "notify" {targetType:"assignee"|"creator"}, "change_status" {columnId, value(id etykiety)}, ' +
      '"set_date" {columnId, offsetDays:number}, "assign_person" {columnId, email, name}, "create_update" {text}. ' +
      'UŻYWAJ WYŁĄCZNIE prawdziwych id kolumn i id etykiet z KONTEKSTU (nie wymyślaj id). Jeśli czegoś nie da się zmapować, pomiń. ' +
      'Nazwę (name) sformułuj krótko po polsku. Zwróć TYLKO obiekt JSON.',
    buildUser: (input, contextText) =>
      `KONTEKST (kolumny tablicy):\n${contextText || '(brak)'}\n\nOpis automatyzacji:\n${input}`,
  },
};

// Wyciągnij tekst z odpowiedzi Anthropic (łączy bloki type: 'text').
function extractText(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export default async function handler(req, reply) {
  try {
    const { task, input, context } = req.body || {};

    const spec = task && PROMPTS[task];
    if (!spec) {
      return reply.code(400).send({
        error: `Nieznane zadanie AI: "${task || ''}". Dostępne: ${Object.keys(PROMPTS).join(', ')}.`,
      });
    }

    const inputText = typeof input === 'string' ? input.trim() : '';
    if (!inputText) {
      return reply.code(400).send({ error: 'Brak treści wejściowej (input) dla zadania AI.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return reply.code(500).send({
        error:
          'Brak konfiguracji ANTHROPIC_API_KEY na serwerze. Ustaw zmienną środowiskową z kluczem API Claude, aby korzystać z asystenta AI.',
      });
    }

    const contextText = contextToText(context);
    const userContent = spec.buildUser(inputText, contextText);

    let res;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          // Zadania generacyjne (treść) — bez rozszerzonego myślenia dla niższej latencji.
          thinking: { type: 'disabled' },
          system: spec.system,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
    } catch (netErr) {
      req.log.error({ err: netErr }, 'ai-assist: błąd połączenia z Anthropic');
      return reply.code(502).send({ error: 'Nie udało się połączyć z API Claude. Spróbuj ponownie.' });
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg = data?.error?.message || `Błąd API Claude (HTTP ${res.status}).`;
      req.log.error({ status: res.status, body: data }, 'ai-assist: Anthropic zwrócił błąd');
      return reply.code(res.status).send({ error: msg });
    }

    if (data?.stop_reason === 'refusal') {
      return reply.code(200).send({
        error: 'Asystent nie może zrealizować tej prośby. Zmień treść zapytania i spróbuj ponownie.',
      });
    }

    const result = extractText(data);
    if (!result) {
      return reply.code(502).send({ error: 'Asystent AI nie zwrócił treści. Spróbuj ponownie.' });
    }

    // Zapis historii (best-effort — błąd zapisu nie przerywa odpowiedzi).
    try {
      await req.db.query(
        `INSERT INTO ai_conversations (user_email, task, input, result) VALUES ($1, $2, $3, $4)`,
        [req.user?.email || null, task, inputText, result]
      );
    } catch (logErr) {
      req.log.warn({ err: logErr }, 'ai-assist: nie udało się zapisać historii konwersacji');
    }

    return reply.send({ result });
  } catch (err) {
    req.log.error({ err }, 'ai-assist error');
    return reply.code(500).send({ error: err.message });
  }
}
