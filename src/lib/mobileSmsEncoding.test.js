import { describe, it, expect } from 'vitest';
import * as mobile from '../../packages/mobile/src/features/campaigns/smsEncoding';
import {
  normalizePhone,
  parsePhones,
  resolveSegments,
  toggleSegment,
} from '../../packages/mobile/src/features/campaigns/recipientsLogic';
import * as server from '../../packages/api/src/lib/sms.js';

// Mobilka: liczenie części SMS musi dawać to samo co web/serwer (GSM-7 160/153, UCS-2 70/67,
// znaki rozszerzone GSM liczone podwójnie), a kwota — to samo co Intl pl-PL na webie.
// (Web importuje appLocale z i18n — porównujemy z serwerowym lib/sms.js, którego web jest kopią.)

const SAMPLES = [
  '',
  'Hello',
  'a'.repeat(160),
  'a'.repeat(161),
  'a'.repeat(306),
  'a'.repeat(307),
  'ą',
  'ż'.repeat(70),
  'ż'.repeat(71),
  'ż'.repeat(134),
  'ż'.repeat(135),
  '€'.repeat(80),
  '€'.repeat(81),
  '[]{}'.repeat(20),
  'Zapraszamy w niedzielę o 10:00!',
  'Spotkanie 12.05 godz. 18:00, sala B. Do zobaczenia!',
  'Emoji 🙏 wymusza Unicode',
  'line\nbreak\rok',
];

describe('smsEncoding (mobilka)', () => {
  it('kodowanie jak serwer', () => {
    for (const s of SAMPLES) expect(mobile.detectEncoding(s), JSON.stringify(s)).toBe(server.detectEncoding(s));
  });

  it('liczba części jak serwer', () => {
    for (const s of SAMPLES) {
      const enc = mobile.detectEncoding(s);
      expect(mobile.countParts(s, enc), JSON.stringify(s)).toBe(server.countParts(s, enc));
    }
  });

  it('granice części GSM-7 i Unicode', () => {
    expect(mobile.smsAnalysis('').parts).toBe(0);
    expect(mobile.smsAnalysis('a'.repeat(160))).toMatchObject({ encoding: 'gsm7', parts: 1, charsPerPart: 160, remainingInPart: 0 });
    expect(mobile.smsAnalysis('a'.repeat(161))).toMatchObject({ parts: 2, charsPerPart: 153, remainingInPart: 145 });
    expect(mobile.smsAnalysis('a'.repeat(307)).parts).toBe(3);
    expect(mobile.smsAnalysis('ż'.repeat(70))).toMatchObject({ encoding: 'unicode', parts: 1, charsPerPart: 70 });
    expect(mobile.smsAnalysis('ż'.repeat(71))).toMatchObject({ parts: 2, charsPerPart: 67 });
    // Znak rozszerzony GSM (€) zajmuje 2 pozycje: 80 × € = 160 → 1 część, 81 → 2.
    expect(mobile.smsAnalysis('€'.repeat(80))).toMatchObject({ encoding: 'gsm7', parts: 1 });
    expect(mobile.smsAnalysis('€'.repeat(81)).parts).toBe(2);
    // Emoji liczone jako 1 znak (code point), jak na webie.
    expect(mobile.smsAnalysis('🙏').charCount).toBe(1);
  });

  it('koszt = części × odbiorcy × cena', () => {
    expect(mobile.estimateCost('a'.repeat(161), 10)).toBeCloseTo(2 * 10 * 0.16);
    expect(mobile.estimateCost('', 10)).toBe(0);
  });

  it('kwota jak Intl pl-PL (web formatPLN)', () => {
    const intl = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
    for (const v of [0, 0.16, 1.5, 12.345, 999.99, 1234.5, 9999.99, 12345.67, 1234567.891]) {
      expect(mobile.formatPLN(v), String(v)).toBe(intl.format(v));
    }
    expect(mobile.formatPLN(null)).toBe('—');
    expect(mobile.formatPLN(NaN)).toBe('—');
  });
});

describe('odbiorcy kampanii (mobilka)', () => {
  it('normalizacja numerów jak serwer', () => {
    for (const raw of ['500123456', '+48 500 123 456', '0048500123456', '48-500-123-456', '12345', '', null, '(500) 123-456']) {
      expect(normalizePhone(raw), String(raw)).toBe(server.normalizePhone(raw));
    }
    expect(parsePhones('500123456, 600700800;abc\n+48 700 800 900')).toEqual({
      valid: ['48500123456', '48600700800', '48700800900'],
      invalid: ['abc'],
    });
  });

  const source = {
    allUsers: [
      { email: 'a@x.pl', full_name: 'A', phone: '500123456', campus_id: 1, role: 'lider' },
      { email: 'b@x.pl', full_name: 'B', phone: null, campus_id: 2, role: 'czlonek' },
      { email: 'c@x.pl', full_name: 'C', phone: '600700800', campus_id: 1, role: 'czlonek' },
    ],
    ministries: [{ id: 'media_team', key: 'media_team', name: 'Media', members: [{ email: 'b@x.pl', full_name: 'B', phone: null }] }],
    homeGroups: [{ id: '7', name: 'G', members: [{ email: 'c@x.pl', full_name: 'C', phone: null }, { email: 'z@x.pl', full_name: 'Z', phone: '700800900' }] }],
    campuses: [{ id: 1, name: 'K1' }],
    unsubscribed: ['c@x.pl'],
  };

  it('wszyscy minus rezygnacje, wykluczenia i deduplikacja', () => {
    const all = toggleSegment([], 'all', null, 'Wszyscy aktywni');
    expect(resolveSegments(source, all).map((u) => u.email)).toEqual(['a@x.pl', 'b@x.pl']);
    const withExclude = toggleSegment(all, 'ministry', 'media_team', 'Media', true);
    expect(resolveSegments(source, withExclude).map((u) => u.email)).toEqual(['a@x.pl']);
  });

  it('grupa domowa po id tekstowym z bazy + telefon z app_users', () => {
    const segs = [{ type: 'home_group', id: '7', name: 'G', exclude: false }];
    const r = resolveSegments(source, segs);
    // c@x.pl ma rezygnację; z@x.pl spoza app_users zostaje z własnym numerem.
    expect(r.map((u) => u.email)).toEqual(['z@x.pl']);
    const camp = resolveSegments(source, [{ type: 'campus', id: '1', name: 'K1', exclude: false }]);
    expect(camp.map((u) => u.email)).toEqual(['a@x.pl']);
  });

  it('„Wszyscy” zastępuje inne segmenty, inny segment zdejmuje „Wszyscy”', () => {
    let segs = toggleSegment([], 'role', 'lider', 'Lider');
    segs = toggleSegment(segs, 'all', null, 'Wszyscy aktywni');
    expect(segs).toEqual([{ type: 'all', id: null, name: 'Wszyscy aktywni', exclude: false }]);
    segs = toggleSegment(segs, 'campus', '1', 'K1');
    expect(segs.map((s) => s.type)).toEqual(['campus']);
  });
});
