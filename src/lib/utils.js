import { clsx } from "clsx";
import { supabase } from './supabase';
import { twMerge } from "tailwind-merge";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const formatDateFull = (dateString) => {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const date = new Date(dateString);
  const formatted = date.toLocaleDateString('pl-PL', options);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const getPDFHtmlContent = (program, songsMap, teamRoles = {}) => {
  let songCounter = 0;
  const songNumberMap = {};

  program.schedule?.forEach(row => {
    if ((row.element || '').toLowerCase().includes('uwielbienie') && row.selectedSongs?.length > 0) {
      row.selectedSongs.forEach(s => {
        songCounter++;
        songNumberMap[s.songId] = songCounter;
      });
    }
  });

  // --- STYLES & COMPONENTS ---
  
  const colors = {
    // Główny motyw (Plan, Pieśni) - PINK
    primary: '#db2777',      // Pink 600
    primaryLight: '#fdf2f8', // Pink 50
    primaryBorder: '#fbcfe8',// Pink 200
    
    // Motyw Sekcji (Zespoły) - ORANGE
    sectionAccent: '#ea580c', // Orange 600

    // Ogólne teksty - SLATE
    textMain: '#1e293b',     // Slate 800
    textMuted: '#64748b',    // Slate 500
    border: '#e2e8f0',       // Slate 200
    bgGray: '#f8fafc'        // Slate 50
  };

  // Funkcja do kolorowania słów kluczowych w akordach
  const formatChordsText = (text) => {
    if (!text) return '<span style="color:#9ca3af; font-style:italic;">Brak akordów</span>';
    
    // Lista słów do pokolorowania (regex case-insensitive)
    const pattern = /(intro|ref\.|zwr\.|bridge|tag|outro|pre-chorus|instrumentalne)/gi;
    
    // Podmiana na wersję z kolorem Orange
    return text.replace(pattern, (match) => 
      `<span style="color: ${colors.sectionAccent}; font-weight: 700;">${match}</span>`
    );
  };

  const renderScheduleTable = () => {
    return `
      <div style="margin-bottom: 40px;">
        <div style="display: flex; align-items: center; margin-bottom: 16px; border-bottom: 2px solid ${colors.primary}; padding-bottom: 8px;">
            <h2 style="font-family: 'Roboto', sans-serif; font-size: 18px; font-weight: 700; color: ${colors.textMain}; margin: 0;">
                PLAN SZCZEGÓŁOWY
            </h2>
        </div>
        <table style="width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed;">
          <thead>
            <tr style="background-color: ${colors.bgGray};">
              <th style="width: 20%; padding: 8px 12px; text-align: left; font-weight: 700; font-size: 10px; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; border-top: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; font-family: 'Roboto', sans-serif; vertical-align: middle;">Element</th>
              <th style="width: 35%; padding: 8px 12px; text-align: left; font-weight: 700; font-size: 10px; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; border-top: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; font-family: 'Roboto', sans-serif; vertical-align: middle;">Osoba Odpowiedzialna</th>
              <th style="width: 45%; padding: 8px 12px; text-align: left; font-weight: 700; font-size: 10px; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; border-top: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; font-family: 'Roboto', sans-serif; vertical-align: middle;">Szczegóły / Pieśni</th>
            </tr>
          </thead>
          <tbody>
            ${program.schedule?.map((row, idx) => `
              <tr style="border-bottom: 1px solid ${colors.border};">
                
                <!-- KOLUMNA 1: ELEMENT (Przesunięcie -5px) -->
                <td style="padding: 8px 12px 10px 12px; border-bottom: 1px solid ${colors.border}; color: ${colors.textMain}; font-weight: 600; font-size: 12px; font-family: 'Roboto', sans-serif; vertical-align: middle; word-wrap: break-word;">
                  <span style="display: inline-block; position: relative; top: -5px;">
                    ${row.element || '-'}
                  </span>
                </td>

                <!-- KOLUMNA 2: OSOBA (Przesunięcie -5px wewnątrz plakietki) -->
                <td style="padding: 8px 12px 10px 12px; border-bottom: 1px solid ${colors.border}; vertical-align: middle; word-wrap: break-word;">
                   ${row.person ? `
                    <span style="
                        display: inline-block; 
                        background-color: #f1f5f9; 
                        color: #334155; 
                        border: 1px solid #e2e8f0; 
                        border-radius: 4px; 
                        padding: 4px 10px 4px 10px; 
                        font-size: 11px; 
                        font-weight: 600; 
                        font-family: 'Roboto', sans-serif; 
                        vertical-align: middle;
                    ">
                        <span style="display: inline-block; position: relative; top: -5px;">
                            ${row.person}
                        </span>
                    </span>
                   ` : `
                    <span style="display: inline-block; position: relative; top: -5px; color: #cbd5e1; font-size: 11px;">-</span>
                   `}
                </td>

                <!-- KOLUMNA 3: SZCZEGÓŁY / PIEŚNI -->
                <td style="padding: 8px 12px 10px 12px; border-bottom: 1px solid ${colors.border}; vertical-align: middle;">
                  ${(row.element || '').toLowerCase().includes('uwielbienie') && row.selectedSongs?.length > 0 ? 
                    `
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                      ${row.selectedSongs.map((s) => {
                        const song = songsMap[s.songId];
                        const songNum = songNumberMap[s.songId];
                        return song ? `
                          <div style="display: flex; align-items: center; gap: 8px;">
                            
                            <!-- NUMER PIEŚNI: Kółko zostaje, cyfra leci -5px do góry -->
                            <span style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; background-color: ${colors.primary}; color: white; border-radius: 50%; font-size: 9px; font-weight: 700;">
                                <span style="position: relative; top: -5px;">${songNum}</span>
                            </span>
                            
                            <!-- TYTUŁ PIEŚNI: Leci -5px do góry -->
                            <span style="font-size: 12px; font-weight: 500; color: ${colors.textMain}; font-family: 'Roboto', sans-serif;">
                              <span style="position: relative; top: -5px;">${song.title}</span>
                            </span>
                            
                            <!-- TONACJA: Tło zostaje, tekst leci -5px do góry -->
                            <span style="background-color: ${colors.primaryLight}; color: ${colors.primary}; padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 700; border: 1px solid ${colors.primaryBorder};">
                                <span style="position: relative; top: -5px;">${s.key}</span>
                            </span>

                          </div>
                        ` : '';
                      }).join('')}
                    </div>` 
                    : `
                    <!-- ZWYKŁE SZCZEGÓŁY: Przesunięcie -5px -->
                    <span style="display: inline-block; position: relative; top: -5px; color: ${colors.textMuted}; font-size: 12px; font-family: 'Roboto', sans-serif;">
                        ${row.details || '-'}
                    </span>
                    `}
                </td>
              </tr>
            `).join('') || ''}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderSectionCard = (title, fields) => {
    const filledFields = fields.filter(f => f.value?.trim());
    if (filledFields.length === 0) return '';

    // Wszystkie sekcje służb w 3 kolumnach
    const columns = filledFields.length === 1 ? '1fr' : (filledFields.length === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)');

    return `
      <div style="page-break-inside: avoid; margin-bottom: 24px; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid ${colors.border}; border-top: 4px solid ${colors.sectionAccent};">
        <h3 style="font-family: 'Roboto', sans-serif; font-size: 13px; font-weight: 700; color: ${colors.textMuted}; margin-top: 0; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px;">
          ${title}
        </h3>
        <div style="display: grid; grid-template-columns: ${columns}; gap: 20px;">
          ${filledFields.map(field => `
            <div>
              <div style="font-family: 'Roboto', sans-serif; font-size: 11px; font-weight: 600; color: ${colors.sectionAccent}; margin-bottom: 4px;">
                ${field.label}
              </div>
              <div style="font-family: 'Roboto', sans-serif; font-size: 13px; color: ${colors.textMain}; line-height: 1.4; font-weight: 500;">
                ${field.value}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  const renderSections = () => {
    // Dynamiczne pola dla zespołów - używa teamRoles jeśli dostępne, lub fallback do statycznych
    const worshipFields = teamRoles.worship?.length > 0
      ? teamRoles.worship.map(r => ({ key: r.field_key, label: r.name }))
      : [{ key: 'lider', label: 'Lider Uwielbienia' }, { key: 'piano', label: 'Piano' }, { key: 'gitara_akustyczna', label: 'Gitara Akustyczna' }, { key: 'gitara_elektryczna', label: 'Gitara Elektryczna' }, { key: 'bas', label: 'Gitara Basowa' }, { key: 'wokale', label: 'Wokale' }, { key: 'cajon', label: 'Cajon / Perkusja' }];

    const mediaFields = teamRoles.media?.length > 0
      ? teamRoles.media.map(r => ({ key: r.field_key, label: r.name }))
      : [{ key: 'naglosnienie', label: 'Nagłośnienie' }, { key: 'propresenter', label: 'ProPresenter' }, { key: 'social', label: 'Social Media' }, { key: 'host', label: 'Host' }];

    const atmosferaFields = teamRoles.atmosfera?.length > 0
      ? teamRoles.atmosfera.map(r => ({ key: r.field_key, label: r.name }))
      : [{ key: 'przygotowanie', label: 'Przygotowanie' }, { key: 'witanie', label: 'Witanie' }];

    // Dynamiczne pola dla szkółki - używa kidsGroups jeśli dostępne
    const szkolkaFields = teamRoles.kidsGroups?.length > 0
      ? [{ key: 'temat', label: 'Temat lekcji' }, ...teamRoles.kidsGroups.map(g => ({ key: g.id, label: g.name }))]
      : [{ key: 'temat', label: 'Temat lekcji' }, { key: 'mlodsza', label: 'Grupa Młodsza' }, { key: 'srednia', label: 'Grupa Średnia' }, { key: 'starsza', label: 'Grupa Starsza' }];

    // Dynamiczne pola dla Sceny - używa teamRoles.mc jeśli dostępne, lub fallback do statycznych
    const mcFields = teamRoles.mc?.length > 0
      ? teamRoles.mc.map(r => ({ key: r.field_key, label: r.name }))
      : [{ key: 'prowadzenie', label: 'Prowadzenie' }, { key: 'modlitwa', label: 'Modlitwa' }, { key: 'wieczerza', label: 'Wieczerza' }, { key: 'ogloszenia', label: 'Ogłoszenia' }];

    // Dodaj pole kazanie (z teaching)
    const scenaFields = [...mcFields, { key: 'kazanie', label: 'Kazanie', source: 'teaching' }];

    // Buduj dane dla Sceny z custom_mc_schedule i teaching
    const scenaData = {};
    mcFields.forEach(f => {
      if (program.custom_mc_schedule?.[f.key]) {
        scenaData[f.key] = program.custom_mc_schedule[f.key];
      }
    });
    // Kazanie z teaching
    if (program.teaching?.speaker_name) {
      scenaData.kazanie = program.teaching.speaker_name;
    } else if (program.teaching?.speaker_id && teamRoles.teachingSpeakers) {
      const speaker = teamRoles.teachingSpeakers.find(s => s.id === program.teaching.speaker_id);
      if (speaker) scenaData.kazanie = speaker.name;
    }

    const sectionConfigs = [
      { title: 'Atmosfera Team', data: program.atmosfera_team, fields: atmosferaFields },
      { title: 'MediaTeam', data: program.produkcja, fields: mediaFields },
      { title: 'Scena', data: scenaData, fields: scenaFields },
      { title: 'Szkółka Niedzielna', data: program.szkolka, fields: szkolkaFields },
      { title: 'Zespół Uwielbienia', data: program.zespol, fields: worshipFields }
    ];

    return sectionConfigs.map(section => {
      const filledFields = section.fields.filter(f => section.data?.[f.key]?.trim()).map(f => ({ label: f.label, value: section.data?.[f.key] }));
      return renderSectionCard(section.title, filledFields);
    }).filter(s => s).join('');
  };

  const renderSongsPages = () => {
    const allSongs = [];
    program.schedule?.forEach(row => {
      if (row.selectedSongs?.length > 0) {
        row.selectedSongs.forEach(s => {
          const song = songsMap[s.songId];
          if (song) {
            const chordsContent = song.chords_bars || song.chords || '';
            allSongs.push({ ...song, selectedKey: s.key, finalChords: chordsContent, songNumber: songNumberMap[s.songId] });
          }
        });
      }
    });

    if (allSongs.length === 0) return '';

    return allSongs.map((song) => `
      <div style="page-break-before: always; page-break-inside: avoid; padding: 20px 0 40px 0;">
        <!-- Song Header -->
        <div style="border-bottom: 1px solid ${colors.border}; padding-bottom: 20px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <div style="font-family: 'Roboto', sans-serif; font-size: 12px; font-weight: 700; color: ${colors.primary}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                        Pieśń #${song.songNumber}
                    </div>
                    <h2 style="font-family: 'Roboto', sans-serif; font-size: 32px; font-weight: 800; color: ${colors.textMain}; margin: 0; line-height: 1.2; letter-spacing: -0.5px;">${song.title}</h2>
                </div>
                <div style="display: flex; gap: 12px;">
                     <div style="background: ${colors.bgGray}; border: 1px solid ${colors.border}; padding: 8px 16px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 10px; text-transform: uppercase; color: ${colors.textMuted}; font-weight: 600; letter-spacing: 0.5px;">Tonacja</div>
                        <div style="font-size: 18px; font-weight: 700; color: ${colors.primary};">${song.selectedKey || '-'}</div>
                     </div>
                     ${song.tempo ? `
                     <div style="background: ${colors.bgGray}; border: 1px solid ${colors.border}; padding: 8px 16px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 10px; text-transform: uppercase; color: ${colors.textMuted}; font-weight: 600; letter-spacing: 0.5px;">Tempo</div>
                        <div style="font-size: 18px; font-weight: 700; color: ${colors.textMain};">${song.tempo}</div>
                     </div>` : ''}
                     ${song.meter ? `
                     <div style="background: ${colors.bgGray}; border: 1px solid ${colors.border}; padding: 8px 16px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 10px; text-transform: uppercase; color: ${colors.textMuted}; font-weight: 600; letter-spacing: 0.5px;">Metrum</div>
                        <div style="font-size: 18px; font-weight: 700; color: ${colors.textMain};">${song.meter}</div>
                     </div>` : ''}
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Lyrics Card -->
          <div>
            <div style="background: white; border: 1px solid ${colors.border}; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;">
                <div style="background: ${colors.bgGray}; padding: 10px 14px; border-bottom: 1px solid ${colors.border};">
                    <h3 style="font-family: 'Roboto', sans-serif; font-size: 11px; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">Tekst</h3>
                </div>
                <div style="font-family: 'Roboto', sans-serif; font-size: 11px; line-height: 1.4; color: ${colors.textMain}; white-space: pre-wrap; padding: 14px;">${(song.lyrics || '').trim() || '<span style="color:#9ca3af; font-style:italic;">Brak tekstu</span>'}</div>
            </div>
          </div>

          <!-- Chords Card -->
          <div>
            <div style="background: white; border: 1px solid ${colors.border}; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;">
                <div style="background: ${colors.primaryLight}; padding: 10px 14px; border-bottom: 1px solid ${colors.primaryBorder};">
                    <h3 style="font-family: 'Roboto', sans-serif; font-size: 11px; font-weight: 700; color: ${colors.primary}; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">Akordy</h3>
                </div>
                <div style="padding: 14px; font-size: 11px; line-height: 1.4; color: ${colors.textMain}; white-space: pre-wrap; font-family: 'Roboto', sans-serif; font-weight: 600;">${formatChordsText((song.finalChords || '').trim())}</div>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  };

  return `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Program nabożeństwa</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap');
        
        /* Marginesy A4 i szerokości */
        @page { size: A4; margin: 15mm; margin-bottom: 20mm; }
        
        @media print { 
           body { margin: 0; padding: 0; background: white; font-family: 'Roboto', sans-serif !important; -webkit-print-color-adjust: exact; } 
           /* FIX STOPKI: Fixed w media print działa poprawnie tylko jako bezpośrednie dziecko body */
           .footer-print { position: fixed; bottom: 0; left: 0; right: 0; display: block !important; }
           .container { margin-bottom: 40px; }
           .page-1 { page-break-after: always; }
           .sections-wrapper { page-break-before: always; }
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif; background: white; }
        body { color: ${colors.textMain}; line-height: 1.5; }
        
        .container { max-width: 180mm; margin: 0 auto; padding: 0; background: white; padding-bottom: 50px; }
        
        /* Header */
        .header {
            margin-bottom: 60px;
            padding-bottom: 0;
            border-bottom: none;
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 24px;
        }
        .header-content {
            flex: 1;
        }
        .header-content .subtitle {
            font-size: 11px;
            color: ${colors.textMuted};
            font-weight: 600;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 12px;
        }
        .header-content h1 {
            font-family: 'Roboto', sans-serif;
            font-size: 36px;
            font-weight: 900;
            color: ${colors.textMain};
            margin: 0;
            letter-spacing: -1px;
            line-height: 1;
        }
        .date-badge {
            background-color: ${colors.primaryLight};
            color: ${colors.primary};
            font-family: 'Roboto', sans-serif;
            font-size: 15px;
            font-weight: 700;
            padding: 14px 24px;
            border-radius: 8px;
            border: 2px solid ${colors.primaryBorder};
            white-space: nowrap;
        }
        .date-badge span {
            display: inline-block;
            position: relative;
            top: -5px;
        }


        /* CSS STOPKA (dla window.print) */
        .footer-print {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            text-align: center;
            font-size: 10px;
            color: ${colors.textMuted};
            padding: 10px;
            background-color: white;
            border-top: 1px solid ${colors.border};
            font-family: 'Roboto', sans-serif;
            z-index: 1000;
        }


        .page-1 { page-break-after: always; }
        .sections-wrapper { page-break-before: always; margin-bottom: 48px; }
      </style>
    </head>
    <body>
      <!-- STOPKA POZA KONTENEREM -->
      <div class="footer-print">
          Wygenerowano w App SchWro Południe
      </div>


      <div class="container">
        <!-- STRONA 1 -->
        <div class="page-1">
          <div class="header">
            <div class="header-top">
                <div class="header-content">
                    <div class="subtitle">App SchWro Południe</div>
                    <h1>Program nabożeństwa</h1>
                </div>
                <div class="date-badge"><span>${formatDateFull(program.date)}</span></div>
            </div>
          </div>
          ${renderScheduleTable()}
        </div>


        <!-- STRONA 2 -->
        <div class="sections-wrapper">
           <div style="margin-bottom: 32px;">
                <h2 style="font-family: 'Roboto', sans-serif; font-size: 24px; font-weight: 800; color: ${colors.textMain}; margin-bottom: 8px;">Służby i Zespoły</h2>
                <p style="color: ${colors.textMuted}; font-size: 14px;">Szczegółowy podział obowiązków na dzisiejsze nabożeństwo.</p>
           </div>
          ${renderSections()}
        </div>


        <!-- STRONY 3+ -->
        ${renderSongsPages()}
      </div>
    </body>
    </html>
  `;
};

export const generatePDF = async (program, songsMap, teamRoles = {}) => {
  const htmlContent = getPDFHtmlContent(program, songsMap, teamRoles);

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  const page1Div = doc.querySelector('.page-1');
  const sectionsDiv = doc.querySelector('.sections-wrapper');

  // Znajdź tylko niepuste kontenery pieśni (div z page-break-before i treścią)
  const allSongDivs = doc.querySelectorAll('[style*="page-break-before"]');
  const songPages = Array.from(allSongDivs).filter(div => {
    const text = div.textContent?.trim();
    return text && text.length > 50; // Minimalna długość treści pieśni
  });

  const pdf = new jsPDF('p', 'mm', 'a4');
  const a4Width = 210;
  const a4Height = 297;
  let pageNumber = 1;

  const renderSection = async (element) => {
    if (!element) return;

    // Sprawdź czy element ma jakąś treść (nie jest pusty)
    const textContent = element.textContent?.trim();
    if (!textContent || textContent.length === 0) {
      console.log('Pomijam pusty element');
      return;
    }

    const container = document.createElement('div');

    // Skopiuj pełny HTML razem ze stylami
    const wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;
    const styleTag = wrapper.querySelector('style');

    if (styleTag) {
      container.appendChild(styleTag.cloneNode(true));
    }

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = element.innerHTML;
    container.appendChild(contentDiv);

    // STYLIZACJA KONTENERA - FIX DARK MODE & FONT
    container.style.position = 'absolute';
    container.style.left = '-10000px';
    container.style.width = '210mm';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#1e293b';
    container.style.padding = '20px';
    container.style.fontFamily = "'Roboto', sans-serif";

    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
            clonedDoc.documentElement.classList.remove('dark');
            clonedDoc.body.classList.remove('dark');
            clonedDoc.documentElement.style.backgroundColor = '#ffffff';
            clonedDoc.body.style.backgroundColor = '#ffffff';
            clonedDoc.body.style.color = '#1e293b';
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const imgHeight = (canvas.height * a4Width) / canvas.width;

      // Sprawdź czy wysokość nie jest zbyt mała (pusta strona)
      if (imgHeight < 50) {
        console.log('Pomijam stronę - zbyt mała wysokość');
        return;
      }

      if (pageNumber > 1) pdf.addPage();

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, 0, a4Width, Math.min(imgHeight, a4Height));

      heightLeft -= a4Height;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, a4Width, a4Height);
        heightLeft -= a4Height;
      }

      pageNumber++;
    } finally {
      document.body.removeChild(container);
    }
  };

  try {
    if (page1Div) await renderSection(page1Div);
    if (sectionsDiv) await renderSection(sectionsDiv);

    // Renderuj wszystkie pieśni razem, każda na osobnej stronie PDF
    if (songPages.length > 0) {
      for (const songPage of songPages) {
        // Sprawdź czy pieśń ma jakąkolwiek treść przed renderowaniem
        const hasContent = songPage.textContent?.trim().length > 0;
        if (hasContent) {
          await renderSection(songPage);
        } else {
          console.log('Pomijam pustą pieśń');
        }
      }
    }

    pdf.save(`${program.name || 'Program'}.pdf`);
    return pdf;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

export const generatePDFBase64 = async (program, songsMap) => {
  let htmlContent = getPDFHtmlContent(program, songsMap);
  htmlContent = htmlContent.replace('</head>', '<style>.footer-print { display: none !important; }</style></head>');

  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';
  
  try {
    const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
    const binary = new Uint8Array(fontBytes);
    let binaryString = '';
    for (let i = 0; i < binary.length; i++) {
      binaryString += String.fromCharCode(binary[i]);
    }
    const base64Font = btoa(binaryString);
    
    doc.addFileToVFS("Roboto-Regular.ttf", base64Font);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto");
  } catch (error) {
    console.warn('Nie udało się załadować czcionki, używam domyślnej', error);
  }

  return new Promise((resolve, reject) => {
    try {
      doc.html(htmlContent, {
        callback: function (doc) {
          const totalPages = doc.internal.getNumberOfPages();
          doc.setFont("Roboto", "normal");
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          
          for (let i = 1; i <= totalPages; i++) {
             doc.setPage(i);
             doc.text("Wygenerowano w App SchWro Południe", 105, 290, { align: "center" });
          }

          const dataUri = doc.output('datauristring');
          const base64 = dataUri.split(',')[1];
          resolve(base64);
        },
        x: 0,
        y: 0,
        width: 210,
        windowWidth: 800
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const downloadPDF = async (program, songsMap, teamRoles = {}) => {
  return generatePDF(program, songsMap, teamRoles);
};

export const savePDFToSupabase = async (program, songsMap, teamRoles = {}) => {
  try {
    const htmlContent = getPDFHtmlContent(program, songsMap, teamRoles);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const page1Div = doc.querySelector('.page-1');
    const sectionsDiv = doc.querySelector('.sections-wrapper');

    // Znajdź tylko niepuste kontenery pieśni (div z page-break-before i treścią)
    const allSongDivs = doc.querySelectorAll('[style*="page-break-before"]');
    const songPages = Array.from(allSongDivs).filter(div => {
      const text = div.textContent?.trim();
      return text && text.length > 50; // Minimalna długość treści pieśni
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const a4Width = 210;
    const a4Height = 297;
    let pageNumber = 1;

    const renderSection = async (element) => {
      if (!element) return;

      // Sprawdź czy element ma jakąś treść (nie jest pusty)
      const textContent = element.textContent?.trim();
      if (!textContent || textContent.length === 0) {
        console.log('Pomijam pusty element');
        return;
      }

      const container = document.createElement('div');

      // Skopiuj pełny HTML razem ze stylami
      const wrapper = document.createElement('div');
      wrapper.innerHTML = htmlContent;
      const styleTag = wrapper.querySelector('style');

      if (styleTag) {
        container.appendChild(styleTag.cloneNode(true));
      }

      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = element.innerHTML;
      container.appendChild(contentDiv);

      // FIX DARK MODE
      container.style.position = 'absolute';
      container.style.left = '-10000px';
      container.style.width = '210mm';
      container.style.backgroundColor = '#ffffff';
      container.style.color = '#1e293b';
      container.style.padding = '20px';
      container.style.fontFamily = "'Roboto', sans-serif";

      document.body.appendChild(container);

      try {
        const canvas = await html2canvas(container, {
          scale: 1.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: (clonedDoc) => {
              clonedDoc.documentElement.classList.remove('dark');
              clonedDoc.body.classList.remove('dark');
              clonedDoc.documentElement.style.backgroundColor = '#ffffff';
              clonedDoc.body.style.backgroundColor = '#ffffff';
              clonedDoc.body.style.color = '#1e293b';
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const imgHeight = (canvas.height * a4Width) / canvas.width;

        // Sprawdź czy wysokość nie jest zbyt mała (pusta strona)
        if (imgHeight < 50) {
          console.log('Pomijam stronę - zbyt mała wysokość');
          return;
        }

        if (pageNumber > 1) pdf.addPage();

        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, 0, a4Width, Math.min(imgHeight, a4Height));

        heightLeft -= a4Height;
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, a4Width, a4Height);
          heightLeft -= a4Height;
        }

        pageNumber++;
      } finally {
        document.body.removeChild(container);
      }
    };

    if (page1Div) await renderSection(page1Div);
    if (sectionsDiv) await renderSection(sectionsDiv);

    // Renderuj wszystkie pieśni razem, każda na osobnej stronie PDF
    if (songPages.length > 0) {
      for (const songPage of songPages) {
        // Sprawdź czy pieśń ma jakąkolwiek treść przed renderowaniem
        const hasContent = songPage.textContent?.trim().length > 0;
        if (hasContent) {
          await renderSection(songPage);
        } else {
          console.log('Pomijam pustą pieśń');
        }
      }
    }

    const pdfBlob = pdf.output('blob');

    const dateStr = program.date.split('T')[0];
    const fileName = `Program-${dateStr}.pdf`;
    const filePath = `${program.id}/${fileName}`;

    const { data, error } = await supabase
      .storage
      .from('programs')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage.from('programs').getPublicUrl(filePath);

    return { success: true, path: filePath, url: publicUrlData.publicUrl };
  } catch (error) {
    console.error('Błąd uploadu PDF:', error);
    return { success: false, error };
  }
};
