import { describe, it, expect } from 'vitest';
import { splitLinks, firstLink, domainOf, isSafeHttpUrl, hrefOf } from './linkify';

const links = (t) => splitLinks(t).filter(p => p.type === 'link').map(p => p.href);

describe('Komunikator — linki w treści (K2)', () => {
  it('rozpoznaje http, https i www., reszta zostaje tekstem', () => {
    const parts = splitLinks('Zobacz https://avenit.pl/a?b=1 oraz www.kosciol.pl dzięki');
    expect(parts).toEqual([
      { type: 'text', value: 'Zobacz ' },
      { type: 'link', value: 'https://avenit.pl/a?b=1', href: 'https://avenit.pl/a?b=1' },
      { type: 'text', value: ' oraz ' },
      { type: 'link', value: 'www.kosciol.pl', href: 'https://www.kosciol.pl' },
      { type: 'text', value: ' dzięki' },
    ]);
  });

  it('obcina interpunkcję z końca, ale zostawia domknięte nawiasy', () => {
    expect(links('Link: https://x.pl/a.')).toEqual(['https://x.pl/a']);
    expect(links('(https://x.pl/a)')).toEqual(['https://x.pl/a']);
    expect(links('https://pl.wikipedia.org/wiki/Foo_(bar), ok')).toEqual(['https://pl.wikipedia.org/wiki/Foo_(bar)']);
    expect(links('„https://x.pl/z”!')).toEqual(['https://x.pl/z']);
  });

  it('bez linków w e-mailach, bez obcych protokołów', () => {
    expect(links('napisz na jan@www.x.pl')).toEqual([]);
    expect(links('javascript:alert(1) ftp://x.pl')).toEqual([]);
    expect(splitLinks('')).toEqual([]);
    expect(splitLinks(null)).toEqual([]);
  });

  it('pierwszy link do karty podglądu i domena do podpisu', () => {
    expect(firstLink('a www.one.pl b https://two.pl')).toBe('https://www.one.pl');
    expect(firstLink('bez linku')).toBeNull();
    expect(domainOf('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(domainOf('nie-url')).toBe('');
    expect(isSafeHttpUrl('https://x.pl')).toBe(true);
    expect(isSafeHttpUrl('data:text/html,x')).toBe(false);
    expect(hrefOf('www.a.pl')).toBe('https://www.a.pl');
  });
});
