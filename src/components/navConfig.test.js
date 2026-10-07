import { describe, it, expect } from 'vitest';
import { resolveActiveKey, groupNavLinks, dedupeIconNames, wordStartScore, foldText } from './navConfig';

const LINKS = [
  { key: 'dashboard', path: '/' },
  { key: 'programs', path: '/programs' },
  { key: 'calendar', path: '/wydarzenia' },
  { key: 'members', path: '/members' },
  { key: 'teaching', path: '/teaching' },
  { key: 'faceci', path: '/faceci' },
];

describe('resolveActiveKey (UXE-11)', () => {
  it('pulpit tylko dla „/”', () => {
    expect(resolveActiveKey('/', LINKS)).toBe('dashboard');
    expect(resolveActiveKey('/nieznane', LINKS)).toBe(null);
  });
  it('podstrony po prefiksie ścieżki', () => {
    expect(resolveActiveKey('/programs/123', LINKS)).toBe('programs');
    expect(resolveActiveKey('/members', LINKS)).toBe('members');
    expect(resolveActiveKey('/faceci', LINKS)).toBe('faceci');
  });
  it('aliasy: strona wydarzenia, stare adresy modułów scalonych', () => {
    expect(resolveActiveKey('/wydarzenie/abc', LINKS)).toBe('calendar');
    expect(resolveActiveKey('/calendar', LINKS)).toBe('calendar');
    expect(resolveActiveKey('/care', LINKS)).toBe('members');
    expect(resolveActiveKey('/sermons', LINKS)).toBe('teaching');
  });
  it('granica segmentu — /membership nie podświetla /members', () => {
    expect(resolveActiveKey('/membership', LINKS)).toBe(null);
  });
  it('/module/:key', () => {
    expect(resolveActiveKey('/module/kobiety', LINKS)).toBe('kobiety');
  });
});

describe('groupNavLinks (UXE-04)', () => {
  it('grupuje po kluczu, Start w stałej kolejności, nieznane → Moje moduły', () => {
    const groups = groupNavLinks([
      { key: 'programs' }, { key: 'members' }, { key: 'calendar' }, { key: 'dashboard' },
      { key: 'faceci' }, { key: 'giving' }, { key: 'finance' },
    ]);
    expect(groups.map((g) => g.id)).toEqual(['start', 'people', 'finance', 'custom']);
    expect(groups[0].links.map((l) => l.key)).toEqual(['dashboard', 'calendar', 'programs']);
    // w pozostałych grupach kolejność wejściowa (display_order)
    expect(groups[2].links.map((l) => l.key)).toEqual(['giving', 'finance']);
    expect(groups[3].links.map((l) => l.key)).toEqual(['faceci']);
  });
});

describe('dedupeIconNames', () => {
  it('druga pozycja z tą samą ikoną dostaje ikonę domyślną swojego klucza', () => {
    const out = dedupeIconNames([
      { key: 'dashboard', iconName: 'LayoutDashboard' },
      { key: 'boards', iconName: 'LayoutDashboard' },
      { key: 'mail', iconName: 'Mail' },
      { key: 'mailing', iconName: 'Mail' },
    ]);
    expect(out.map((l) => l.iconName)).toEqual(['LayoutDashboard', 'SquareKanban', 'Mail', 'Send']);
  });
});

describe('wordStartScore (UXE-03)', () => {
  it('dopasowuje od początku słowa, bez polskich znaków', () => {
    expect(wordStartScore('modlitw', 'Ściana modlitwy')).toBe(2);
    expect(wordStartScore('sciana', 'Ściana modlitwy')).toBe(2);
    expect(wordStartScore('kazan', 'Nauczanie', 'kazania kazanie')).toBe(1);
  });
  it('nie łapie środka słowa („ania” ≠ „spotkania”)', () => {
    expect(wordStartScore('ania', 'Grupy domowe', 'komórki spotkania')).toBe(0);
    expect(wordStartScore('ania', 'Projekty', 'zadania tablice')).toBe(0);
  });
  it('foldText usuwa diakrytyki i ł', () => {
    expect(foldText('Łódź Żółć')).toBe('lodz zolc');
  });
});
