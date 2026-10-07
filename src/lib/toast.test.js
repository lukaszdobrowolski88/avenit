import { describe, it, expect, beforeEach } from 'vitest';
import { toast, subscribeToasts } from './toast';

describe('toast (globalna warstwa feedbacku)', () => {
  let received;
  let unsub;
  beforeEach(() => { received = []; });

  it('dostarcza toast do subskrybenta z typem i wiadomością', () => {
    unsub = subscribeToasts((t) => received.push(t));
    toast.error('Coś padło');
    toast.success('Zapisano');
    expect(received.map((t) => [t.type, t.message])).toEqual([['error', 'Coś padło'], ['success', 'Zapisano']]);
    unsub();
  });

  it('buforuje toasty wyemitowane PRZED subskrypcją i dostarcza po', () => {
    toast.info('zanim ktoś słucha'); // brak subskrybenta → kolejka
    unsub = subscribeToasts((t) => received.push(t));
    expect(received.some((t) => t.message === 'zanim ktoś słucha')).toBe(true);
    unsub();
  });

  it('obsługuje obiekt {title, message, action}', () => {
    unsub = subscribeToasts((t) => received.push(t));
    const id = toast.error({ title: 'Błąd', message: 'szczegóły', action: { label: 'Ponów', onClick: () => {} } });
    expect(typeof id).toBe('number');
    expect(received[0]).toMatchObject({ type: 'error', title: 'Błąd', message: 'szczegóły' });
    expect(received[0].action.label).toBe('Ponów');
    unsub();
  });
});

import { vi, afterEach } from 'vitest';
import { friendlyError, sanitizeErrorText, listenWriteErrors, lastErrorToastAt } from './toast';

describe('friendlyError (ludzkie komunikaty zamiast surowych błędów)', () => {
  it('kody Postgresa i statusy HTTP', () => {
    expect(friendlyError({ message: 'duplicate key value violates unique constraint "x_pkey"', code: '23505' })).toBe('Taki wpis już istnieje.');
    expect(friendlyError({ message: 'null value in column "name" violates not-null constraint', code: '23502' })).toMatch(/Uzupełnij wymagane pola/);
    expect(friendlyError({ message: 'Brak uprawnienia finance:edit', code: '403' })).toMatch(/Nie masz uprawnień/);
    expect(friendlyError({ message: 'HTTP 401', status: 401 })).toMatch(/sesja wygasła/);
    expect(friendlyError({ message: 'HTTP 413', status: 413 })).toMatch(/za duże/);
    expect(friendlyError({ message: 'Conflict', status: 409 })).toBe('Taki wpis już istnieje.');
  });

  it('sieć i limit czasu', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/Brak połączenia/);
    expect(friendlyError({ message: 'canceling statement due to statement timeout', code: '57014' })).toMatch(/nie odpowiedział/);
  });

  it('odpowiedź API { data, error } i angielski komunikat funkcji → zrozumiały tekst', () => {
    expect(friendlyError({ data: null, error: { message: 'x', code: '23503' } })).toMatch(/powiązany z innymi danymi/);
    expect(friendlyError({ message: 'SMSAPI token not configured (set in app settings)', status: 400 }, 'Nie udało się wysłać SMS.')).toBe('Nie udało się wysłać SMS.');
  });

  it('czytelny polski komunikat serwera zostaje', () => {
    expect(friendlyError({ message: 'Nie można usunąć ostatniego administratora.', status: 400 })).toBe('Nie można usunąć ostatniego administratora.');
    expect(friendlyError({ message: 'Tylko administrator może zmienić ten wpis.', status: 403 })).toBe('Tylko administrator może zmienić ten wpis.');
  });

  it('brak treści → fallback albo ogólny komunikat', () => {
    expect(friendlyError(null, 'Nie udało się zapisać osoby')).toBe('Nie udało się zapisać osoby');
    expect(friendlyError({})).toMatch(/Coś poszło nie tak/);
  });
});

describe('sanitizeErrorText (sklejki „Błąd zapisu: ” + surowy błąd)', () => {
  it('podmienia tylko techniczny fragment', () => {
    expect(sanitizeErrorText('Błąd zapisu: duplicate key value violates unique constraint "a"')).toBe('Błąd zapisu: Taki wpis już istnieje.');
    expect(sanitizeErrorText('Błąd: Failed to fetch')).toMatch(/^Brak połączenia/);
    expect(sanitizeErrorText('Nie udało się zapisać osoby')).toBe('Nie udało się zapisać osoby');
    expect(sanitizeErrorText('This entry already exists')).toBe('This entry already exists');
  });

  it('toast.error(obiekt błędu) pokazuje ludzki tekst', () => {
    const got = [];
    const un = subscribeToasts((t) => got.push(t));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    toast.error({ message: 'HTTP 403', code: '403', details: null, hint: null });
    toast.error('Błąd usuwania: HTTP 500');
    spy.mockRestore();
    un();
    expect(got[0].message).toMatch(/Nie masz uprawnień/);
    expect(got[1].message).toMatch(/^Błąd usuwania: Wystąpił błąd serwera/);
  });
});

describe('listenWriteErrors (globalny komunikat o nieudanym zapisie)', () => {
  afterEach(() => { vi.useRealTimers(); });
  // Zegar przesunięty do przodu — toasty błędów z wcześniejszych testów są „starsze” niż zdarzenia.
  let clock = Date.now() + 60000;
  const fakeTimers = () => { vi.useFakeTimers(); clock += 60000; vi.setSystemTime(clock); };
  const fire = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail: { at: Date.now(), ...detail } }));

  it('pokazuje komunikat, gdy wywołujący milczy', () => {
    fakeTimers();
    const got = [];
    const un = subscribeToasts((t) => got.push(t));
    const stop = listenWriteErrors({ delay: 400 });
    fire('avenit:write-error', { kind: 'db', table: 'programs', op: 'update', columns: ['title'], status: 403, code: '403', message: 'Brak uprawnienia res:programs:update' });
    expect(got.length).toBe(0);
    vi.advanceTimersByTime(450);
    expect(got.length).toBe(1);
    expect(got[0].type).toBe('error');
    expect(got[0].message).toMatch(/Nie masz uprawnień/);
    stop(); un();
  });

  it('nie dubluje, gdy wywołujący sam pokazał toast.error', () => {
    fakeTimers();
    const got = [];
    const un = subscribeToasts((t) => got.push(t));
    const stop = listenWriteErrors({ delay: 400 });
    fire('avenit:write-error', { kind: 'db', table: 'events', op: 'insert', columns: ['title'], status: 500, message: 'HTTP 500' });
    toast.error('Nie udało się zapisać wydarzenia');
    vi.advanceTimersByTime(450);
    expect(got.map((t) => t.message)).toEqual(['Nie udało się zapisać wydarzenia']);
    expect(lastErrorToastAt()).toBeGreaterThan(0);
    stop(); un();
  });

  it('pomija błąd naprawiony ponowieniem i zapisy w tle', () => {
    fakeTimers();
    const got = [];
    const un = subscribeToasts((t) => got.push(t));
    const stop = listenWriteErrors({ delay: 400 });
    fire('avenit:write-error', { kind: 'db', table: 'programs', op: 'insert', columns: ['x'], code: '42703', message: 'column "x" does not exist' });
    fire('avenit:write-ok', { kind: 'db', table: 'programs', op: 'insert' });
    fire('avenit:write-error', { kind: 'db', table: 'user_presence', op: 'upsert', columns: ['status'], status: 403 });
    fire('avenit:write-error', { kind: 'db', table: 'app_users', op: 'update', columns: ['onboarding'], status: 403 });
    vi.advanceTimersByTime(450);
    expect(got.length).toBe(0);
    stop(); un();
  });
});
