import { escapeHtml } from '../../../../lib/html';
import { tr, appLocale } from '../../../../i18n';
import { splitStoredCodes } from './kiosk';

// Etykiety drukowane przy meldowaniu: naklejka dziecka + bilet rodzica z TYM SAMYM losowym
// kodem odbioru. Czarno-białe (drukarki termiczne), bez kolorów spoza marki.

const LABEL_CSS = `
  @page { size: 4in 2in; margin: 0; }
  body { margin: 0; font-family: 'Manrope', Arial, sans-serif; color: #000; }
  .page { width: 4in; height: 2in; padding: 8px; box-sizing: border-box; page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .box { border: 2px solid #000; border-radius: 8px; padding: 10px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; }
  .ticket { border-style: dashed; align-items: center; justify-content: center; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; gap: 8px; }
  .name { font-size: 22pt; font-weight: bold; line-height: 1.1; }
  .badge { border: 1.5px solid #000; padding: 1px 6px; border-radius: 4px; font-size: 9pt; font-weight: bold; white-space: nowrap; }
  .codes { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin: 4px 0; }
  .code { font-size: 34pt; font-weight: 800; letter-spacing: 0.12em; line-height: 1; }
  .muted { font-size: 8pt; color: #333; text-align: center; }
  .location { font-size: 12pt; text-align: center; }
  .allergies { border: 2px solid #000; background: #000; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 10pt; font-weight: bold; margin-top: auto; text-align: center; }
  .parent { font-size: 9pt; margin-top: 4px; text-align: center; }
  .title { font-size: 10pt; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
  .children { font-size: 11pt; margin-top: 6px; text-align: center; }
  .date { font-size: 8pt; margin-top: auto; }
`;

const codesOf = (checkin) => splitStoredCodes(checkin?.security_code);

export function generateChildLabel(checkin) {
  const isGuest = checkin.is_guest;
  const name = isGuest ? checkin.guest_name : checkin.kids_students?.full_name;
  const allergies = isGuest ? checkin.guest_allergies : checkin.kids_students?.allergies;
  const location = checkin.checkin_locations;
  const parentName = isGuest ? checkin.guest_parent_name : null;
  const codes = codesOf(checkin);

  return `
    <div class="box">
      <div class="header">
        <span class="name">${escapeHtml(name || tr('Dziecko'))}</span>
        ${isGuest ? `<span class="badge">${escapeHtml(tr('Gość'))}</span>` : ''}
      </div>
      <div class="codes">
        ${codes.map((code) => `<span class="code">${escapeHtml(code)}</span>`).join('')}
      </div>
      ${location?.name ? `<div class="location">${escapeHtml(location.name)}${location.room_number ? ` (${escapeHtml(location.room_number)})` : ''}</div>` : ''}
      ${allergies ? `<div class="allergies">${escapeHtml(tr('Alergie: {list}', { list: allergies }))}</div>` : ''}
      ${isGuest && parentName ? `<div class="parent">${escapeHtml(tr('Rodzic: {name}', { name: parentName }))}</div>` : ''}
    </div>
  `;
}

export function generateParentTicket(checkins) {
  const children = checkins.map((c) => (c.is_guest ? c.guest_name : c.kids_students?.full_name || tr('Dziecko')));
  const codes = [...new Set(checkins.flatMap(codesOf))];
  const date = new Date().toLocaleDateString(appLocale(), {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return `
    <div class="box ticket">
      <div class="title">${escapeHtml(tr('Bilet rodzica — kod odbioru'))}</div>
      <div class="codes">
        ${codes.map((code) => `<span class="code">${escapeHtml(code)}</span>`).join('')}
      </div>
      <div class="children">${escapeHtml(children.join(', '))}</div>
      <div class="muted">${escapeHtml(tr('Pokaż ten bilet przy odbiorze dziecka'))}</div>
      <div class="date">${escapeHtml(date)}</div>
    </div>
  `;
}

export function printLabels(checkins) {
  if (!checkins || checkins.length === 0) return;

  // Jeden bilet rodzica na kod odbioru.
  const groupedByCode = new Map();
  checkins.forEach((c) => {
    const key = c.security_code || '';
    if (!groupedByCode.has(key)) groupedByCode.set(key, []);
    groupedByCode.get(key).push(c);
  });

  let body = '';
  checkins.forEach((checkin) => { body += `<div class="page">${generateChildLabel(checkin)}</div>`; });
  groupedByCode.forEach((group) => { body += `<div class="page">${generateParentTicket(group)}</div>`; });

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(tr('Etykiety meldowania'))}</title>
      <style>${LABEL_CSS}</style>
    </head>
    <body>
      ${body}
      <script>window.onload = function () { window.print(); };</script>
    </body>
    </html>`);
  printWindow.document.close();
}

export function printSingleLabel(checkin) {
  printLabels([checkin]);
}
