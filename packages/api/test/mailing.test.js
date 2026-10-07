// Mailing: personalizacja per odbiorca (z ucieczką HTML), podpisany link wypisu,
// stopka wypisu, status kampanii i wysyłka paczki (stempel „wysłano” dopiero po wysłaniu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fillVariables, recipientVariables, buildCampaignMessage, ensureUnsubscribeFooter,
  unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl, finalCampaignStatus, sendCampaignBatch,
} from '../src/fn/send-mailing-campaign.js';
import { renderPage } from '../src/fn/mailing-unsubscribe.js';

const ctx = { baseUrl: 'https://schwro.avenit.pl', tenantSlug: 'schwro', churchName: 'Kościół <Schwro>', date: '6 października 2026' };

test('polskie zmienne są podstawiane i escapowane', () => {
  const vars = recipientVariables({ email: 'jan@x.pl', name: 'Jan <b>Nowak</b> Kowalski' }, { churchName: 'Kościół & Wspólnota', date: '1 maja 2026' });
  const out = fillVariables('Drogi {{imie}} {{ nazwisko }}, {{kosciol}} · {{data}} · {{email}} · {{nieznana}}', vars);
  assert.equal(out, 'Drogi Jan &lt;b&gt;Nowak&lt;/b&gt; Kowalski, Kościół &amp; Wspólnota · 1 maja 2026 · jan@x.pl · {{nieznana}}');
});

test('starsze aliasy {{first_name}} i {{last_name}} też działają', () => {
  const vars = recipientVariables({ email: 'a@b.pl', name: 'Anna Maria Wiśniewska' });
  assert.equal(fillVariables('{{first_name}}|{{last_name}}', vars), 'Anna|Maria Wiśniewska');
});

test('e-mail zamiast nazwiska nie trafia do {{imie}}', () => {
  const vars = recipientVariables({ email: 'a@b.pl', name: 'a@b.pl' });
  assert.equal(vars.imie, '');
});

test('temat: zmienne bez encji HTML i bez nowych linii', () => {
  const msg = buildCampaignMessage({ subject: 'Newsletter {{kosciol}}\n{{data}}', html: '<p>Hej</p>' }, { email: 'jan@x.pl', name: 'Jan' }, ctx);
  assert.equal(msg.subject, 'Newsletter Kościół <Schwro> 6 października 2026');
});

test('token wypisu: poprawny przechodzi, podrobiony i z innego tenanta nie', () => {
  const t = unsubscribeToken('schwro', 'Jan@X.pl');
  assert.equal(verifyUnsubscribeToken('schwro', t), 'jan@x.pl');
  assert.equal(verifyUnsubscribeToken('inny', t), null);
  const [payload, sig] = t.split('.');
  const forged = `${Buffer.from('ktos@x.pl').toString('base64url')}.${sig}`;
  assert.equal(verifyUnsubscribeToken('schwro', forged), null);
  assert.equal(verifyUnsubscribeToken('schwro', `${payload}.${'0'.repeat(32)}`), null);
  assert.equal(verifyUnsubscribeToken('schwro', ''), null);
});

test('link wypisu trafia do publicznej funkcji i jest escapowany w href', () => {
  const url = unsubscribeUrl(ctx.baseUrl, 'schwro', 'jan@x.pl', '11111111-2222-3333-4444-555555555555');
  assert.match(url, /^https:\/\/schwro\.avenit\.pl\/api\/fn\/mailing-unsubscribe\?t=[^&]+&c=11111111-2222-3333-4444-555555555555$/);
  const msg = buildCampaignMessage({ subject: 'X', html: '<a href="{{unsubscribe_url}}">Wypisz</a>' }, { email: 'jan@x.pl' }, { ...ctx, campaignId: '11111111-2222-3333-4444-555555555555' });
  assert.ok(msg.html.includes('href="https://schwro.avenit.pl/api/fn/mailing-unsubscribe?t='));
  assert.ok(msg.html.includes('&amp;c=11111111'));
  assert.ok(!msg.html.includes('Otrzymujesz tę wiadomość'), 'bez dodatkowej stopki, gdy treść ma własny link');
});

test('gdy treść nie ma linku wypisu, dokładamy stopkę przed </body>', () => {
  const html = ensureUnsubscribeFooter('<html><body><p>Treść</p></body></html>', 'https://x/u?a=1&b=2');
  assert.match(html, /Wypisz się z tych wiadomości<\/a><\/div><\/body>/);
  assert.ok(html.includes('https://x/u?a=1&amp;b=2'));
});

test('mail testowy prowadzi do strony podglądu, nie do prawdziwego wypisu', () => {
  const msg = buildCampaignMessage({ subject: 'X', html: '<p>{{unsubscribe_url}}</p>' }, { email: 'admin@x.pl' }, { ...ctx, preview: true });
  assert.ok(msg.html.includes('mailing-unsubscribe?preview=1'));
  assert.ok(!msg.html.includes('t='));
});

test('status kampanii po przeliczeniu', () => {
  assert.equal(finalCampaignStatus({ total: 5, pending: 2, inFlight: 0, sent: 3, failed: 0 }), 'sending');
  assert.equal(finalCampaignStatus({ total: 5, pending: 0, inFlight: 1, sent: 4, failed: 0 }), 'sending');
  assert.equal(finalCampaignStatus({ total: 5, pending: 0, inFlight: 0, sent: 4, failed: 1 }), 'sent');
  assert.equal(finalCampaignStatus({ total: 2, pending: 0, inFlight: 0, sent: 0, failed: 2 }), 'failed');
  assert.equal(finalCampaignStatus({ total: 2, pending: 0, inFlight: 0, sent: 0, failed: 0 }), 'sent'); // wszyscy wypisani
  assert.equal(finalCampaignStatus({ total: 0, pending: 0, inFlight: 0, sent: 0, failed: 0 }), 'failed');
});

// Minimalna atrapa bazy: rozpoznaje zapytania wysyłki po fragmentach SQL.
function fakeDb(recipients, unsubscribed = []) {
  const rows = recipients.map((r, i) => ({ id: `r${i}`, status: 'pending', ...r }));
  return {
    rows,
    async query(sql, params) {
      if (sql.includes("SET status = 'unsubscribed'")) {
        for (const r of rows) if (r.status === 'pending' && unsubscribed.includes(r.email.toLowerCase())) r.status = 'unsubscribed';
        return { rows: [] };
      }
      if (sql.includes("SET status = 'sending'")) {
        const claimed = rows.filter((r) => r.status === 'pending').slice(0, params[1]);
        claimed.forEach((r) => { r.status = 'sending'; });
        return { rows: claimed.map(({ id, email, name }) => ({ id, email, name })) };
      }
      if (sql.includes("SET status = 'sent'")) { rows.find((r) => r.id === params[0]).status = 'sent'; return { rows: [] }; }
      if (sql.includes("SET status = 'failed'")) { const r = rows.find((x) => x.id === params[0]); r.status = 'failed'; r.error = params[1]; return { rows: [] }; }
      if (sql.includes("SET status = 'pending'")) { for (const id of params[0]) rows.find((r) => r.id === id).status = 'pending'; return { rows: [] }; }
      throw new Error(`Nieobsłużone zapytanie: ${sql}`);
    },
  };
}

test('paczka: personalizacja per odbiorca, wypisani pominięci, błąd = failed, sukces = sent', async () => {
  const db = fakeDb([
    { email: 'jan@x.pl', name: 'Jan Nowak' },
    { email: 'Wypisana@x.pl', name: 'Ewa' },
    { email: 'zly@x.pl', name: 'Zły Adres' },
    { email: 'ola@x.pl', name: 'Ola' },
  ], ['wypisana@x.pl']);
  const sentMails = [];
  const send = async (m) => { if (m.to === 'zly@x.pl') throw new Error('Resend 422: invalid'); sentMails.push(m); };
  const res = await sendCampaignBatch(db, { id: 'c1', subject: 'Cześć {{imie}}', html_content: '<p>Witaj {{imie}} z {{kosciol}}</p>' }, { ...ctx, gapMs: 0, send }, 10);
  assert.deepEqual(res, { claimed: 3, sent: 2, failed: 1, deferred: 0 });
  assert.deepEqual(sentMails.map((m) => m.subject), ['Cześć Jan', 'Cześć Ola']);
  assert.ok(sentMails[0].html.includes('Witaj Jan z Kościół &lt;Schwro&gt;'));
  assert.ok(sentMails[0].html.includes('mailing-unsubscribe?t='));
  assert.equal(sentMails[0].fromName, 'Kościół <Schwro>');
  assert.deepEqual(db.rows.map((r) => r.status), ['sent', 'unsubscribed', 'failed', 'sent']);
});

test('paczka: limit dostawcy (429) oddaje resztę do kolejki zamiast oznaczać błąd', async () => {
  const db = fakeDb([{ email: 'a@x.pl' }, { email: 'b@x.pl' }, { email: 'c@x.pl' }]);
  let n = 0;
  const send = async () => { n++; if (n === 2) throw new Error('Resend 429: rate limit'); };
  const res = await sendCampaignBatch(db, { id: 'c1', subject: 'S', html_content: '<p>x</p>' }, { ...ctx, gapMs: 0, send }, 10);
  assert.deepEqual(res, { claimed: 3, sent: 1, failed: 0, deferred: 2 });
  assert.deepEqual(db.rows.map((r) => r.status), ['sent', 'pending', 'pending']);
});

test('strona wypisu escapuje treść i ma tytuł', () => {
  const html = renderPage({ title: 'Wypisano <x>', message: '<p>ok</p>', church: 'Kościół <b>' });
  assert.ok(html.includes('<title>Wypisano &lt;x&gt;</title>'));
  assert.ok(html.includes('Kościół &lt;b&gt;'));
  assert.ok(html.includes('lang="pl"'));
});
