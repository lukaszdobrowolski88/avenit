import { supabase } from './supabase';

// Domyślne URL-e dla grafik PPT (można zmienić na URL-e z Supabase Storage)
const DEFAULT_GRAPHICS = {
  titleSlide: null,      // zalacznik1.png - slajd tytułowy
  transitionSlide: null, // zalacznik2.png - slajd przejściowy między pieśniami
  songBackground: null   // piesn.png - tło dla tekstów pieśni
};

// Funkcja pomocnicza do znajdowania grafiki w serii po nazwie
const findGraphicByName = (graphics, searchName) => {
  if (!graphics || !Array.isArray(graphics)) return null;

  const searchTerms = searchName.toLowerCase().split('.');
  const baseName = searchTerms[0];

  const found = graphics.find(g => {
    const gName = (g.name || '').toLowerCase();
    return gName.includes(baseName) || gName === searchName.toLowerCase();
  });

  return found?.url || null;
};

export const generatePPT = async (program, songsMap) => {
  const printWindow = window.open('', '', 'width=1000,height=700');

  if (!printWindow) {
    alert('Nie można otworzyć nowego okna. Sprawdź czy przeglądarka nie blokuje wyskakujących okien.');
    return;
  }

  // Pokaż loading
  printWindow.document.write('<html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial;"><h1>Ładowanie prezentacji...</h1></body></html>');

  // Pobierz dane serii jeśli program ma series_id
  let seriesGraphics = {
    titleSlide: DEFAULT_GRAPHICS.titleSlide,
    transitionSlide: DEFAULT_GRAPHICS.transitionSlide,
    songBackground: DEFAULT_GRAPHICS.songBackground
  };

  const seriesId = program.teaching?.series_id;

  if (seriesId) {
    try {
      const { data: series, error } = await supabase
        .from('teaching_series')
        .select('*')
        .eq('id', seriesId)
        .single();

      if (!error && series?.graphics) {
        // Szukaj grafik po nazwie w tablicy graphics serii
        // zalacznik1.png lub podobne nazwy dla slajdu tytułowego
        seriesGraphics.titleSlide = findGraphicByName(series.graphics, 'zalacznik1')
          || findGraphicByName(series.graphics, 'tytul')
          || findGraphicByName(series.graphics, 'title')
          || series.graphics[0]?.url; // fallback na pierwszą grafikę

        // zalacznik2.png dla slajdów przejściowych
        seriesGraphics.transitionSlide = findGraphicByName(series.graphics, 'zalacznik2')
          || findGraphicByName(series.graphics, 'przejscie')
          || findGraphicByName(series.graphics, 'transition');

        // piesn.png dla tła pieśni
        seriesGraphics.songBackground = findGraphicByName(series.graphics, 'piesn')
          || findGraphicByName(series.graphics, 'song')
          || findGraphicByName(series.graphics, 'lyrics')
          || findGraphicByName(series.graphics, 'tlo');
      }
    } catch (err) {
      console.error('Błąd pobierania serii:', err);
    }
  }

  // Pobierz unikalne pieśni w kolejności z programu
  const orderedSongIds = [];
  const seenIds = new Set();

  (program.schedule || []).forEach(item => {
    if (item.selectedSongs?.length > 0) {
      item.selectedSongs.forEach(s => {
        const songId = s.songId || s.id;
        if (songId && !seenIds.has(songId)) {
          seenIds.add(songId);
          orderedSongIds.push(songId);
        }
      });
    }
    if (item.songIds?.length > 0) {
      item.songIds.forEach(id => {
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          orderedSongIds.push(id);
        }
      });
    }
  });

  let slidesHtml = '';

  // Formatowanie daty
  const formattedDate = program.date ? new Date(program.date).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : '';

  // === SLAJD TYTUŁOWY (tylko grafika zalacznik1, bez tekstu) ===
  if (seriesGraphics.titleSlide) {
    slidesHtml += `
      <div class="slide title-slide" style="background-image: url('${seriesGraphics.titleSlide}'); background-size: cover; background-position: center;">
      </div>
    `;
  } else {
    slidesHtml += `
      <div class="slide title-slide">
      </div>
    `;
  }

  // Generuj slajdy dla pieśni
  orderedSongIds.forEach((id, songIndex) => {
    const song = songsMap[id];
    if (!song) return;

    // === SLAJD PRZEJŚCIOWY (przed każdą pieśnią - grafika zalacznik2, bez tytułu) ===
    if (seriesGraphics.transitionSlide) {
      slidesHtml += `
        <div class="slide transition-slide" style="background-image: url('${seriesGraphics.transitionSlide}'); background-size: cover; background-position: center;">
        </div>
      `;
    }

    // === SLAJDY Z TEKSTEM PIEŚNI ===
    const lyrics = song.lyrics || '';
    const sections = lyrics.split(/\n\s*\n/);

    sections.forEach(section => {
      const trimmedSection = section.trim();

      // Sprawdź czy sekcja zawiera "pusty slajd" - jeśli tak, nie pokazuj tekstu
      const isPustySlajd = trimmedSection.toLowerCase().includes('pusty slajd');
      const displayText = isPustySlajd ? '' : trimmedSection;

      if (seriesGraphics.songBackground) {
        // Slajd z tłem - bez overlay, 100% oryginalna grafika
        slidesHtml += `
          <div class="slide content with-bg" style="background-image: url('${seriesGraphics.songBackground}'); background-size: cover; background-position: center;">
            ${displayText ? `<div class="text">${displayText.replace(/\n/g, '<br/>')}</div>` : ''}
          </div>
        `;
      } else {
        // Slajd bez tła
        slidesHtml += `
          <div class="slide content">
            ${displayText ? `<div class="text">${displayText.replace(/\n/g, '<br/>')}</div>` : ''}
          </div>
        `;
      }
    });

    // === PUSTY SLAJD MIĘDZY PIEŚNIAMI (po każdej pieśni oprócz ostatniej) ===
    if (songIndex < orderedSongIds.length - 1) {
      if (seriesGraphics.songBackground) {
        slidesHtml += `
          <div class="slide content with-bg" style="background-image: url('${seriesGraphics.songBackground}'); background-size: cover; background-position: center;">
          </div>
        `;
      } else {
        slidesHtml += `
          <div class="slide content">
          </div>
        `;
      }
    }
  });

  // Informacja gdy brak pieśni
  if (orderedSongIds.length === 0) {
    slidesHtml += `
      <div class="slide content">
        <div class="text" style="color: #888;">Brak pieśni w programie</div>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Prezentacja - ${formattedDate}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #000; color: white; font-family: 'Segoe UI', Arial, sans-serif; }

          .slide {
            height: 100vh;
            width: 100vw;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            page-break-after: always;
            position: relative;
            overflow: hidden;
          }

          /* Slajd tytułowy - tylko grafika */
          .title-slide {
            background: #000;
          }

          /* Slajd przejściowy - tylko grafika */
          .transition-slide {
            background: #000;
          }

          /* Slajd z tekstem */
          .content {
            background: #000;
          }
          .content .text {
            font-size: 48px;
            line-height: 1.5;
            font-weight: 600;
            max-width: 90%;
            text-shadow: 0 2px 10px rgba(0,0,0,0.8);
          }

          /* Instrukcje */
          .no-print {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #1f2937;
            color: white;
            padding: 24px;
            border-radius: 12px;
            font-size: 14px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            z-index: 1000;
          }
          .no-print p { margin: 0 0 8px 0; }
          .no-print p:last-child { margin: 0; }
          .no-print strong { color: #60a5fa; }

          @media print {
            .slide { border: none; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${slidesHtml}
        <div class="no-print">
          <p style="font-weight:600; font-size:16px; margin-bottom:12px;">Jak zapisać jako PDF:</p>
          <p>1. Naciśnij <strong>Ctrl+P</strong> (lub Cmd+P)</p>
          <p>2. Wybierz <strong>"Zapisz jako PDF"</strong></p>
          <p>3. Otwórz PDF w PowerPoint</p>
          <hr style="border:none; border-top:1px solid #374151; margin:12px 0;">
          <p style="color:#9ca3af; font-size:12px;">Lub użyj rozszerzenia do konwersji HTML→PPT</p>
        </div>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};
