import { describe, it, expect } from 'vitest';
import { thumbUrl } from './imageThumb';

describe('thumbUrl', () => {
  it('dokleja ?w= dla zdjęć z naszego /storage (×2 pod Retina)', () => {
    expect(thumbUrl('https://schwro.avenit.pl/storage/public-assets/avatar-1-2.jpg', 40)).toBe('https://schwro.avenit.pl/storage/public-assets/avatar-1-2.jpg?w=96');
    expect(thumbUrl('/storage/public-assets/a.PNG', 24)).toBe('/storage/public-assets/a.PNG?w=48');
    expect(thumbUrl('/storage/public-assets/a.webp', 500)).toBe('/storage/public-assets/a.webp?w=256');
  });
  it('nie rusza obcych adresów, podpisanych linków ani innych typów plików', () => {
    const supa = 'https://x.supabase.co/storage/v1/object/public/public-assets/a.jpg';
    expect(thumbUrl(supa, 40)).toBe(supa);
    expect(thumbUrl('https://lh3.googleusercontent.com/a/abc', 40)).toBe('https://lh3.googleusercontent.com/a/abc');
    expect(thumbUrl('/storage/messenger-attachments/a.jpg?exp=1&sig=2', 40)).toBe('/storage/messenger-attachments/a.jpg?exp=1&sig=2');
    expect(thumbUrl('/storage/public-assets/a.gif', 40)).toBe('/storage/public-assets/a.gif');
    expect(thumbUrl('', 40)).toBe('');
    expect(thumbUrl(null, 40)).toBe(null);
  });
});
