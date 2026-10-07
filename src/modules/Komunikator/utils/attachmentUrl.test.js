import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ supabase: { storage: { from: () => ({}) } } }));

const { messengerStoragePath, attachmentUploadPath, createAttachmentUrlResolver, attachmentConversationOf } = await import('./attachmentUrl');

const URL1 = 'https://schwro.avenit.pl/storage/messenger-attachments/c1/zdj%C4%99cie.jpg';

describe('Komunikator — prywatne załączniki (K1)', () => {
  it('rozpoznaje ścieżkę pliku czatu; obce i już podpisane adresy bez zmian', () => {
    expect(messengerStoragePath(URL1)).toBe('c1/zdjęcie.jpg');
    expect(messengerStoragePath('/storage/messenger-attachments/attachments/a.pdf')).toBe('attachments/a.pdf');
    expect(messengerStoragePath('https://x.pl/storage/other/a.jpg')).toBeNull();
    expect(messengerStoragePath('/storage/messenger-attachments/c1/a.jpg?exp=1&sig=abc')).toBeNull();
    expect(messengerStoragePath('')).toBeNull();
    expect(attachmentConversationOf(URL1)).toBe('c1');
  });

  it('nowe pliki trafiają do folderu rozmowy (pierwszy segment = id rozmowy)', () => {
    expect(attachmentUploadPath('c1', 'ab c?.jpg')).toBe('c1/ab_c_.jpg');
    expect(attachmentUploadPath(null, 'a.jpg')).toBe('attachments/a.jpg');
  });

  it('podpis z pamięci ~4 min, wspólny dla równoległych próśb; potem nowy', async () => {
    let now = 1_000_000;
    const sign = vi.fn(async (path) => `https://h/storage/messenger-attachments/${path}?sig=${now}`);
    const r = createAttachmentUrlResolver({ sign, now: () => now });
    expect(r.peek(URL1)).toBeNull();
    const [a, b] = await Promise.all([r.resolve(URL1), r.resolve(URL1)]);
    expect(a).toBe(b);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(r.peek(URL1)).toBe(a);
    now += 3 * 60 * 1000;
    expect(await r.resolve(URL1)).toBe(a);
    expect(sign).toHaveBeenCalledTimes(1);
    now += 2 * 60 * 1000;
    expect(await r.resolve(URL1)).not.toBe(a);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('nieudany podpis → zwykły adres; adres spoza czatu — bez podpisywania', async () => {
    const sign = vi.fn(async () => { throw new Error('403'); });
    const r = createAttachmentUrlResolver({ sign });
    expect(await r.resolve(URL1)).toBe(URL1);
    const other = 'https://cdn.example.com/a.jpg';
    expect(await r.resolve(other)).toBe(other);
    expect(r.peek(other)).toBe(other);
    expect(sign).toHaveBeenCalledTimes(1);
  });
});
