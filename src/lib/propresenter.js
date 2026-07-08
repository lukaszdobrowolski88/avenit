// ProPresenter Export - Generates Pro6 compatible playlist XML
// Pro6 format can be imported into ProPresenter 7

// Generate a UUID in the format ProPresenter expects
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16).toUpperCase();
  });
};

// Encode text to Base64 (for RTF content)
const encodeBase64 = (str) => {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    return btoa(str);
  }
};

// Convert plain text to RTF format
const textToRTF = (text) => {
  // Basic RTF wrapper
  const rtfContent = text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par\n');

  return `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639\\cocoasubrtf489
{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica-Bold;}
{\\colortbl;\\red255\\green255\\blue255;}
\\f0\\fs96\\b1 \\cf1 ${rtfContent}}`;
};

// Parse lyrics into slides (sections separated by empty lines)
const parseLyricsToSlides = (lyrics) => {
  if (!lyrics) return [];

  const sections = lyrics.split(/\n\s*\n/).filter(s => s.trim());
  return sections.map(section => section.trim());
};

// Generate a single slide XML
const generateSlideXML = (text, slideIndex, groupUUID) => {
  const slideUUID = generateUUID();
  const rtfData = encodeBase64(textToRTF(text));
  const plainText = encodeBase64(text);

  return `
      <RVDisplaySlide backgroundColor="0 0 0 1" enabled="1" highlightColor="0 0 0 0" hotKey="" label="" notes="" slideType="1" sort_index="${slideIndex}" UUID="${slideUUID}" drawingBackgroundColor="0" chordChartPath="" serialization-array-index="${slideIndex}">
        <cues containerClass="NSMutableArray"></cues>
        <displayElements containerClass="NSMutableArray">
          <RVTextElement displayDelay="0" displayName="Default" locked="0" persistent="0" typeID="0" fromTemplate="0" bezelRadius="0" drawingFill="0" drawingShadow="1" drawingStroke="0" fillColor="0 0 0 0" rotation="0" source="" adjustsHeightToFit="0" verticalAlignment="1" RTFData="${rtfData}" revealType="0" serialization-array-index="0">
            <_-RVRect3D-_position x="20" y="20" z="0" width="1880" height="1040"></_-RVRect3D-_position>
            <_-D-_shadow>
              <NSMutableDictionary>
                <NSNumber serialization-native-value="5" serialization-dictionary-key="shadowBlurRadius"></NSNumber>
                <NSColor serialization-native-value="0 0 0 1" serialization-dictionary-key="shadowColor"></NSColor>
                <NSMutableString serialization-native-value="{2, -2}" serialization-dictionary-key="shadowOffset"></NSMutableString>
              </NSMutableDictionary>
            </_-D-_shadow>
            <stroke containerClass="NSMutableDictionary"></stroke>
            <PlainText>${plainText}</PlainText>
          </RVTextElement>
        </displayElements>
        <elements containerClass="NSMutableArray"></elements>
      </RVDisplaySlide>`;
};

// Generate a song presentation XML
const generateSongXML = (song, songKey) => {
  const uuid = generateUUID();
  const slides = parseLyricsToSlides(song.lyrics);
  const displayKey = songKey || song.key || '';
  const titleWithKey = displayKey ? `${song.title} (${displayKey})` : song.title;

  const slidesXML = slides.map((text, idx) =>
    generateSlideXML(text, idx, uuid)
  ).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<RVPresentationDocument height="1080" width="1920" versionNumber="600" docType="0" creatorCode="1349676880" lastDateUsed="" usedCount="0" category="Song" resourcesDirectory="" backgroundColor="0 0 0 1" drawingBackgroundColor="0" notes="" artist="${song.author || ''}" author="" album="" CCLIDisplay="0" CCLIArtistCredits="" CCLISongTitle="${song.title}" CCLIPublisher="" CCLICopyrightInfo="" CCLILicenseNumber="" chordChartPath="" os="1" buildNumber="6016" selectedArrangementID="" UUID="${uuid}">
  <timeline timeOffSet="0" selectedMediaTrackIndex="0" unitOfMeasure="60" duration="0" loop="0">
    <timeCues containerClass="NSMutableArray"></timeCues>
    <mediaTracks containerClass="NSMutableArray"></mediaTracks>
  </timeline>
  <groups containerClass="NSMutableArray">
    <RVSlideGrouping name="" uuid="${generateUUID()}" color="0 0 0 0" serialization-array-index="0">
      <slides containerClass="NSMutableArray">
        ${slidesXML}
      </slides>
    </RVSlideGrouping>
  </groups>
  <arrangements containerClass="NSMutableArray"></arrangements>
</RVPresentationDocument>`;
};

// Generate playlist XML with song references
const generatePlaylistXML = (program, songs, songsMap) => {
  const playlistUUID = generateUUID();
  const formattedDate = program.date ? new Date(program.date).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : 'Program';

  const playlistName = program.title || `Nabozenstow - ${formattedDate}`;

  // Collect all songs from schedule
  const scheduleSongs = [];
  (program.schedule || []).forEach((item, index) => {
    if (item.type === 'song' && item.songId) {
      const song = songsMap[item.songId];
      if (song) {
        scheduleSongs.push({
          song,
          songKey: item.songKey || song.key,
          index
        });
      }
    }
  });

  // Generate playlist items XML
  const itemsXML = scheduleSongs.map((s, idx) => {
    const itemUUID = generateUUID();
    const displayKey = s.songKey || '';
    const titleWithKey = displayKey ? `${s.song.title} (${displayKey})` : s.song.title;

    return `
    <RVPlaylistNode type="3" displayName="${titleWithKey}" action="0" UUID="${itemUUID}" isExpanded="0" serialization-array-index="${idx}">
      <children containerClass="NSMutableArray"></children>
    </RVPlaylistNode>`;
  }).join('');

  // Generate header items for non-song elements
  const headersXML = (program.schedule || [])
    .filter(item => item.type === 'header')
    .map((item, idx) => {
      const headerUUID = generateUUID();
      return `
    <RVPlaylistNode type="4" displayName="--- ${item.title || 'Sekcja'} ---" action="0" UUID="${headerUUID}" isExpanded="0" serialization-array-index="${scheduleSongs.length + idx}">
      <children containerClass="NSMutableArray"></children>
    </RVPlaylistNode>`;
    }).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<RVPlaylistDocument versionNumber="600" UUID="${playlistUUID}" os="1" buildNumber="6016">
  <RVPlaylistNode type="0" displayName="${playlistName}" action="0" UUID="${generateUUID()}" isExpanded="1" serialization-array-index="0">
    <children containerClass="NSMutableArray">
      ${itemsXML}
    </children>
  </RVPlaylistNode>
</RVPlaylistDocument>`;
};

// Main export function - creates a ZIP with playlist and songs
export const exportToProPresenter = async (program, songsMap) => {
  // Dynamic import of JSZip
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const formattedDate = program.date ? new Date(program.date).toISOString().split('T')[0] : 'program';
  const folderName = `ProPresenter_${formattedDate}`;

  // Create folder structure
  const folder = zip.folder(folderName);
  const songsFolder = folder.folder('Songs');

  // Collect songs from schedule
  const scheduleSongs = [];
  (program.schedule || []).forEach(item => {
    if (item.type === 'song' && item.songId) {
      const song = songsMap[item.songId];
      if (song && !scheduleSongs.find(s => s.song.id === song.id)) {
        scheduleSongs.push({
          song,
          songKey: item.songKey || song.key
        });
      }
    }
  });

  // Generate and add song files
  scheduleSongs.forEach(({ song, songKey }) => {
    const songXML = generateSongXML(song, songKey);
    const safeTitle = (song.title || 'Song').replace(/[^a-zA-Z0-9\u0080-\uFFFF\s-]/g, '').trim();
    songsFolder.file(`${safeTitle}.pro6`, songXML);
  });

  // Generate and add playlist file
  const playlistXML = generatePlaylistXML(program, scheduleSongs.map(s => s.song), songsMap);
  const playlistName = (program.title || 'Playlist').replace(/[^a-zA-Z0-9\u0080-\uFFFF\s-]/g, '').trim();
  folder.file(`${playlistName}.pro6pl`, playlistXML);

  // Generate README file with instructions
  const readme = `ProPresenter Export - ${program.title || 'Program'}
===========================================

Data: ${program.date || 'Brak daty'}

INSTRUKCJA IMPORTU:
-------------------

1. Otwórz ProPresenter 7
2. Przejdź do File > Import > Import Files...
3. Wybierz pliki .pro6 z folderu "Songs" - zostaną dodane do biblioteki
4. Zaimportuj plik .pro6pl jako playlistę

LUB:

1. Skopiuj pliki .pro6 do folderu biblioteki ProPresenter:
   - macOS: ~/Documents/ProPresenter/Libraries/
   - Windows: Dokumenty\\ProPresenter\\Libraries\\
2. Uruchom ponownie ProPresenter
3. Pieśni pojawią się w bibliotece

ZAWARTOŚĆ:
----------
${scheduleSongs.map(({ song, songKey }) => {
  const key = songKey || song.key || 'brak tonacji';
  return `- ${song.title} (${key})`;
}).join('\n')}

Utworzono przez Avenit
`;

  folder.file('README.txt', readme);

  // Generate ZIP and download
  const blob = await zip.generateAsync({ type: 'blob' });

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${folderName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { success: true, songsCount: scheduleSongs.length };
};

// Alternative: Export just the service order as text for manual entry
export const exportServiceOrderText = (program, songsMap) => {
  const formattedDate = program.date ? new Date(program.date).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : '';

  let text = `${program.title || 'Program'}\n`;
  text += `${formattedDate}\n`;
  text += '='.repeat(50) + '\n\n';

  (program.schedule || []).forEach((item, index) => {
    if (item.type === 'header') {
      text += `\n--- ${item.title || 'Sekcja'} ---\n\n`;
    } else if (item.type === 'song') {
      const song = item.songId ? songsMap[item.songId] : null;
      const title = song?.title || item.title || 'Pieśń';
      const key = item.songKey || song?.key || '';
      const keyStr = key ? ` (${key})` : '';
      text += `${index + 1}. ${title}${keyStr}\n`;
    } else {
      text += `${index + 1}. ${item.title || item.type}\n`;
    }
  });

  // Copy to clipboard
  navigator.clipboard.writeText(text).then(() => {
    alert('Lista pieśni skopiowana do schowka!\n\nMożesz wkleić ją w ProPresenter lub innym programie.');
  }).catch(() => {
    // Fallback - show in new window
    const win = window.open('', '', 'width=600,height=400');
    win.document.write(`<pre style="font-family:monospace;padding:20px;">${text}</pre>`);
  });

  return text;
};
