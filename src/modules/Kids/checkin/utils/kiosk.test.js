import { describe, it, expect } from 'vitest';
import {
  PICKUP_CODE_ALPHABET, generatePickupCode, generateUniquePickupCode, normalizePickupCode,
  splitStoredCodes, pickupCodeMatches, isValidPin, hashPin, verifyPin, readKioskState,
  writeKioskState, clearKioskState, isKioskActive, lockoutRemaining, KIOSK_MAX_ATTEMPTS,
  KIOSK_LOCKOUT_MS, localDateISO, parseLocalDate, phoneEndsWith, maskPhone, pluralForm,
  pickSessionEvent, CODE_KEYPAD_ROWS, KEY_CLEAR, KEY_BACK,
} from './kiosk';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('kody odbioru', () => {
  it('generuje kod 4 znaków wyłącznie z alfabetu bez mylących znaków', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePickupCode();
      expect(code).toHaveLength(4);
      for (const ch of code) expect(PICKUP_CODE_ALPHABET).toContain(ch);
    }
    for (const bad of ['0', 'O', '1', 'I', 'L', '5', 'S', '8', 'B', '2', 'Z']) {
      expect(PICKUP_CODE_ALPHABET).not.toContain(bad);
    }
  });

  it('kod nie jest końcówką telefonu (zawiera litery lub cyfry spoza zakresu) i jest losowy', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generatePickupCode()));
    expect(codes.size).toBeGreaterThan(90);
  });

  it('unika kodów już zajętych w sesji, także w starym formacie „1234|5678”', () => {
    const taken = [];
    for (let i = 0; i < 300; i++) taken.push(generatePickupCode());
    taken.push('1234|5678');
    const code = generateUniquePickupCode(taken);
    expect(taken).not.toContain(code);
  });

  it('klawiatura odbioru ma dokładnie znaki alfabetu kodów (plus wyczyść i cofnij)', () => {
    const keys = CODE_KEYPAD_ROWS.flat().filter((k) => k !== KEY_CLEAR && k !== KEY_BACK);
    expect([...keys].sort().join('')).toBe([...PICKUP_CODE_ALPHABET].sort().join(''));
    expect(CODE_KEYPAD_ROWS.flat()).toContain(KEY_CLEAR);
    expect(CODE_KEYPAD_ROWS.flat()).toContain(KEY_BACK);
  });

  it('normalizuje i dopasowuje kody (wielkość liter, spacje, stary format)', () => {
    expect(normalizePickupCode(' k7-hx ')).toBe('K7HX');
    expect(splitStoredCodes('1234|5678')).toEqual(['1234', '5678']);
    expect(pickupCodeMatches('K7HX', 'k7hx')).toBe(true);
    expect(pickupCodeMatches('1234|5678', '5678')).toBe(true);
    expect(pickupCodeMatches('12345', '1234')).toBe(false);
    expect(pickupCodeMatches('K7HX', '')).toBe(false);
  });
});

describe('PIN trybu kiosku', () => {
  it('waliduje 4 cyfry', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('nie trzyma PIN-u jawnym tekstem i weryfikuje go po skrócie', async () => {
    const h = await hashPin('4321', 'abc');
    expect(h).not.toContain('4321');
    const state = { active: true, salt: 'abc', pinHash: h };
    expect(await verifyPin('4321', state)).toBe(true);
    expect(await verifyPin('1234', state)).toBe(false);
    expect(await verifyPin('4321', null)).toBe(false);
  });

  it('zapisuje, odczytuje i czyści stan kiosku', () => {
    const s = memoryStorage();
    expect(isKioskActive(s)).toBe(false);
    writeKioskState({ active: true, salt: 'x', pinHash: 'y' }, s);
    expect(readKioskState(s)).toMatchObject({ active: true });
    expect(isKioskActive(s)).toBe(true);
    clearKioskState(s);
    expect(readKioskState(s)).toBeNull();
  });

  it('ignoruje uszkodzony stan', () => {
    const s = memoryStorage();
    s.setItem('avenit_kids_kiosk', '{oops');
    expect(readKioskState(s)).toBeNull();
    s.setItem('avenit_kids_kiosk', JSON.stringify({ active: true }));
    expect(readKioskState(s)).toBeNull();
  });

  it('blokuje próby po zbyt wielu błędach', () => {
    const t = 1_000_000;
    expect(lockoutRemaining(KIOSK_MAX_ATTEMPTS - 1, t, t)).toBe(0);
    expect(lockoutRemaining(KIOSK_MAX_ATTEMPTS, t, t + 1000)).toBe(KIOSK_LOCKOUT_MS - 1000);
    expect(lockoutRemaining(KIOSK_MAX_ATTEMPTS, t, t + KIOSK_LOCKOUT_MS + 1)).toBe(0);
  });
});

describe('daty, telefony, odmiana', () => {
  it('data lokalna, nie UTC', () => {
    expect(localDateISO(new Date(2026, 9, 4, 0, 30))).toBe('2026-10-04');
    const d = parseLocalDate('2026-10-04');
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(0);
  });

  it('dopasowuje końcówkę telefonu niezależnie od formatu', () => {
    expect(phoneEndsWith('+48 601 234 567', '4567')).toBe(true);
    expect(phoneEndsWith('601-234-567', '4567')).toBe(true);
    expect(phoneEndsWith('601 234 568', '4567')).toBe(false);
    expect(phoneEndsWith('', '4567')).toBe(false);
  });

  it('maskuje telefon', () => {
    expect(maskPhone('601 234 567')).toBe('••• ••• 567');
    expect(maskPhone('')).toBe('');
  });

  it('odmienia liczebniki po polsku', () => {
    const f = (n) => pluralForm(n, 'dziecko', 'dzieci', 'dzieci') + '/' + pluralForm(n, 'rodzina', 'rodziny', 'rodzin');
    expect(f(1)).toBe('dziecko/rodzina');
    expect(f(3)).toBe('dzieci/rodziny');
    expect(f(5)).toBe('dzieci/rodzin');
    expect(f(12)).toBe('dzieci/rodzin');
    expect(f(22)).toBe('dzieci/rodziny');
    expect(f(0)).toBe('dzieci/rodzin');
  });
});

describe('nazwa sesji z kalendarza', () => {
  const now = new Date(2026, 9, 4, 10, 15);
  it('wybiera trwające wydarzenie', () => {
    const e = pickSessionEvent([
      { title: 'Próba', time: '08:00', end_time: '09:00' },
      { title: 'Nabożeństwo', time: '10:00:00', end_time: '12:00:00' },
      { title: 'Młodzież', time: '18:00' },
    ], now);
    expect(e.title).toBe('Nabożeństwo');
  });
  it('wybiera najbliższe nadchodzące, a gdy brak — ostatnie', () => {
    expect(pickSessionEvent([{ title: 'A', time: '08:00' }, { title: 'B', time: '11:00' }], now).title).toBe('B');
    expect(pickSessionEvent([{ title: 'A', time: '08:00' }, { title: 'B', time: '09:00' }], now).title).toBe('B');
    expect(pickSessionEvent([], now)).toBeNull();
  });
});
