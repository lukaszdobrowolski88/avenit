/**
 * Generuje HTML dla etykiety dziecka
 */
export function generateChildLabel(checkin) {
  const isGuest = checkin.is_guest;
  const name = isGuest ? checkin.guest_name : checkin.kids_students?.full_name;
  const allergies = isGuest ? checkin.guest_allergies : checkin.kids_students?.allergies;
  const location = checkin.checkin_locations;
  const parentName = isGuest ? checkin.guest_parent_name : null;
  const parentPhone = isGuest ? checkin.guest_parent_phone : null;

  // Pobierz listę kodów bezpieczeństwa (ostatnie 4 cyfry telefonów)
  const securityCodes = checkin.security_codes_list || [];
  const codesFromField = checkin.security_code?.split('|') || [];
  const displayCodes = securityCodes.length > 0
    ? securityCodes.map(c => c.code)
    : codesFromField;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page {
          size: 4in 2in;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 8px;
          font-family: Arial, sans-serif;
          width: 4in;
          height: 2in;
          box-sizing: border-box;
        }
        .label {
          border: 2px solid #000;
          border-radius: 8px;
          padding: 10px;
          height: calc(100% - 4px);
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 4px;
        }
        .name {
          font-size: 22pt;
          font-weight: bold;
          color: #000;
        }
        .guest-badge {
          background: #fbbf24;
          color: #000;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10pt;
          font-weight: bold;
        }
        .codes-container {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin: 6px 0;
        }
        .security-code {
          font-size: ${displayCodes.length > 2 ? '24pt' : '32pt'};
          font-weight: bold;
          color: #ec4899;
          text-align: center;
        }
        .codes-label {
          font-size: 8pt;
          color: #6b7280;
          text-align: center;
          margin-bottom: 2px;
        }
        .location {
          font-size: 12pt;
          color: #374151;
          text-align: center;
        }
        .room-number {
          font-weight: bold;
        }
        .allergies {
          background: #fecaca;
          color: #991b1b;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 9pt;
          font-weight: bold;
          margin-top: auto;
          text-align: center;
        }
        .parent-info {
          font-size: 9pt;
          color: #6b7280;
          margin-top: 4px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="header">
          <span class="name">${name || 'Nieznane'}</span>
          ${isGuest ? '<span class="guest-badge">GOŚĆ</span>' : ''}
        </div>
        ${displayCodes.length > 1 ? '<div class="codes-label">Kody odbioru (ostatnie 4 cyfry tel.)</div>' : ''}
        <div class="codes-container">
          ${displayCodes.map(code => `<span class="security-code">${code}</span>`).join('')}
        </div>
        <div class="location">
          ${location?.name || 'Sala'}
          ${location?.room_number ? `<span class="room-number">(${location.room_number})</span>` : ''}
        </div>
        ${allergies ? `<div class="allergies">⚠️ ALERGIE: ${allergies}</div>` : ''}
        ${isGuest && parentPhone ? `<div class="parent-info">Rodzic: ${parentName} • ${parentPhone}</div>` : ''}
      </div>
    </body>
    </html>
  `;
}

/**
 * Generuje HTML dla biletu rodzica (claim ticket)
 */
export function generateParentTicket(checkins, securityCode) {
  const children = checkins.map(c => {
    if (c.is_guest) return c.guest_name;
    return c.kids_students?.full_name || 'Nieznane';
  });

  // Pobierz wszystkie kody bezpieczeństwa
  const securityCodes = checkins[0]?.security_codes_list || [];
  const codesFromField = securityCode?.split('|') || [];
  const displayCodes = securityCodes.length > 0
    ? securityCodes
    : codesFromField.map(code => ({ code, name: '' }));

  const date = new Date().toLocaleDateString('pl-PL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page {
          size: 4in 2in;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 8px;
          font-family: Arial, sans-serif;
          width: 4in;
          height: 2in;
          box-sizing: border-box;
        }
        .ticket {
          border: 2px dashed #000;
          border-radius: 8px;
          padding: 10px;
          height: calc(100% - 4px);
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .title {
          font-size: 11pt;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .codes-container {
          display: flex;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .code-item {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .security-code {
          font-size: ${displayCodes.length > 2 ? '28pt' : '36pt'};
          font-weight: bold;
          color: #ec4899;
          line-height: 1;
        }
        .code-name {
          font-size: 8pt;
          color: #6b7280;
          margin-top: 2px;
        }
        .children {
          font-size: 11pt;
          color: #374151;
          margin-top: 6px;
          text-align: center;
        }
        .date {
          font-size: 9pt;
          color: #9ca3af;
          margin-top: auto;
        }
        .instructions {
          font-size: 8pt;
          color: #6b7280;
          margin-top: 4px;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        <div class="title">BILET RODZICA - ${displayCodes.length > 1 ? 'KODY ODBIORU' : 'KOD ODBIORU'}</div>
        <div class="codes-container">
          ${displayCodes.map(c => `
            <div class="code-item">
              <span class="security-code">${c.code}</span>
              ${c.name ? `<span class="code-name">${c.name}</span>` : ''}
            </div>
          `).join('')}
        </div>
        <div class="children">${children.join(', ')}</div>
        <div class="date">${date}</div>
        <div class="instructions">${displayCodes.length > 1 ? 'Każdy z kodów może być użyty do odbioru' : 'Zachowaj ten bilet do odbioru dziecka'}</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Drukuje etykiety w nowym oknie
 */
export function printLabels(checkins) {
  if (!checkins || checkins.length === 0) return;

  // Grupuj po kodzie bezpieczeństwa (dla biletu rodzica)
  const groupedByCode = {};
  checkins.forEach(c => {
    if (!groupedByCode[c.security_code]) {
      groupedByCode[c.security_code] = [];
    }
    groupedByCode[c.security_code].push(c);
  });

  // Generuj wszystkie etykiety
  let allLabels = '';

  // Etykiety dzieci
  checkins.forEach(checkin => {
    allLabels += generateChildLabel(checkin);
    allLabels += '<div style="page-break-after: always;"></div>';
  });

  // Bilety rodziców (jeden na kod bezpieczeństwa)
  Object.entries(groupedByCode).forEach(([code, group]) => {
    allLabels += generateParentTicket(group, code);
    allLabels += '<div style="page-break-after: always;"></div>';
  });

  // Otwórz okno drukowania
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etykiety Check-in</title>
        <style>
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${allLabels}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
}

/**
 * Drukuje pojedynczą etykietę
 */
export function printSingleLabel(checkin) {
  printLabels([checkin]);
}
