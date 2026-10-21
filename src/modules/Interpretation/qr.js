import qrcode from 'qrcode-generator';

// Kod QR jako SVG (skalowalny — ostry na plakacie A4). Generowany w przeglądarce, bez usług zewnętrznych.
// Zwraca znacznik <svg> albo '' przy błędzie (np. zbyt długi tekst).
export function qrSvg(text, { margin = 2, ecc = 'M' } = {}) {
  try {
    const qr = qrcode(0, ecc);
    qr.addData(String(text || ''));
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin, scalable: true });
  } catch {
    return '';
  }
}
