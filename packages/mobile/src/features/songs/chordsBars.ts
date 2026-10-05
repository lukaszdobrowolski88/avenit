import { getNoteIndex, transposeChord } from '../../lib/domain';

// Rozpiska akordów (`songs.chords_bars`) — dwa zapisy w bazie:
//  • HTML z edytora taktów weba: takty <span class="bar">, akordy <span data-chord="D/F#">
//    z częściami w osobnych spanach (prima, znak, modyfikator, „/”, bas),
//  • zwykły tekst, np. „zwr.\n|  e |  e  |” (mała litera = akord molowy).
// Transpozycja zmienia WYŁĄCZNIE akordy: etykiety ([REFREN], „zwr.”) i znaczniki zostają.

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const isHtml = (s: string) => /<\s*(div|span|b|i|font|br|p)\b/i.test(s);

// Akord jako osobne słowo: prima (A–G, opcjonalnie #/b), modyfikator, opcjonalny bas.
// Małe litery (a–g) = zapis molowy („e” = e-moll).
const CHORD_TOKEN =
  /(^|[^A-Za-z0-9#À-ſ])([A-Ga-g](?:#|b)?)((?:maj|min|m|M|sus|add|dim|aug|\+|°|ø)?\d*(?:\([^)]*\))?(?:(?:sus|add|maj)\d+)*)(\/[A-G](?:#|b)?)?(?=$|[^A-Za-z0-9#À-ſ])/g;

const shiftToken = (root: string, rest: string, bass: string, from: string, to: string) => {
  const minorLower = root[0] === root[0].toLowerCase();
  const chord = `${root[0].toUpperCase()}${root.slice(1)}${rest}${bass}`;
  const out = transposeChord(chord, from, to);
  return minorLower ? out.replace(/^[A-G](#|b)?/, (m) => m.toLowerCase()) : out;
};

const canTranspose = (from: string | null, to: string | null) =>
  !!from && !!to && from !== to && getNoteIndex(from) !== -1 && getNoteIndex(to) !== -1;

// Akord sformatowany jak na webie (formatAllChordsInContent): większa prima, mniejsze znaki.
const formatChordHtml = (chord: string, base: number) => {
  const m = chord.match(/^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/);
  if (!m) return `<span data-chord="${escapeHtml(chord)}"><b>${escapeHtml(chord)}</b></span>`;
  const [, r, acc, mod, bass, bassAcc] = m;
  const mods = base - 2;
  const bs = base - 1;
  let html = `<span style="font-size:${base}px;font-weight:bold;">${r}</span>`;
  if (acc) html += `<span style="font-size:${mods}px;">${acc}</span>`;
  if (mod) html += `<span style="font-size:${mods}px;">${escapeHtml(mod)}</span>`;
  if (bass) {
    html += `<span style="font-size:${bs}px;">/</span><span style="font-size:${bs}px;font-weight:bold;">${bass}</span>`;
    if (bassAcc) html += `<span style="font-size:${base - 3}px;">${bassAcc}</span>`;
  }
  return `<span data-chord="${escapeHtml(chord)}">${html}</span>`;
};

// Akordy w zwykłym tekście (poza znacznikami) — pogrubione, opcjonalnie transponowane.
const markText = (text: string, from: string | null, to: string | null) =>
  text.replace(CHORD_TOKEN, (_all, pre: string, root: string, rest: string, bass: string | undefined) => {
    const out = canTranspose(from, to) ? shiftToken(root, rest, bass ?? '', from!, to!) : `${root}${rest}${bass ?? ''}`;
    return `${pre}<b class="ch">${escapeHtml(out)}</b>`;
  });

const DATA_CHORD = /<span data-chord="([^"]*)">((?:<span[^>]*>[^<]*<\/span>)*)<\/span>/g;

export const renderChordsBars = (src: string, from: string | null, to: string | null): string => {
  if (!isHtml(src)) return `<div class="plain">${markText(escapeHtml(src), from, to)}</div>`;
  // 1) Akordy z edytora weba odkładamy (ich części to osobne spany — nie wolno ich ruszać
  //    przebiegiem po tekście), 2) tekst poza znacznikami, 3) akordy z powrotem, transponowane.
  const saved: string[] = [];
  const masked = src.replace(DATA_CHORD, (_all, chord: string, inner: string) => {
    const size = Number(inner.match(/font-size:\s*(\d+)px/)?.[1] ?? 14);
    const decoded = chord.replace(/&amp;/g, '&');
    const out = canTranspose(from, to) ? transposeChord(decoded, from!, to!) : decoded;
    saved.push(formatChordHtml(out, size));
    return `\u0000${saved.length - 1}\u0000`;
  });
  const text = masked
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') ? part : markText(part, from, to)))
    .join('');
  return text.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => saved[Number(i)] ?? '');
};

// Dokument dla WebView: kolory marki, skala (viewport initial-scale), wysokość raportowana do apki.
export const chordsDocument = (body: string, scale: number) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=${scale}, maximum-scale=${scale}, user-scalable=no">
<style>
  html,body{margin:0;padding:0;background:transparent;}
  body{padding:4px 2px 12px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#2A2312;font-size:14px;line-height:1.55;-webkit-text-size-adjust:none;}
  .wrap{white-space:pre-wrap;word-wrap:break-word;}
  .plain{font-family:Menlo,monospace;white-space:pre-wrap;}
  [data-chord],b.ch{color:#8A6606;}
  .bar{border-color:#B9B09C !important;}
</style></head><body><div class="wrap">${body}</div>
<script>
  // Wysokość samej treści w px CSS (documentElement.scrollHeight byłby co najmniej wysokością
  // okna); skalę (viewport initial-scale) dolicza aplikacja.
  function h(){ var w = document.querySelector('.wrap'); if (window.ReactNativeWebView && w) window.ReactNativeWebView.postMessage(String(Math.ceil(w.offsetTop + w.offsetHeight + 12))); }
  window.addEventListener('load', h); setTimeout(h, 50); setTimeout(h, 400);
</script></body></html>`;
