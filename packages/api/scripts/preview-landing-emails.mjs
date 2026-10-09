// Podgląd maili formularza avenit.pl (bez wysyłki): zapisuje HTML do wskazanego katalogu.
// Użycie: node scripts/preview-landing-emails.mjs [katalog=./tmp-email-preview]
import fs from 'node:fs';
import path from 'node:path';
import { leadConfirmationEmail, leadNotificationEmail, leadSpamSignals } from '../src/landing/emails.js';

const out = path.resolve(process.argv[2] || './tmp-email-preview');
fs.mkdirSync(out, { recursive: true });

const lead = {
  id: '6f1c2d4e-8a3b-4c5d-9e0f-1a2b3c4d5e6f',
  name: 'Anna Nowak',
  email: 'anna.nowak@zborbetel.pl',
  phone: '+48 600 100 200',
  church: 'Zbór Betel w Lesznie',
  message: 'Interesuje mnie plan Wspólnota (płatność roczna).\n\nMamy ok. 120 członków, najpierw chcemy ogarnąć grafik zespołu uwielbienia i szkółkę niedzielną. Czy pomożecie przenieść dane z Excela?',
  created_at: new Date(),
};

const files = {
  'email-preview-client.html': leadConfirmationEmail(lead, { lang: 'pl' }),
  'email-preview-client-en.html': leadConfirmationEmail({
    ...lead, name: 'John Smith', church: 'Grace Church Kraków',
    message: 'I am interested in the Church+ plan (annual billing).\n\nAbout 600 people on Sundays, two campuses.',
  }, { lang: 'en' }),
  'email-preview-owner.html': leadNotificationEmail(lead, {
    lang: 'pl', source: 'avenit.pl/', createdAt: lead.created_at, previousLeads: 0,
    signals: leadSpamSignals({ lead, tokenAgeMs: 95_000, userAgent: 'Mozilla/5.0' }),
    adminUrl: 'https://admin.avenit.pl/leads',
  }),
};
for (const [name, m] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, name), m.html);
  fs.writeFileSync(path.join(out, name.replace(/\.html$/, '.txt')), `Subject: ${m.subject}\n\n${m.text}\n`);
  console.log(`${name}  —  ${m.subject}`);
}
