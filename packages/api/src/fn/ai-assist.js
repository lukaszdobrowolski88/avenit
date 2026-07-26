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
