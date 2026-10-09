// Formularz avenit.pl: treść maili (escapowanie, plan z wiadomości, PL/EN), nagłówki
// (Reply-To, temat) i zachowanie trasy z fałszywą bazą i fałszywym mailerem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import { config } from '../src/config.js';
import landingRoutes from '../src/landing/routes.js';
import {
  leadConfirmationEmail, leadNotificationEmail, parsePlanInterest, parseChurchSize,
  suggestPlanForSize, detectLeadLang, sourceFromReferer, leadSpamSignals,
} from '../src/landing/emails.js';

const XSS = '<script>alert(1)</script>';
const lead = {
  id: '6f1c2d4e-0000-4000-8000-000000000001',
  name: 'Jan Kowalski',
  email: 'jan@zbor.pl',
  phone: '+48 600 100 200',
  church: 'Zbór Betel',
  message: 'Interesuje mnie plan Wspólnota (płatność roczna).\nMamy ok. 120 członków.',
  created_at: new Date('2026-10-09T08:05:00Z'),
};

// ── Parsowanie ────────────────────────────────────────────────────────────────
test('parsePlanInterest: teksty z przycisków cennika PL i EN', () => {
  assert.equal(parsePlanInterest('Interesuje mnie plan Start.').plan.key, 'start');
  assert.equal(parsePlanInterest('Interesuje mnie plan Start.').yearly, false);
  const y = parsePlanInterest('Interesuje mnie plan Kościół+ (płatność roczna).');
  assert.equal(y.plan.key, 'kosciol_plus');
  assert.equal(y.yearly, true);
  assert.equal(parsePlanInterest('Interesuje mnie plan Kościół.').plan.key, 'kosciol');
  assert.equal(parsePlanInterest('Interesuje mnie plan Sieć.').plan.key, 'siec');
  assert.equal(parsePlanInterest('I am interested in the Community.').plan.key, 'wspolnota');
  const en = parsePlanInterest('I am interested in the Church+ plan (annual billing).');
  assert.equal(en.plan.key, 'kosciol_plus');
  assert.equal(en.yearly, true);
  assert.equal(parsePlanInterest('I am interested in the Network.').plan.key, 'siec');
});

test('parsePlanInterest: zapis odręczny i brak fałszywych trafień', () => {
  assert.equal(parsePlanInterest('Myślimy o planie Wspólnota, rozliczenie rocznie').plan.key, 'wspolnota');
  assert.equal(parsePlanInterest('Myślimy o planie Wspólnota, rozliczenie rocznie').yearly, true);
  assert.equal(parsePlanInterest('pakiet kosciol plus wyglada dobrze').plan.key, 'kosciol_plus');
  assert.equal(parsePlanInterest('We like the Church plan').plan.key, 'kosciol');
  assert.equal(parsePlanInterest('Nasz kościół ma 80 osób, chcemy grafik służb.'), null);
  assert.equal(parsePlanInterest('Our church needs scheduling'), null);
  assert.equal(parsePlanInterest(''), null);
  assert.equal(parsePlanInterest(null), null);
});

test('parseChurchSize + suggestPlanForSize', () => {
  assert.deepEqual(parseChurchSize('Mamy ok. 120 członków'), { min: 120, max: 120, text: '120 członków' });
  assert.equal(parseChurchSize('80–100 osób w niedzielę').max, 100);
  assert.equal(parseChurchSize('about 1,200 people').max, 1200);
  assert.equal(parseChurchSize('rok 2024: 75 osób').max, 75);
  assert.equal(parseChurchSize('1 200 osób').max, 1200);
  assert.equal(parseChurchSize('300+ ludzi').max, 300);
  assert.equal(parseChurchSize('We have 45 adults').max, 45);
  assert.equal(parseChurchSize('chcemy grafik'), null);
  assert.equal(suggestPlanForSize(50).key, 'start');
  assert.equal(suggestPlanForSize(51).key, 'wspolnota');
  assert.equal(suggestPlanForSize(400).key, 'kosciol');
  assert.equal(suggestPlanForSize(1000).key, 'kosciol_plus');
  assert.equal(suggestPlanForSize(1001).key, 'siec');
});

test('detectLeadLang / sourceFromReferer', () => {
  assert.equal(detectLeadLang({ referer: 'https://avenit.pl/en/' }), 'en');
  assert.equal(detectLeadLang({ referer: 'https://avenit.pl/en' }), 'en');
  assert.equal(detectLeadLang({ referer: 'https://avenit.pl/' }), 'pl');
  assert.equal(detectLeadLang({ referer: 'https://avenit.pl/entuzjasta/' }), 'pl');
  assert.equal(detectLeadLang({ referer: 'nie-url' }), 'pl');
  assert.equal(detectLeadLang({ lang: 'en', referer: 'https://avenit.pl/' }), 'en');
  assert.equal(detectLeadLang({ lang: 'uk', referer: 'https://avenit.pl/en/' }), 'en');
  assert.equal(detectLeadLang({}), 'pl');
  assert.equal(sourceFromReferer('https://avenit.pl/en/?utm_source=x#kontakt'), 'avenit.pl/en/');
  assert.equal(sourceFromReferer(''), null);
});

test('leadSpamSignals', () => {
  assert.deepEqual(leadSpamSignals({ lead, tokenAgeMs: 60_000, userAgent: 'Mozilla' }), []);
  const s = leadSpamSignals({
    lead: { name: 'Seo 12345', church: 'www.cheap.com', message: 'visit https://x.ru' },
    tokenAgeMs: 4000, userAgent: '',
  });
  assert.equal(s.length, 5);
  assert.ok(s.some((x) => x.includes('4 s')));
  assert.ok(leadSpamSignals({ lead: { name: 'A' } }).includes('Brak nazwy kościoła i wiadomości'));
});

// ── Potwierdzenie ─────────────────────────────────────────────────────────────
test('potwierdzenie PL: plan z ceną roczną, podsumowanie, cennik, tekst', () => {
  const m = leadConfirmationEmail(lead, { lang: 'pl', now: new Date('2026-10-09T10:00:00Z') });
  assert.match(m.subject, /Dziękujemy za zgłoszenie/);
  assert.match(m.html, /<html lang="pl"/);
  assert.match(m.html, /Dziękujemy, <span style="font-weight:300;">Jan<\/span>/);
  assert.match(m.html, /1–2 dni roboczych/);
  assert.match(m.html, /Wspólnota/);
  assert.match(m.html, /1 590 zł \/ rok/);
  assert.match(m.html, /do 150 dorosłych/);
  assert.match(m.html, /https:\/\/avenit\.pl\/#cennik/);
  assert.match(m.html, /Bez karty płatniczej/);
  assert.match(m.html, /polityka-prywatnosci/);
  assert.match(m.html, /© 2026 Avenit/);
  assert.match(m.html, /stopka\/avatar\.png/);
  assert.ok(!/[\u{1F300}-\u{1FAFF}✅]/u.test(m.html + m.subject), 'bez emoji');
  assert.ok(!/gradient/i.test(m.html));
  assert.match(m.text, /Wspólnota \(płatność roczna\)/);
  assert.match(m.text, /Mamy ok\. 120 członków/);
  assert.ok(!/<[a-z]/i.test(m.text), 'tekst bez HTML');
});

test('potwierdzenie EN: angielska treść, nazwy planów z /en/, link do /en/#cennik', () => {
  const m = leadConfirmationEmail({ ...lead, message: 'I am interested in the Church+ plan (annual billing).' }, { lang: 'en' });
  assert.match(m.subject, /Thanks for reaching out/);
  assert.match(m.html, /<html lang="en"/);
  assert.match(m.html, /Church\+/);
  assert.match(m.html, /4,990 zł \/ year/);
  assert.match(m.html, /up to 1000 adults/);
  assert.match(m.html, /https:\/\/avenit\.pl\/en\/#cennik/);
  assert.match(m.html, /1–2 business days/);
  assert.ok(!m.html.includes('Dziękujemy'));
});

test('potwierdzenie: bez planu pokazuje „od 79 zł”, Sieć bez ceny rocznej', () => {
  const none = leadConfirmationEmail({ ...lead, message: 'Chcemy grafik służb.' });
  assert.match(none.html, /79 zł brutto miesięcznie/);
  const siec = leadConfirmationEmail({ ...lead, message: 'Interesuje mnie plan Sieć (płatność roczna).' });
  assert.match(siec.html, /od 899 zł \/ mies\./);
  assert.match(siec.html, /Wycena indywidualna/);
  assert.ok(!siec.html.includes('płatność roczna</span>'));
});

test('potwierdzenie: dane użytkownika są escapowane', () => {
  const m = leadConfirmationEmail({
    ...lead, name: `${XSS} Nowak`, church: '"><img src=x onerror=alert(1)>', message: `${XSS}\nplan Start`, phone: '<b>1</b>',
  });
  assert.ok(!m.html.includes('<script>'));
  assert.ok(!m.html.includes('<img src=x'));
  assert.ok(!m.html.includes('<b>1</b>'));
  assert.ok(m.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(m.html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
});

// ── Powiadomienie ─────────────────────────────────────────────────────────────
test('powiadomienie: temat, akcje, plan + wielkość, metadane', () => {
  const m = leadNotificationEmail(lead, {
    lang: 'pl', source: 'avenit.pl/', createdAt: lead.created_at, previousLeads: 1,
    signals: [], adminUrl: 'https://admin.avenit.pl/leads',
  });
  assert.equal(m.subject, 'Nowe zgłoszenie: Zbór Betel · plan Wspólnota (rocznie)');
  assert.match(m.html, /href="mailto:jan@zbor\.pl\?subject=Twoje%20zg%C5%82oszenie%20w%20Avenit&amp;body=Dzie%C5%84%20dobry%20Jan/);
  assert.match(m.html, /href="tel:\+48600100200"/);
  assert.match(m.html, /href="https:\/\/admin\.avenit\.pl\/leads"/);
  assert.match(m.html, /120 członków/);
  assert.match(m.html, /pasuje <strong[^>]*>Wspólnota/);
  assert.ok(!m.html.includes('Inny niż wybrany plan'));
  assert.match(m.html, /9 października 2026.*10:05/); // 08:05 UTC = 10:05 w Warszawie (CEST)
  assert.match(m.html, /1 zgłoszenie z tego adresu/);
  assert.match(m.html, new RegExp(lead.id));
  assert.ok(!m.html.includes('Sygnały spamu'));
  assert.match(m.text, /Plan: Wspólnota \(rocznie\)/);
  assert.match(m.text, /Panel: https:\/\/admin\.avenit\.pl\/leads/);
});

test('powiadomienie: rozjazd planu z wielkością, EN, sygnały, brak telefonu', () => {
  const m = leadNotificationEmail(
    { ...lead, phone: '', church: '', message: 'I am interested in the Start. We have 300 people.' },
    { lang: 'en', signals: ['Formularz wypełniony w 4 s'] }
  );
  assert.equal(m.subject, 'Nowe zgłoszenie: Jan Kowalski · plan Start · EN');
  assert.match(m.html, /Inny niż wybrany plan \(Start\)/);
  assert.match(m.html, /pasuje <strong[^>]*>Kościół</);
  assert.match(m.html, /Sygnały spamu/);
  assert.match(m.html, /Bez nazwy kościoła/);
  assert.ok(!m.html.includes('href="tel:'));
  assert.match(m.html, /subject=Your%20Avenit%20enquiry/);
  assert.match(m.html, /angielski \(EN\)/);
});

test('powiadomienie: escapowanie, temat bez nowych linii, mailto bez wstrzyknięć', () => {
  const m = leadNotificationEmail({
    ...lead, church: `Zbór\r\nBcc: x@y.pl ${XSS}`, name: XSS, email: 'a"b?cc=evil@x.pl', message: XSS,
  }, {});
  assert.ok(!/[\r\n]/.test(m.subject));
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('&lt;script&gt;'));
  assert.ok(!m.html.includes('mailto:a"b'));
  assert.match(m.html, /mailto:a%22b%3Fcc=evil@x\.pl\?subject=/);
});

// ── Trasa ─────────────────────────────────────────────────────────────────────
const tokenFor = (ageMs) => {
  const ts = Date.now() - ageMs;
  return `${ts}.${crypto.createHmac('sha256', config.JWT_SECRET).update(`landing-form.${ts}`).digest('base64url')}`;
};

function fakePool({ dup = false, previous = 0 } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT id FROM landing_leads/.test(sql)) return { rows: dup ? [{ id: 'old' }] : [] };
      if (/INSERT INTO landing_leads/.test(sql)) {
        const [name, email, phone, church, message] = params;
        return { rows: [{ id: 'lead-1', name, email, phone, church, message, created_at: new Date('2026-10-09T08:05:00Z') }] };
      }
      if (/count\(\*\)/.test(sql)) return { rows: [{ n: previous }] };
      throw new Error(`nieoczekiwane SQL: ${sql}`);
    },
  };
}

async function buildApp({ pool = fakePool(), sendEmail } = {}) {
  const sent = [];
  const app = Fastify();
  await app.register(landingRoutes, {
    deps: {
      pool,
      attachLead: async () => {},
      sendEmail: sendEmail || (async (m) => { sent.push(m); return { ok: true }; }),
    },
  });
  return { app, sent, pool };
}

const body = (extra = {}) => ({
  name: 'Jan Kowalski', email: 'jan@zbor.pl', phone: '+48 600 100 200', church: 'Zbór Betel',
  message: 'Interesuje mnie plan Kościół.', website: '', token: tokenFor(30_000), ...extra,
});

test('trasa: zapis + dwa maile z właściwymi Reply-To i tematem (PL)', async () => {
  const { app, sent, pool } = await buildApp({ pool: fakePool({ previous: 2 }) });
  const res = await app.inject({
    method: 'POST', url: '/api/public/landing-contact', payload: body(),
    headers: { referer: 'https://avenit.pl/', 'user-agent': 'Mozilla/5.0' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.ok(pool.calls.some((c) => /INSERT INTO landing_leads/.test(c.sql)));
  assert.equal(sent.length, 2);
  const owner = sent.find((m) => m.to === config.LANDING_CONTACT_EMAIL);
  const confirm = sent.find((m) => m.to === 'jan@zbor.pl');
  assert.equal(owner.replyTo, 'jan@zbor.pl');
  assert.equal(owner.subject, 'Nowe zgłoszenie: Zbór Betel · plan Kościół');
  assert.match(owner.html, /avenit\.pl\//);
  assert.match(owner.html, /2 zgłoszenia z tego adresu/);
  assert.ok(owner.text);
  assert.equal(confirm.replyTo, config.LANDING_CONTACT_EMAIL);
  assert.match(confirm.subject, /Dziękujemy/);
  assert.ok(confirm.text);
  await app.close();
});

test('trasa: formularz z /en/ → potwierdzenie po angielsku, właściciel po polsku', async () => {
  const { app, sent } = await buildApp();
  await app.inject({
    method: 'POST', url: '/api/public/landing-contact',
    payload: body({ message: 'I am interested in the Community.' }),
    headers: { referer: 'https://avenit.pl/en/', 'user-agent': 'Mozilla/5.0' },
  });
  const confirm = sent.find((m) => m.to === 'jan@zbor.pl');
  const owner = sent.find((m) => m.to === config.LANDING_CONTACT_EMAIL);
  assert.match(confirm.subject, /Thanks for reaching out/);
  assert.match(confirm.html, /Community/);
  assert.equal(owner.subject, 'Nowe zgłoszenie: Zbór Betel · plan Wspólnota · EN');
  await app.close();
});

test('trasa: błąd wysyłki nie psuje zgłoszenia (zapis jest, odpowiedź 200)', async () => {
  const pool = fakePool();
  let attempts = 0;
  const { app } = await buildApp({ pool, sendEmail: async () => { attempts++; throw new Error('Resend 500'); } });
  const res = await app.inject({ method: 'POST', url: '/api/public/landing-contact', payload: body() });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(attempts, 2);
  assert.ok(pool.calls.some((c) => /INSERT INTO landing_leads/.test(c.sql)));
  await app.close();
});

test('trasa: antyspam bez zmian (honeypot, za szybko, zły token, linki, duplikat, walidacja)', async () => {
  const cases = [
    [body({ website: 'http://spam' }), 200],
    [body({ token: tokenFor(1000) }), 200],
    [body({ token: '123.zly' }), 400],
    [body({ message: 'http://a http://b http://c' }), 400],
    [body({ email: 'nie-email' }), 400],
    [body({ name: '' }), 400],
  ];
  for (const [payload, code] of cases) {
    const { app, sent, pool } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/public/landing-contact', payload });
    assert.equal(res.statusCode, code, JSON.stringify(payload));
    assert.equal(sent.length, 0);
    assert.ok(!pool.calls.some((c) => /INSERT/.test(c.sql)));
    await app.close();
  }
  const { app, sent, pool } = await buildApp({ pool: fakePool({ dup: true }) });
  const res = await app.inject({ method: 'POST', url: '/api/public/landing-contact', payload: body() });
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 0);
  assert.ok(!pool.calls.some((c) => /INSERT/.test(c.sql)));
  await app.close();
});

test('trasa: sygnał „szybkie wypełnienie” trafia do maila właściciela', async () => {
  const { app, sent } = await buildApp();
  await app.inject({
    method: 'POST', url: '/api/public/landing-contact',
    payload: body({ token: tokenFor(5000) }), headers: { 'user-agent': 'Mozilla/5.0' },
  });
  const owner = sent.find((m) => m.to === config.LANDING_CONTACT_EMAIL);
  assert.match(owner.html, /Sygnały spamu/);
  assert.match(owner.html, /Formularz wypełniony w 5 s/);
  await app.close();
});
