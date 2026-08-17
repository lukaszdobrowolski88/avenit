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
