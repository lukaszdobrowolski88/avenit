import { describe, it, expect } from 'vitest';
import { getInitials, stringToColor } from './text';

describe('utils/text', () => {
  it('getInitials — pierwsze + ostatnie imię', () => {
    expect(getInitials('Jan Kowalski')).toBe('JK');
    expect(getInitials('Jan Adam Kowalski')).toBe('JK');
    expect(getInitials('Madonna')).toBe('M');
    expect(getInitials('  Anna   Nowak ')).toBe('AN');
    expect(getInitials('')).toBe('?');
    expect(getInitials(null)).toBe('?');
  });

  it('stringToColor — deterministyczny, hex z palety, default gdy pusto', () => {
    expect(stringToColor('')).toBe('#6b7280');
    expect(stringToColor(null)).toBe('#6b7280');
    const c = stringToColor('jan@x.pl');
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(stringToColor('jan@x.pl')).toBe(c);
  });
});
