import { describe, it, expect } from 'vitest';
import { buildPrintHtml } from './printSchedule';

describe('buildPrintHtml', () => {
  const base = {
    title: 'Grupa Uwielbienia — Październik 2026',
    events: [{ date: '18.10', weekday: 'niedz.', time: '10:00', title: 'Nabożeństwo <b>niedzielne</b>', place: 'Sala "A"' }],
    rows: [
      { label: 'Wokale', cells: [['Ewa', '<img src=x onerror=alert(1)>']] },
      { label: 'Nieobecni', cells: [['Jan']], kind: 'absent' },
    ],
    footer: 'Wygenerowano z Avenit',
  };
  it('escapuje dane wpisane przez użytkowników', () => {
    const html = buildPrintHtml(base);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Nabożeństwo &lt;b&gt;niedzielne&lt;/b&gt;');
    expect(html).toContain('Sala &quot;A&quot;');
    expect(html).toContain('row-absent');
  });
  it('orientacja: do 5 wydarzeń pionowo, więcej — poziomo', () => {
    expect(buildPrintHtml(base)).toContain('A4 portrait');
    const many = { ...base, events: Array.from({ length: 6 }, (_, i) => ({ date: `0${i + 1}.10`, title: 'X' })) };
    expect(buildPrintHtml(many)).toContain('A4 landscape');
  });
});
