import { describe, it, expect } from 'vitest';
import { pluralKey } from './index';
import { TRANSLATIONS } from './translations';

const KIDS = ['{n} dziecko', '{n} dzieci', '{n} dzieci'];
const FAMILIES = ['{n} rodzina', '{n} rodziny', '{n} rodzin'];
const say = (lang, n, forms) => {
  const key = pluralKey(lang, n, ...forms, TRANSLATIONS[lang]);
  const text = lang === 'pl' ? key : TRANSLATIONS[lang][key];
  return text.replace('{n}', n);
};

describe('pluralKey', () => {
  it('odmienia po polsku', () => {
    expect([1, 3, 5, 12, 22, 0].map((n) => say('pl', n, FAMILIES)))
      .toEqual(['1 rodzina', '3 rodziny', '5 rodzin', '12 rodzin', '22 rodziny', '0 rodzin']);
    expect(say('pl', 3, KIDS)).toBe('3 dzieci');
  });

  it('po ukraińsku 2–4 ma własną formę, a 21 to liczba pojedyncza', () => {
    expect([1, 3, 5, 21, 22, 11].map((n) => say('uk', n, KIDS)))
      .toEqual(['1 дитина', '3 дитини', '5 дітей', '21 дитина', '22 дитини', '11 дітей']);
    expect([1, 3, 5, 21].map((n) => say('uk', n, FAMILIES)))
      .toEqual(['1 родина', '3 родини', '5 родин', '21 родина']);
  });

  it('po angielsku tylko 1 jest w liczbie pojedynczej', () => {
    expect([1, 3, 21].map((n) => say('en', n, KIDS))).toEqual(['1 child', '3 children', '21 children']);
  });
});
