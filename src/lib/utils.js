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

export const DEFAULT_PDF_OPTIONS = {
  sections: {
    schedule: true,
    teams: true,
    teamWorship: true,
    teamMedia: true,
    teamAtmosfera: true,
    teamScena: true,
    teamSzkolka: true,
    songs: true,
    programNotes: true,
  },
  scheduleColumns: {
    time: true,             // długość elementu (mm:ss)
    person: true,
    details: true,
    songKey: true,
  },
  songDetails: {
    tempo: true,
    meter: true,
    lyrics: true,
    chords: true,
  },
  pageSize: 'A4',           // 'A4' | 'Letter'
  orientation: 'p',         // 'p' (portrait) | 'l' (landscape)
  fontSize: 12,             // base body font size in pt
  showLogo: true,
  showCampus: true,         // pokaż nazwę kampusu w nagłówku
  colorAccents: true,       // when false, mute the gold accent throughout
  // Wstrzykiwane przez wywołującego (nie ma sensu w modalu):
  campusName: '',           // nazwa kampusu z bazy (np. "Piotrków Trybunalski")
  fileName: '',             // pełna nazwa pliku bez rozszerzenia
};

const mergePdfOptions = (options = {}) => ({
  ...DEFAULT_PDF_OPTIONS,
  ...options,
  sections: { ...DEFAULT_PDF_OPTIONS.sections, ...(options.sections || {}) },
  scheduleColumns: { ...DEFAULT_PDF_OPTIONS.scheduleColumns, ...(options.scheduleColumns || {}) },
  songDetails: { ...DEFAULT_PDF_OPTIONS.songDetails, ...(options.songDetails || {}) },
});

const getPDFHtmlContent = (program, songsMap, teamRoles = {}, options = {}) => {
  const opts = mergePdfOptions(options);
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
  
  const colors = opts.colorAccents ? {
    primary: '#a08847',      // Gold 600
    primaryLight: '#f5f0e3', // Gold 50
    primaryBorder: '#ddd0b0',// Gold 200
    sectionAccent: '#8a7340', // Dark Gold
    textMain: '#1e293b',
    textMuted: '#64748b',
    border: '#e2e8f0',
    bgGray: '#f8fafc'
  } : {
    primary: '#475569',      // Slate 600
    primaryLight: '#f1f5f9', // Slate 100
    primaryBorder: '#cbd5e1',// Slate 300
    sectionAccent: '#475569',
    textMain: '#1e293b',
    textMuted: '#64748b',
    border: '#e2e8f0',
    bgGray: '#f8fafc'
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
    const showTime = opts.scheduleColumns.time;
    const showPerson = opts.scheduleColumns.person;
    const showDetails = opts.scheduleColumns.details;
    const showKey = opts.scheduleColumns.songKey;

    const formatRowTime = (seconds) => {
      const total = Number(seconds) || 0;
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    };

    // Dynamiczne kolumny: Czas | Element | Osoba | Szczegóły
    const cols = [];
    if (showTime) cols.push({ key: 'time', label: 'Długość' });
    cols.push({ key: 'element', label: 'Element' });
    if (showPerson) cols.push({ key: 'person', label: 'Osoba Odpowiedzialna' });
    if (showDetails) cols.push({ key: 'details', label: 'Szczegóły / Pieśni' });

    const widthMap = (() => {
      // Pełne 4 kolumny: 10/20/30/40
      if (showTime && showPerson && showDetails) return { time: '10%', element: '20%', person: '30%', details: '40%' };
      if (!showTime && showPerson && showDetails) return { element: '20%', person: '35%', details: '45%' };
      if (showTime && !showPerson && showDetails) return { time: '12%', element: '28%', details: '60%' };
      if (showTime && showPerson && !showDetails) return { time: '12%', element: '28%', person: '60%' };
      if (!showTime && !showPerson && showDetails) return { element: '30%', details: '70%' };
      if (!showTime && showPerson && !showDetails) return { element: '30%', person: '70%' };
      if (showTime && !showPerson && !showDetails) return { time: '15%', element: '85%' };
      return { element: '100%' };
    })();

    const thStyle = `padding: 8px 12px; text-align: left; font-weight: 700; font-size: 10px; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; border-top: 1px solid ${colors.border}; border-bottom: 1px solid ${colors.border}; font-family: 'Roboto', sans-serif; vertical-align: middle;`;
    const tdBase = `padding: 8px 12px 10px 12px; border-bottom: 1px solid ${colors.border}; vertical-align: middle; word-wrap: break-word;`;

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
              ${cols.map(c => `<th style="width: ${widthMap[c.key]}; ${thStyle}">${c.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${program.schedule?.map((row) => `
              <tr style="border-bottom: 1px solid ${colors.border};">
                ${showTime ? `
                <td style="${tdBase} color: ${colors.textMuted}; font-size: 11px; font-family: 'Roboto', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; padding-right: 16px;">
                  <span style="display: inline-block; position: relative; top: -5px;">
                    ${formatRowTime(row.duration)}
                  </span>
                </td>` : ''}
                <td style="${tdBase} color: ${colors.textMain}; font-weight: 600; font-size: 12px; font-family: 'Roboto', sans-serif;">
                  <span style="display: inline-block; position: relative; top: -5px;">
                    ${row.element || row.title || '-'}
                  </span>
                </td>
                ${showPerson ? `
                <td style="${tdBase}">
                   ${row.person ? `
                    <span style="display: inline-block; background-color: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: 600; font-family: 'Roboto', sans-serif; vertical-align: middle;">
                        <span style="display: inline-block; position: relative; top: -5px;">${row.person}</span>
                    </span>
                   ` : `<span style="display: inline-block; position: relative; top: -5px; color: #cbd5e1; font-size: 11px;">-</span>`}
                </td>` : ''}
                ${showDetails ? `
                <td style="${tdBase}">
                  ${(row.element || '').toLowerCase().includes('uwielbienie') && row.selectedSongs?.length > 0 ?
                    `
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                      ${row.selectedSongs.map((s) => {
                        const song = songsMap[s.songId];
                        const songNum = songNumberMap[s.songId];
                        return song ? `
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; background-color: ${colors.primary}; color: white; border-radius: 50%; font-size: 9px; font-weight: 700;">
                                <span style="position: relative; top: -5px;">${songNum}</span>
                            </span>
                            <span style="font-size: 12px; font-weight: 500; color: ${colors.textMain}; font-family: 'Roboto', sans-serif;">
                              <span style="position: relative; top: -5px;">${song.title}</span>
                            </span>
                            ${showKey ? `
                            <span style="background-color: ${colors.primaryLight}; color: ${colors.primary}; padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 700; border: 1px solid ${colors.primaryBorder};">
                                <span style="position: relative; top: -5px;">${s.key}</span>
                            </span>` : ''}
                          </div>
                        ` : '';
                      }).join('')}
                    </div>`
                    : `
                    <span style="display: inline-block; position: relative; top: -5px; color: ${colors.textMuted}; font-size: 12px; font-family: 'Roboto', sans-serif;">
                        ${row.details || '-'}
                    </span>
                    `}
                </td>` : ''}
              </tr>
            `).join('') || ''}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderProgramNotes = () => {
    if (!opts.sections.programNotes) return '';
    const notes = (program.notes || program.globalNotes || '').trim();
    if (!notes) return '';
    const escaped = notes
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `
      <div style="margin-top: 24px; padding: 16px 18px; background: ${colors.bgGray}; border-left: 4px solid ${colors.primary}; border-radius: 6px;">
        <h3 style="font-family: 'Roboto', sans-serif; font-size: 11px; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 8px 0;">Notatka do programu</h3>
        <div style="font-family: 'Roboto', sans-serif; font-size: 12px; color: ${colors.textMain}; white-space: pre-wrap; line-height: 1.5;">${escaped}</div>
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
      { title: 'Atmosfera Team', data: program.atmosfera_team, fields: atmosferaFields, enabled: opts.sections.teamAtmosfera },
      { title: 'MediaTeam', data: program.produkcja, fields: mediaFields, enabled: opts.sections.teamMedia },
      { title: 'Scena', data: scenaData, fields: scenaFields, enabled: opts.sections.teamScena },
      { title: 'Szkółka Niedzielna', data: program.szkolka, fields: szkolkaFields, enabled: opts.sections.teamSzkolka },
      { title: 'Zespół Uwielbienia', data: program.zespol, fields: worshipFields, enabled: opts.sections.teamWorship }
    ];

    return sectionConfigs.filter(s => s.enabled).map(section => {
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

    const showLyrics = opts.songDetails.lyrics;
    const showChords = opts.songDetails.chords;
    const showTempo = opts.songDetails.tempo;
    const showMeter = opts.songDetails.meter;

    return allSongs.map((song) => {
      const bodyCols = [];
      if (showLyrics) bodyCols.push(`
          <div>
            <div style="background: white; border: 1px solid ${colors.border}; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;">
                <div style="background: ${colors.bgGray}; padding: 10px 14px; border-bottom: 1px solid ${colors.border};">
                    <h3 style="font-family: 'Roboto', sans-serif; font-size: 11px; font-weight: 700; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">Tekst</h3>
                </div>
                <div style="font-family: 'Roboto', sans-serif; font-size: 11px; line-height: 1.4; color: ${colors.textMain}; white-space: pre-wrap; padding: 14px;">${(song.lyrics || '').trim() || '<span style="color:#9ca3af; font-style:italic;">Brak tekstu</span>'}</div>
            </div>
          </div>`);
      if (showChords) bodyCols.push(`
          <div>
            <div style="background: white; border: 1px solid ${colors.border}; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden;">
                <div style="background: ${colors.primaryLight}; padding: 10px 14px; border-bottom: 1px solid ${colors.primaryBorder};">
                    <h3 style="font-family: 'Roboto', sans-serif; font-size: 11px; font-weight: 700; color: ${colors.primary}; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">Akordy</h3>
                </div>
                <div style="padding: 14px; font-size: 11px; line-height: 1.4; color: ${colors.textMain}; white-space: pre-wrap; font-family: 'Roboto', sans-serif; font-weight: 600;">${formatChordsText((song.finalChords || '').trim())}</div>
            </div>
          </div>`);

      // Pomijamy całą stronę pieśni jeśli nic nie ma być pokazane (poza nagłówkiem) - zachowujemy nagłówek tylko gdy choć jeden szczegół włączony
      if (bodyCols.length === 0) return '';

      return `
      <div style="page-break-before: always; page-break-inside: avoid; padding: 20px 0 40px 0;">
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
                     ${showTempo && song.tempo ? `
                     <div style="background: ${colors.bgGray}; border: 1px solid ${colors.border}; padding: 8px 16px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 10px; text-transform: uppercase; color: ${colors.textMuted}; font-weight: 600; letter-spacing: 0.5px;">Tempo</div>
                        <div style="font-size: 18px; font-weight: 700; color: ${colors.textMain};">${song.tempo}</div>
                     </div>` : ''}
                     ${showMeter && song.meter ? `
                     <div style="background: ${colors.bgGray}; border: 1px solid ${colors.border}; padding: 8px 16px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 10px; text-transform: uppercase; color: ${colors.textMuted}; font-weight: 600; letter-spacing: 0.5px;">Metrum</div>
                        <div style="font-size: 18px; font-weight: 700; color: ${colors.textMain};">${song.meter}</div>
                     </div>` : ''}
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: ${bodyCols.length === 2 ? '1fr 1fr' : '1fr'}; gap: 20px;">
          ${bodyCols.join('')}
        </div>
      </div>
    `;}).join('');
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
          Wygenerowano w Avenit
      </div>


      <div class="container">
        ${opts.sections.schedule ? `
        <!-- STRONA 1 -->
        <div class="page-1">
          <div class="header">
            <div class="header-top">
                <div class="header-content">
                    ${opts.showCampus && opts.campusName ? `<div class="subtitle">${opts.campusName}</div>` : ''}
                    <h1>${program.title || 'Program nabożeństwa'}</h1>
                </div>
                <div class="date-badge"><span>${formatDateFull(program.date)}</span></div>
            </div>
          </div>
          ${renderScheduleTable()}
          ${renderProgramNotes()}
        </div>` : ''}


        ${opts.sections.teams ? `
        <!-- STRONA 2 -->
        <div class="sections-wrapper">
           <div style="margin-bottom: 32px;">
                <h2 style="font-family: 'Roboto', sans-serif; font-size: 24px; font-weight: 800; color: ${colors.textMain}; margin-bottom: 8px;">Służby i Zespoły</h2>
                <p style="color: ${colors.textMuted}; font-size: 14px;">Szczegółowy podział obowiązków na dzisiejsze nabożeństwo.</p>
           </div>
          ${renderSections()}
        </div>` : ''}


        ${opts.sections.songs ? `
        <!-- STRONY 3+ -->
        ${renderSongsPages()}
        ` : ''}
      </div>
    </body>
    </html>
  `;
};

export const generatePDF = async (program, songsMap, teamRoles = {}, options = {}) => {
  const opts = mergePdfOptions(options);
  const htmlContent = getPDFHtmlContent(program, songsMap, teamRoles, opts);

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

  const format = opts.pageSize === 'Letter' ? 'letter' : 'a4';
  const pdf = new jsPDF(opts.orientation === 'l' ? 'l' : 'p', 'mm', format);
  const a4Width = pdf.internal.pageSize.getWidth();
  const a4Height = pdf.internal.pageSize.getHeight();
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

    container.style.position = 'absolute';
    container.style.left = '-10000px';
    container.style.width = `${a4Width}mm`;
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#1e293b';
    container.style.padding = '20px';
    container.style.fontFamily = "'Roboto', sans-serif";
    container.style.fontSize = `${opts.fontSize}px`;

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

      if (imgHeight < 50) return;

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

    if (songPages.length > 0) {
      for (const songPage of songPages) {
        const hasContent = songPage.textContent?.trim().length > 0;
        if (hasContent) await renderSection(songPage);
      }
    }

    const baseName = (opts.fileName || program.title || program.name || 'Program').toString().trim();
    pdf.save(`${baseName || 'Program'}.pdf`);
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
             doc.text("Wygenerowano w Avenit", 105, 290, { align: "center" });
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

export const downloadPDF = async (program, songsMap, teamRoles = {}, options = {}) => {
  return generatePDF(program, songsMap, teamRoles, options);
};

export const savePDFToSupabase = async (program, songsMap, teamRoles = {}, options = {}) => {
  try {
    const opts = mergePdfOptions(options);
    const htmlContent = getPDFHtmlContent(program, songsMap, teamRoles, opts);

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

    const format = opts.pageSize === 'Letter' ? 'letter' : 'a4';
    const pdf = new jsPDF(opts.orientation === 'l' ? 'l' : 'p', 'mm', format);
    const a4Width = pdf.internal.pageSize.getWidth();
    const a4Height = pdf.internal.pageSize.getHeight();
    let pageNumber = 1;

    const renderSection = async (element) => {
      if (!element) return;

      const textContent = element.textContent?.trim();
      if (!textContent || textContent.length === 0) return;

      const container = document.createElement('div');

      const wrapper = document.createElement('div');
      wrapper.innerHTML = htmlContent;
      const styleTag = wrapper.querySelector('style');

      if (styleTag) {
        container.appendChild(styleTag.cloneNode(true));
      }

      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = element.innerHTML;
      container.appendChild(contentDiv);

      container.style.position = 'absolute';
      container.style.left = '-10000px';
      container.style.width = `${a4Width}mm`;
      container.style.backgroundColor = '#ffffff';
      container.style.color = '#1e293b';
      container.style.padding = '20px';
      container.style.fontFamily = "'Roboto', sans-serif";
      container.style.fontSize = `${opts.fontSize}px`;

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
