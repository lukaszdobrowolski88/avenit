// Szablony e-maili formularza zgłoszeniowego avenit.pl:
//  - leadConfirmationEmail — potwierdzenie dla osoby (PL albo EN, gdy formularz z /en/),
//  - leadNotificationEmail — powiadomienie dla właściciela (PL), ułożone pod szybką ocenę.
//
// Email-safe: układ tabelowy, style inline, jedna kolumna max 600 px, bez zewnętrznego CSS
// (Manrope przez @font-face z avenit.pl tam, gdzie klient to wspiera; dalej systemowe
// fonty). Marka: papier / biała karta / słód / kurkuma — bez gradientów, emoji i pasków-
// akcentów. Wszystko, co wpisał użytkownik, przechodzi przez esc().
import { config } from '../config.js';
import { PRICING_PLANS } from '@avenit/shared/src/billing/catalog.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const SITE = 'https://avenit.pl';
const CONTACT = { email: 'lukasz@avenit.pl', phone: '+48 607 693 996', tel: '+48607693996' };

// Barwy marki (jak skrót zadań i maile grafiku).
const C = {
  paper: '#F6F4EE', hero: '#FFF1C2', malt: '#2A2312', text: '#4A463E',
  muted: '#6B6557', mustard: '#8A6606', turmeric: '#FFBE0B', line: '#ECE8DE', white: '#FFFFFF',
};
const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ── Cennik (źródło prawdy: avenit.pl #cennik; ceny brutto w zł) ─────────────────
// Ceny i limity ze wspólnego katalogu planów (packages/shared/src/billing/catalog.js — ten sam
// co panel admina i rozliczenia); tu tylko nazwy EN i kształt potrzebny mailom (zł, nie grosze).
const EN_NAMES = { start: 'Start', wspolnota: 'Community', kosciol: 'Church', kosciol_plus: 'Church+', siec: 'Network' };
export const LANDING_PLANS = PRICING_PLANS.map((p) => ({
  key: p.key, pl: p.name, en: EN_NAMES[p.key] || p.name,
  limit: p.maxAdults > 0 ? p.maxAdults : null,
  monthly: Math.round(p.priceMonthly / 100), yearly: p.priceYearly != null ? Math.round(p.priceYearly / 100) : null,
  ...(p.isCustom ? { custom: true } : {}), ...(p.prioritySupport ? { priority: true } : {}),
}));
const planByKey = (key) => LANDING_PLANS.find((p) => p.key === key) || null;

// Nazwa planu (dowolny zapis, z polskimi znakami lub bez) → klucz.
function planKeyFromName(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
  if (/^(kosciol|church) ?(\+|plus)/.test(s)) return 'kosciol_plus';
  if (/^(kosciol|church)/.test(s)) return 'kosciol';
  if (/^(wspolnot|community)/.test(s)) return 'wspolnota';
  if (/^start/.test(s)) return 'start';
  if (/^(siec|network)/.test(s)) return 'siec';
  return null;
}

// Plan z wiadomości. Przyciski cennika wstawiają „Interesuje mnie plan X (płatność roczna).”
// (EN: „I am interested in the X plan (annual billing).”); łapiemy też zapis odręczny
// („plan Wspólnota”, „the Church+ plan”). Samo słowo „kościół” bez „plan” to nie wybór.
const PLAN_NAMES = 'Ko[sś]ci[oó][lł]\\s*(?:\\+|plus)|Ko[sś]ci[oó][lł]\\p{L}*|Wsp[oó][lł]not\\p{L}*|Start\\p{L}*|Sie[cć]\\p{L}*';
const PLAN_NAMES_EN = 'Church\\s*(?:\\+|plus)|Church|Community|Start|Network';
const PLAN_RES = [
  new RegExp(`interesuje\\s+mnie\\s+plan\\s+(${PLAN_NAMES})`, 'iu'),
  new RegExp(`interested\\s+in\\s+the\\s+(${PLAN_NAMES_EN})`, 'iu'),
  new RegExp(`(?:^|[^\\p{L}])(?:plan(?:em|u|ie)?|pakiet(?:em|u)?)\\s+[„"']?(${PLAN_NAMES})`, 'iu'),
  new RegExp(`(?:^|[^\\p{L}])(${PLAN_NAMES_EN})\\s+plan(?![\\p{L}])`, 'iu'),
];
const YEARLY_RE = /p[lł]atno\S*\s+roczn|roczn\S*\s+(?:p[lł]atno|rozlicz|abonament)|(?:^|[^\p{L}])rocznie|annual|yearly|annually/iu;

export function parsePlanInterest(message) {
  const text = String(message || '');
  for (const re of PLAN_RES) {
    const m = text.match(re);
    const key = m && planKeyFromName(m[1]);
    if (key) return { plan: planByKey(key), yearly: YEARLY_RE.test(text) };
  }
  return null;
}

// Wielkość wspólnoty, jeśli padła w wiadomości („ok. 120 osób”, „80–100 członków”, „300+ ludzi”).
const NUM = '(\\d{1,2}[ \\u00a0.,]\\d{3}(?!\\d)|\\d{1,5})';
const SIZE_RE = new RegExp(
  `(?<![\\d.,])${NUM}(?:\\s*[-–]\\s*${NUM})?\\s*\\+?\\s*(os[oó]b|osoby|cz[lł]onk\\p{L}*|doros[lł]\\p{L}*|ludzi|wiernych|uczestnik\\p{L}*|people|members|adults|attendees)`,
  'iu'
);
const toInt = (s) => Number(String(s).replace(/[\s.,]/g, ''));

export function parseChurchSize(message) {
  const m = String(message || '').match(SIZE_RE);
  if (!m) return null;
  const a = toInt(m[1]);
  const b = m[2] ? toInt(m[2]) : a;
  if (!a || a > 100000) return null;
  return { min: Math.min(a, b), max: Math.max(a, b), text: m[0].replace(/\s+/g, ' ').trim() };
}

export function suggestPlanForSize(n) {
  return LANDING_PLANS.find((p) => p.limit != null && n <= p.limit) || planByKey('siec');
}

// Język potwierdzenia: jawne pole formularza > adres strony (Referer /en/...) > PL.
export function detectLeadLang({ lang, referer } = {}) {
  const l = String(lang || '').toLowerCase().slice(0, 2);
  if (l === 'en' || l === 'pl') return l;
  try {
    if (referer && /^\/en(\/|$)/.test(new URL(referer).pathname)) return 'en';
  } catch { /* zły Referer — domyślnie PL */ }
  return 'pl';
}

// Strona źródłowa do metadanych („avenit.pl/en/”), bez query/fragmentu.
export function sourceFromReferer(referer) {
  try {
    const u = new URL(referer);
    return `${u.host}${u.pathname}`.slice(0, 160);
  } catch { return null; }
}

// Miękkie sygnały spamu do oceny przez właściciela (twarde filtry są w routes.js).
export function leadSpamSignals({ lead = {}, tokenAgeMs, userAgent } = {}) {
  const out = [];
  const msg = String(lead.message || '');
  const links = (msg.match(/https?:\/\/|www\./gi) || []).length;
  if (links) out.push(`Wiadomość zawiera link${links > 1 ? 'i' : ''} (${links})`);
  if (/https?:\/\/|www\.|\.(com|ru|xyz|top)\b/i.test(`${lead.name || ''} ${lead.church || ''}`)) {
    out.push('Adres WWW w imieniu lub nazwie kościoła');
  }
  if (typeof tokenAgeMs === 'number' && tokenAgeMs < 10_000) {
    out.push(`Formularz wypełniony w ${Math.max(1, Math.round(tokenAgeMs / 1000))} s`);
  }
  if (userAgent !== undefined && !String(userAgent || '').trim()) out.push('Brak User-Agent przeglądarki');
  if (/\d{3,}/.test(String(lead.name || ''))) out.push('Cyfry w imieniu i nazwisku');
  if (!lead.church && !msg.trim()) out.push('Brak nazwy kościoła i wiadomości');
  return out;
}

// ── Formatowanie ──────────────────────────────────────────────────────────────
const fmtNum = (n, lang) => {
  const s = String(n);
  if (n < 1000) return s;
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : ' ');
};
const zl = (n, lang) => `${fmtNum(n, lang)} zł`;

function planLines(plan, yearly, lang) {
  const en = lang === 'en';
  const size = plan.limit == null
    ? (en ? 'over 1000 adults, multiple locations' : 'powyżej 1000 dorosłych, wiele lokalizacji')
    : (en ? `up to ${plan.limit} adults` : `do ${plan.limit} dorosłych`); // jak na stronie: „1000”
  if (plan.custom) {
    return {
      size,
      price: en ? `from ${zl(plan.monthly, lang)} / month` : `od ${zl(plan.monthly, lang)} / mies.`,
      note: en ? 'Individual quote: campuses, multi-church rollout and priority support.'
        : 'Wycena indywidualna: kampusy, wdrożenie dla wielu zborów i priorytetowe wsparcie.',
    };
  }
  const monthly = en ? `${zl(plan.monthly, lang)} / month` : `${zl(plan.monthly, lang)} / mies.`;
  if (yearly) {
    return {
      size,
      price: en ? `${zl(plan.yearly, lang)} / year` : `${zl(plan.yearly, lang)} / rok`,
      note: en ? `Instead of 12 × ${zl(plan.monthly, lang)}: 2 months free and member data migration at no extra cost.`
        : `Zamiast 12 × ${zl(plan.monthly, lang)}: 2 miesiące gratis i przeniesienie danych członków bez dodatkowej opłaty.`,
    };
  }
  return {
    size,
    price: monthly,
    note: en ? `Or ${zl(plan.yearly, lang)} / year with annual billing (2 months free).`
      : `Albo ${zl(plan.yearly, lang)} / rok przy płatności rocznej (2 miesiące gratis).`,
  };
}

const oneLine = (s, max = 160) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const telHref = (phone) => String(phone || '').replace(/[^+\d]/g, '');
// Adres do mailto: bez znaków, które zmieniłyby znaczenie URL-a (?, &, # itd.).
const mailtoAddr = (email) => String(email || '').replace(/[^A-Za-z0-9.!$'*+\-/=^_`{|}~@]/g, encodeURIComponent);
const stripTags = (s) => String(s).replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function warsawTime(date, lang = 'pl') {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pl-PL', {
    timeZone: 'Europe/Warsaw', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

// ── Klocki HTML ───────────────────────────────────────────────────────────────
const T = (size, lh, weight, color, extra = '') =>
  `font-family:${FONT};font-size:${size}px;line-height:${lh}px;font-weight:${weight};color:${color};${extra}`;
const EYEBROW = T(11, 16, 700, C.mustard, 'letter-spacing:1.4px;text-transform:uppercase;');
const LINK = `color:${C.malt};text-decoration:underline;text-decoration-color:${C.turmeric};text-underline-offset:3px;`;

const eyebrow = (s, pad = '0 0 10px') => `<div style="${EYEBROW}padding:${pad};">${s}</div>`;
const para = (html, m = '0 0 16px', color = C.text) => `<p style="margin:${m};${T(15, 24, 400, color)}">${html}</p>`;

// Przycisk-pigułka. primary = kurkuma + słód; drugi = biały z cienkim obrysem.
function pill(href, label, { primary = true } = {}) {
  const style = primary
    ? `background:${C.turmeric};border:1px solid ${C.turmeric};`
    : `background:${C.white};border:1px solid #D9D3C4;`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" class="btn" style="display:inline-table;margin:0 8px 8px 0;border-collapse:separate;">
            <tr><td align="center" bgcolor="${primary ? C.turmeric : C.white}" style="${style}border-radius:999px;">
              <a href="${esc(href)}" target="_blank" style="display:block;padding:13px 24px;${T(15, 20, 800, C.malt)}text-decoration:none;border-radius:999px;white-space:nowrap;">${label}</a>
            </td></tr></table>`;
}

const dataRow = (label, valueHtml) => `
          <tr>
            <td class="lbl" width="132" style="padding:11px 16px 11px 0;border-top:1px solid ${C.line};vertical-align:top;${T(13, 20, 600, C.muted)}">${label}</td>
            <td style="padding:11px 0;border-top:1px solid ${C.line};vertical-align:top;${T(15, 20, 600, C.malt)}word-break:break-word;">${valueHtml}</td>
          </tr>`;
const dash = `<span style="color:#A39C8C;font-weight:400;">—</span>`;

const messageBox = (message) => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0;">
          <tr><td bgcolor="${C.paper}" style="background:${C.paper};border-radius:16px;padding:16px 18px;${T(15, 23, 400, C.malt)}white-space:pre-wrap;word-break:break-word;">${esc(message)}</td></tr>
        </table>`;

const FONT_FACES = [300, 400, 700, 800].map((w) =>
  `@font-face { font-family: 'Manrope'; font-style: normal; font-weight: ${w}; src: url('${SITE}/assets/fonts/manrope-${w}.woff2') format('woff2'); }`
).join('\n  ');

function shell({ lang = 'pl', title, preheader, body, footer }) {
  const home = `${SITE}${lang === 'en' ? '/en/' : '/'}`;
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${esc(title)}</title>
<style>
  ${FONT_FACES}
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  @media (max-width: 520px) {
    .outer { padding: 20px 10px 28px !important; }
    .card { padding: 28px 20px 24px !important; border-radius: 20px !important; }
    .h1 { font-size: 26px !important; line-height: 32px !important; }
    .btn { display: table !important; width: 100% !important; margin: 0 0 8px 0 !important; }
    .lbl { width: 96px !important; }
  }
</style>
<!--[if mso]><style>* { font-family: Arial, Helvetica, sans-serif !important; }</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;color:${C.paper};font-size:1px;line-height:1px;">${esc(preheader)}${'&#8204;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.paper}" style="background:${C.paper};">
  <tr><td align="center" class="outer" style="padding:32px 16px 40px;">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="padding:0 4px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:10px;vertical-align:middle;"><a href="${home}" target="_blank"><img src="${SITE}/stopka/avatar.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:50%;"></a></td>
          <td style="vertical-align:middle;${T(20, 24, 800, C.malt, 'letter-spacing:-0.3px;')}"><a href="${home}" target="_blank" style="color:${C.malt};text-decoration:none;">avenit<span style="color:${C.turmeric};">.</span></a></td>
        </tr></table>
      </td></tr>
      <tr><td class="card" bgcolor="${C.white}" style="background:${C.white};border-radius:24px;padding:40px 36px 36px;">
${body}
      </td></tr>
      <tr><td style="padding:24px 12px 0;text-align:center;${T(12, 19, 400, C.muted)}">
${footer}
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`;
}

// ── Potwierdzenie dla osoby ───────────────────────────────────────────────────
const B = (s) => `<strong style="color:${C.malt};">${s}</strong>`;
const COPY = {
  pl: {
    subject: 'Dziękujemy za zgłoszenie — odezwiemy się w 1–2 dni robocze',
    preheader: (n) => `${n ? `${n}, dziękujemy` : 'Dziękujemy'}! Odezwiemy się zwykle w ciągu 1–2 dni roboczych.`,
    eyebrow: 'Zgłoszenie przyjęte',
    hello: 'Dziękujemy',
    intro: (church) => `Twoje zgłoszenie dotarło do nas. Odezwiemy się zwykle w ciągu ${B('1–2 dni roboczych')} i umówimy prezentację Avenit dopasowaną do ${church ? `wspólnoty ${B(esc(church))}` : 'Waszej wspólnoty'}.`,
    planEyebrow: 'Plan, który Cię interesuje',
    yearlyTag: 'płatność roczna',
    planFoot: 'Ceny brutto (z VAT). Wszystkie moduły i bez limitu użytkowników. Liczymy tylko dorosłych w bazie członków, z 10% zapasu ponad limit.',
    noPlanEyebrow: 'Cennik',
    noPlan: `Plany od ${B('79 zł brutto miesięcznie')}. Cena zależy od liczby dorosłych w bazie członków, a wszystkie moduły są w każdym planie.`,
    nextEyebrow: 'Co dalej',
    steps: [
      ['Odezwiemy się', 'Pokażemy system na żywo i odpowiemy na pytania Twojej wspólnoty.'],
      ['Konfigurujemy Twój kościół', 'Zakładamy adres, pomagamy przenieść dane członków i włączamy potrzebne moduły.'],
      ['Startujecie z okresem próbnym', 'Bez karty płatniczej i bez zobowiązań. Liderzy dostają dostępy, a niedziela planuje się już w Avenit.'],
    ],
    recapEyebrow: 'Twoje zgłoszenie',
    f: { name: 'Imię i nazwisko', church: 'Kościół', email: 'E-mail', phone: 'Telefon', message: 'Wiadomość' },
    cta: 'Zobacz cennik',
    ctaHref: `${SITE}/#cennik`,
    cta2: 'Jak zacząć',
    cta2Href: `${SITE}/#start`,
    direct: 'Wolisz porozmawiać od razu? Odpowiedz na tę wiadomość albo zadzwoń.',
    sign: 'założyciel Avenit',
    footAbout: 'System zarządzania kościołem: nabożeństwa, służby, dzieci, komunikacja i finanse.',
    privacy: 'Polityka prywatności',
    why: 'Dostajesz tę wiadomość, bo ten adres podano w formularzu na avenit.pl. Dane ze zgłoszenia wykorzystamy wyłącznie do odpowiedzi. Jeśli to nie Ty, zignoruj tę wiadomość.',
    rights: (y) => `© ${y} Avenit. Wszelkie prawa zastrzeżone.`,
  },
  en: {
    subject: 'Thanks for reaching out — we’ll reply within 1–2 business days',
    preheader: (n) => `Thank you${n ? `, ${n}` : ''}! We usually reply within 1–2 business days.`,
    eyebrow: 'Message received',
    hello: 'Thank you',
    intro: (church) => `Your message has reached us. We usually reply within ${B('1–2 business days')} to set up an Avenit demo tailored to ${church ? B(esc(church)) : 'your church'}.`,
    planEyebrow: 'The plan you’re interested in',
    yearlyTag: 'annual billing',
    planFoot: 'Prices in Polish złoty, VAT included. Every module and unlimited users. Only adults in your member directory count, with a 10% buffer over the limit.',
    noPlanEyebrow: 'Pricing',
    noPlan: `Plans from ${B('79 zł a month, VAT included')}. The price depends on the number of adults in your member directory, and every module is in every plan.`,
    nextEyebrow: 'What happens next',
    steps: [
      ['We get in touch', 'We show you the system live and answer your church’s questions.'],
      ['We set up your church', 'We create your address, help move your member data and switch on the modules you need.'],
      ['You start with a trial', 'No credit card, no commitment. Leaders get access, and Sunday is already planned in Avenit.'],
    ],
    recapEyebrow: 'What you sent us',
    f: { name: 'Name', church: 'Church', email: 'Email', phone: 'Phone', message: 'Message' },
    cta: 'See pricing',
    ctaHref: `${SITE}/en/#cennik`,
    cta2: 'How to start',
    cta2Href: `${SITE}/en/#start`,
    direct: 'Prefer to talk right away? Just reply to this email or give us a call.',
    sign: 'founder of Avenit',
    footAbout: 'Church management software: services, teams, kids, communication and finance.',
    privacy: 'Privacy policy',
    why: 'You’re receiving this because this address was entered in the form on avenit.pl. We’ll only use it to reply to your message. If this wasn’t you, please ignore this email.',
    rights: (y) => `© ${y} Avenit. All rights reserved.`,
  },
};

function stepsHtml(steps) {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map(([h, d], i) => `
          <tr>
            <td width="40" style="padding:0 12px 14px 0;vertical-align:top;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="28" height="28" align="center" bgcolor="${C.hero}" style="background:${C.hero};border-radius:50%;${T(13, 28, 800, C.malt)}">${i + 1}</td></tr></table>
            </td>
            <td style="padding:2px 0 14px;vertical-align:top;">
              <div style="${T(15, 22, 700, C.malt)}">${h}</div>
              <div style="${T(14, 21, 400, C.text)}">${d}</div>
            </td>
          </tr>`).join('')}
        </table>`;
}

export function leadConfirmationEmail(lead = {}, { lang = 'pl', now = new Date() } = {}) {
  const L = lang === 'en' ? 'en' : 'pl';
  const t = COPY[L];
  const name = firstName(lead.name);
  const interest = parsePlanInterest(lead.message);
  const yearly = !!(interest && interest.yearly && !interest.plan.custom);
  const pl = interest ? planLines(interest.plan, yearly, L) : null;
  const year = new Date(now).getFullYear();
  const home = `${SITE}${L === 'en' ? '/en/' : '/'}`;

  const planBlock = interest ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;">
          <tr><td bgcolor="${C.hero}" style="background:${C.hero};border-radius:18px;padding:20px 22px;">
            ${eyebrow(t.planEyebrow, '0 0 6px')}
            <div style="${T(24, 30, 800, C.malt, 'letter-spacing:-0.3px;')}">${esc(interest.plan[L])}${yearly ? `<span style="${T(14, 30, 600, C.mustard)}"> &nbsp;·&nbsp; ${t.yearlyTag}</span>` : ''}</div>
            <div style="${T(15, 22, 600, C.malt)}padding-top:2px;">${esc(pl.size)} &nbsp;·&nbsp; ${esc(pl.price)}</div>
            <div style="${T(13, 20, 400, C.text)}padding-top:8px;">${esc(pl.note)}</div>
          </td></tr>
          <tr><td style="padding:10px 4px 0;${T(12, 18, 400, C.muted)}">${t.planFoot}</td></tr>
        </table>` : `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;">
          <tr><td bgcolor="${C.hero}" style="background:${C.hero};border-radius:18px;padding:18px 22px;">
            ${eyebrow(t.noPlanEyebrow, '0 0 6px')}
            <div style="${T(15, 23, 400, C.text)}">${t.noPlan}</div>
          </td></tr>
        </table>`;

  const recap = `
        ${eyebrow(t.recapEyebrow, '6px 0 6px')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${dataRow(t.f.name, esc(lead.name) || dash)}
          ${dataRow(t.f.church, lead.church ? esc(lead.church) : dash)}
          ${dataRow(t.f.email, esc(lead.email) || dash)}
          ${dataRow(t.f.phone, lead.phone ? esc(lead.phone) : dash)}
        </table>
        ${lead.message ? `<div style="${T(13, 20, 600, C.muted)}padding:12px 0 6px;border-top:1px solid ${C.line};">${t.f.message}</div>${messageBox(lead.message)}` : ''}`;

  const body = `
        ${eyebrow(t.eyebrow)}
        <h1 class="h1" style="margin:0 0 14px;${T(32, 38, 800, C.malt, 'letter-spacing:-0.6px;')}">${t.hello}${name ? `, <span style="font-weight:300;">${esc(name)}</span>` : ''}<span style="color:${C.turmeric};">.</span></h1>
        ${para(t.intro(lead.church), '0 0 20px')}
        ${planBlock}
        ${eyebrow(t.nextEyebrow, '0 0 14px')}
        ${stepsHtml(t.steps)}
        <div style="padding:6px 0 30px;">
          ${pill(t.ctaHref, t.cta)}${pill(t.cta2Href, t.cta2, { primary: false })}
        </div>
        ${recap}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;">
          <tr><td style="border-top:1px solid ${C.line};padding-top:22px;">
            ${para(t.direct, '0 0 14px')}
            <div style="${T(15, 22, 800, C.malt)}">Łukasz Dobrowolski</div>
            <div style="${T(13, 20, 400, C.muted)}padding-bottom:6px;">${t.sign}</div>
            <div style="${T(14, 22, 600, C.malt)}"><a href="mailto:${CONTACT.email}" style="${LINK}">${CONTACT.email}</a> &nbsp;·&nbsp; <a href="tel:${CONTACT.tel}" style="${LINK}">${CONTACT.phone}</a></div>
          </td></tr>
        </table>`;

  const footer = `
        <div style="${T(13, 20, 700, C.malt)}padding-bottom:4px;">Avenit</div>
        <div style="padding-bottom:10px;">${t.footAbout}</div>
        <div style="padding-bottom:12px;"><a href="${home}" style="color:${C.muted};text-decoration:underline;">avenit.pl</a> &nbsp;·&nbsp; <a href="${SITE}/polityka-prywatnosci/" style="color:${C.muted};text-decoration:underline;">${t.privacy}</a> &nbsp;·&nbsp; <a href="mailto:${CONTACT.email}" style="color:${C.muted};text-decoration:underline;">${CONTACT.email}</a></div>
        <div style="padding-bottom:6px;">${t.why}</div>
        <div>${t.rights(year)}</div>`;

  const html = shell({ lang: L, title: t.subject, preheader: t.preheader(name), body, footer });

  const planText = interest
    ? `${t.planEyebrow}: ${interest.plan[L]}${yearly ? ` (${t.yearlyTag})` : ''}\n${pl.size} · ${pl.price}\n${pl.note}\n${t.planFoot}`
    : `${t.noPlanEyebrow}: ${stripTags(t.noPlan)}`;
  const text = [
    `${t.hello}${name ? `, ${name}` : ''}.`,
    '',
    stripTags(t.intro(lead.church)),
    '',
    planText,
    '',
    `${t.nextEyebrow}:`,
    ...t.steps.map(([h, d], i) => `${i + 1}. ${h}. ${d}`),
    '',
    `${t.cta}: ${t.ctaHref}`,
    '',
    `${t.recapEyebrow}:`,
    `${t.f.name}: ${lead.name || '—'}`,
    `${t.f.church}: ${lead.church || '—'}`,
    `${t.f.email}: ${lead.email || '—'}`,
    `${t.f.phone}: ${lead.phone || '—'}`,
    ...(lead.message ? [`${t.f.message}:`, lead.message] : []),
    '',
    t.direct,
    `Łukasz Dobrowolski, ${t.sign}`,
    `${CONTACT.email} · ${CONTACT.phone}`,
    '',
    '--',
    `Avenit · ${home}`,
    `${t.privacy}: ${SITE}/polityka-prywatnosci/`,
    t.why,
    t.rights(year),
  ].join('\n');

  return { subject: t.subject, html, text };
}

// ── Powiadomienie dla właściciela (PL) ────────────────────────────────────────
// meta: { lang, source, createdAt, signals[], previousLeads, adminUrl }
export function leadNotificationEmail(lead = {}, meta = {}) {
  const lang = meta.lang === 'en' ? 'en' : 'pl';
  const interest = parsePlanInterest(lead.message);
  const yearly = !!(interest && interest.yearly && !interest.plan.custom);
  const size = parseChurchSize(lead.message);
  const signals = meta.signals || [];
  // Link prosto do zgłoszenia (panel admina otwiera ?lead=<id>); bez id — lista zgłoszeń.
  const adminUrl = meta.adminUrl || `https://admin.${config.APP_DOMAIN}/leads${lead.id ? `?lead=${encodeURIComponent(String(lead.id))}` : ''}`;
  const who = oneLine(lead.church || lead.name || 'bez nazwy', 80);

  const planName = interest ? `${interest.plan.pl}${yearly ? ' (rocznie)' : ''}` : null;
  const subject = oneLine(`Nowe zgłoszenie: ${who}${planName ? ` · plan ${planName}` : ''}${lang === 'en' ? ' · EN' : ''}`, 180);

  // Odpowiedź jednym dotknięciem: mailto z tematem i powitaniem w języku zgłaszającego.
  const fn = firstName(lead.name);
  const replySubject = lang === 'en' ? 'Your Avenit enquiry' : 'Twoje zgłoszenie w Avenit';
  const replyBody = lang === 'en' ? `Hi ${fn},\n\n` : `Dzień dobry${fn ? ` ${fn}` : ''},\n\n`;
  const mailto = `mailto:${mailtoAddr(lead.email)}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(replyBody)}`;
  const tel = telHref(lead.phone);

  // Plan + wielkość: wybór z cennika, liczba z wiadomości i podpowiedź, gdy się rozjeżdżają.
  const suggested = size ? suggestPlanForSize(size.max) : null;
  const mismatch = !!(interest && suggested && suggested.key !== interest.plan.key);
  let planHtml; let planText;
  if (interest) {
    const pl = planLines(interest.plan, yearly, 'pl');
    planHtml = `<div style="${T(22, 28, 800, C.malt)}">${esc(interest.plan.pl)}${yearly ? `<span style="${T(14, 28, 600, C.mustard)}"> &nbsp;·&nbsp; rocznie</span>` : ''}</div>
            <div style="${T(14, 21, 600, C.malt)}">${esc(pl.size)} &nbsp;·&nbsp; ${esc(pl.price)}</div>`;
    planText = `${planName} — ${pl.size}, ${pl.price}`;
  } else {
    planHtml = `<div style="${T(18, 26, 700, C.malt)}">Nie wybrano planu</div>`;
    planText = 'nie wybrano';
  }
  let sizeHtml = ''; let sizeText = '';
  if (size) {
    sizeText = `${size.text} → pasuje ${suggested.pl}${mismatch ? ` (wybrany: ${interest.plan.pl}; liczymy tylko dorosłych — dopytaj)` : ''}`;
    sizeHtml = `<div style="${T(14, 21, 400, C.text)}padding-top:10px;">Wielkość z wiadomości: ${B(esc(size.text))} → pasuje ${B(esc(suggested.pl))}${mismatch ? `<br><span style="color:${C.mustard};font-weight:700;">Inny niż wybrany plan (${esc(interest.plan.pl)}). Liczymy tylko dorosłych, dopytaj.</span>` : ''}</div>`;
  }

  const when = warsawTime(meta.createdAt || lead.created_at, 'pl');
  const metaRows = [
    ['Źródło', meta.source ? esc(meta.source) : dash],
    ['Język', lang === 'en' ? 'angielski (EN)' : 'polski (PL)'],
    ['Wysłano', when ? esc(when) : dash],
    ...(meta.previousLeads ? [['Wcześniej', `${meta.previousLeads} ${meta.previousLeads === 1 ? 'zgłoszenie' : 'zgłoszenia'} z tego adresu`]] : []),
    ['ID', `<span style="font-family:Menlo,Consolas,monospace;font-size:12px;font-weight:400;">${esc(lead.id)}</span>`],
  ];

  const body = `
        ${eyebrow('Nowe zgłoszenie z avenit.pl')}
        <h1 class="h1" style="margin:0 0 4px;${T(28, 34, 800, C.malt, 'letter-spacing:-0.5px;')}word-break:break-word;">${lead.church ? esc(lead.church) : '<span style="font-weight:300;">Bez nazwy kościoła</span>'}<span style="color:${C.turmeric};">.</span></h1>
        <div style="${T(16, 24, 600, C.malt)}">${esc(lead.name)}</div>
        <div style="${T(14, 22, 400, C.text)}padding-bottom:20px;word-break:break-word;"><a href="${esc(mailto)}" style="${LINK}">${esc(lead.email)}</a>${lead.phone ? ` &nbsp;·&nbsp; ${tel ? `<a href="tel:${esc(tel)}" style="${LINK}">${esc(lead.phone)}</a>` : esc(lead.phone)}` : ''}</div>
        <div style="padding:0 0 18px;">
          ${pill(mailto, 'Odpowiedz')}${tel ? pill(`tel:${tel}`, 'Zadzwoń', { primary: false }) : ''}${pill(adminUrl, 'Otwórz w panelu', { primary: false })}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td bgcolor="${C.hero}" style="background:${C.hero};border-radius:18px;padding:18px 22px;">
            ${eyebrow('Plan', '0 0 4px')}
            ${planHtml}
            ${sizeHtml}
          </td></tr>
        </table>
        ${eyebrow('Wiadomość', '0 0 8px')}
        ${lead.message ? messageBox(lead.message) : `<div style="${T(15, 22, 400, C.muted)}">Bez wiadomości.</div>`}
        ${signals.length ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
          <tr><td style="border:1px solid #E9D9A6;border-radius:16px;padding:14px 18px;">
            ${eyebrow('Sygnały spamu', '0 0 6px')}
            ${signals.map((s) => `<div style="${T(14, 21, 400, C.malt)}">· ${esc(s)}</div>`).join('')}
          </td></tr>
        </table>` : ''}
        ${eyebrow('Szczegóły', '26px 0 4px')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${metaRows.map(([k, v]) => dataRow(k, v)).join('')}
        </table>`;

  const footer = `
        <div>Odpowiedź na tę wiadomość trafi prosto do ${esc(lead.email)}.</div>
        <div>Avenit · powiadomienie wewnętrzne z formularza na avenit.pl</div>`;

  const html = shell({
    lang: 'pl',
    title: subject,
    preheader: oneLine(`${lead.name || ''} · ${lead.email || ''}${lead.phone ? ` · ${lead.phone}` : ''}${lead.message ? ` — ${lead.message}` : ''}`, 140),
    body,
    footer,
  });

  const text = [
    `Nowe zgłoszenie z avenit.pl${lang === 'en' ? ' (EN)' : ''}`,
    '',
    `Kościół: ${lead.church || '—'}`,
    `Imię i nazwisko: ${lead.name || '—'}`,
    `E-mail: ${lead.email || '—'}`,
    `Telefon: ${lead.phone || '—'}`,
    '',
    `Plan: ${planText}`,
    ...(sizeText ? [`Wielkość: ${sizeText}`] : []),
    '',
    'Wiadomość:',
    lead.message || '(brak)',
    '',
    ...(signals.length ? ['Sygnały spamu:', ...signals.map((s) => `- ${s}`), ''] : []),
    `Źródło: ${meta.source || '—'}`,
    `Język: ${lang.toUpperCase()}`,
    `Wysłano: ${when || '—'}`,
    ...(meta.previousLeads ? [`Wcześniejsze zgłoszenia z tego adresu: ${meta.previousLeads}`] : []),
    `ID: ${lead.id || '—'}`,
    '',
    `Panel: ${adminUrl}`,
    'Odpowiedz na tę wiadomość, aby napisać do zgłaszającego.',
  ].join('\n');

  return { subject, html, text };
}
