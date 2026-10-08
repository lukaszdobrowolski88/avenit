// Wydruk / PDF grafiku miesiąca: osobne okno z prostą tabelą „role × daty” i okno drukowania
// przeglądarki (tam „Zapisz jako PDF”). Wszystko, co wpisują użytkownicy, jest escapowane.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// data: { title, subtitle, events: [{ date, weekday, time, title, place }],
//         rows: [{ label, cells: [string[] per wydarzenie], kind?: 'absent'|'notes' }], footer }
export function buildPrintHtml({ title, subtitle = '', events = [], rows = [], footer = '' }) {
  const landscape = events.length > 5;
  const head = events.map((e) => `
      <th>
        <div class="d">${esc(e.date)}</div>
        <div class="m">${esc([e.weekday, e.time].filter(Boolean).join(' · '))}</div>
        <div class="t">${esc(e.title)}</div>
        ${e.place ? `<div class="m">${esc(e.place)}</div>` : ''}
      </th>`).join('');
  const body = rows.map((r) => `
    <tr class="${r.kind ? `row-${esc(r.kind)}` : ''}">
      <th scope="row">${esc(r.label)}</th>
      ${r.cells.map((names) => `<td>${(names || []).map((n) => `<div>${esc(n)}</div>`).join('')}</td>`).join('')}
    </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Manrope', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #2A2312; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0; font-weight: 800; letter-spacing: -0.3px; }
  h1 span { font-weight: 300; }
  .sub { color: #6B6557; font-size: 12px; margin: 4px 0 18px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
  thead th { text-align: left; vertical-align: bottom; padding: 8px; border-bottom: 2px solid #2A2312; font-weight: 400; }
  thead th:first-child { width: 22%; }
  .d { font-size: 15px; font-weight: 800; }
  .m { color: #6B6557; font-size: 10.5px; }
  .t { font-weight: 600; margin-top: 2px; }
  tbody th { text-align: left; font-weight: 700; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #8A6606; padding: 7px 8px; vertical-align: top; }
  tbody td { padding: 7px 8px; vertical-align: top; }
  tbody tr { border-bottom: 1px solid #E6E1D5; break-inside: avoid; }
  tbody tr.row-absent td { color: #B42318; }
  tbody tr.row-notes td { color: #4A463E; font-style: italic; }
  .foot { margin-top: 16px; color: #857F70; font-size: 10px; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  <table>
    <thead><tr><th></th>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${footer ? `<div class="foot">${esc(footer)}</div>` : ''}
</body></html>`;
}

// Otwiera okno z wydrukiem i wywołuje drukowanie (wywoływać z kliknięcia — inaczej blokada okien).
export function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  const go = () => { try { w.focus(); w.print(); } catch { /* okno zamknięte */ } };
  if (w.document.readyState === 'complete') setTimeout(go, 150);
  else w.addEventListener('load', () => setTimeout(go, 150));
  return true;
}
