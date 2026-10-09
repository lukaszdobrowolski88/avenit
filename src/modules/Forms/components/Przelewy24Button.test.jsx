import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Przelewy24Button from './Przelewy24Button';
import { pricingAnswers, calculatePriceBreakdown, formPaymentAmount } from '@avenit/shared/src/forms/formPricing.js';

// sessionId transakcji nadaje serwer (przelewy24-create-payment) — przycisk go nie generuje,
// nie dopisuje do adresu powrotu i zapamiętuje ten zwrócony przez serwer.
const invoke = vi.fn();
vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }));

const FORM_ID = '11111111-2222-4333-8444-555555555555';

describe('Przelewy24Button', () => {
  beforeEach(() => {
    invoke.mockReset();
    try { localStorage.clear(); } catch { /* brak storage */ }
  });

  it('wysyła formId, bez własnego sessionId/urlStatus; używa sessionId z serwera', async () => {
    invoke.mockResolvedValue({ data: { token: 'T1', paymentUrl: 'https://sandbox.przelewy24.pl/trnRequest/T1', sessionId: 'form_k_1_abc' }, error: null });
    render(<Przelewy24Button merchantId="1" amount={50} formId={FORM_ID} email="a@b.pl" />);
    fireEvent.click(screen.getByRole('button', { name: /Zapłać przez Przelewy24/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Przejdź do płatności/i })).toBeTruthy());

    const [fn, { body }] = invoke.mock.calls[0];
    expect(fn).toBe('przelewy24-create-payment');
    expect(body.formId).toBe(FORM_ID);
    expect(body.amount).toBe(5000);
    expect(body.sessionId).toBeUndefined();
    expect(body.urlStatus).toBeUndefined();
    expect(body.urlReturn).toBe(`${window.location.origin}/form/${FORM_ID}?payment=success`);

    // Przekierowanie: zapisany sessionId = ten od serwera.
    const assign = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, set href(v) { assign(v); }, get href() { return orig.href; } } });
    try {
      fireEvent.click(screen.getByRole('button', { name: /Przejdź do płatności/i }));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: orig });
    }
    expect(assign).toHaveBeenCalledWith('https://sandbox.przelewy24.pl/trnRequest/T1');
    expect(JSON.parse(localStorage.getItem(`p24_session_${FORM_ID}`)).sessionId).toBe('form_k_1_abc');
  });

  it('bez formId nie wysyła pola formId', async () => {
    invoke.mockResolvedValue({ data: { token: 'T2', sessionId: 's2' }, error: null });
    render(<Przelewy24Button merchantId="1" amount={20} email="a@b.pl" />);
    fireEvent.click(screen.getByRole('button', { name: /Zapłać przez Przelewy24/i }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect('formId' in invoke.mock.calls[0][1].body).toBe(false);
  });

  it('wysyła dane do wyceny (bez danych osobowych) i pokazuje kwotę przyjętą przez serwer', async () => {
    invoke.mockResolvedValue({ data: { token: 'T3', paymentUrl: 'https://x/T3', sessionId: 's3', amount: 12000 }, error: null });
    const fields = [{ id: 'q', type: 'quantity' }, { id: 'name', type: 'text' }];
    const answers = { q: 2, name: 'Jan Kowalski', _addons: { a: 1 }, _participants: [{ name: 'Ola', pesel: '123', _addons: { a: 1 } }], _contactPerson: { name: 'Jan', _addons: {} } };
    render(<Przelewy24Button merchantId="1" amount={100} formId={FORM_ID} email="a@b.pl" pricingAnswers={pricingAnswers(fields, answers)} />);
    fireEvent.click(screen.getByRole('button', { name: /Zapłać przez Przelewy24/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Przejdź do płatności/i })).toBeTruthy());
    const { body } = invoke.mock.calls[0][1];
    expect(body.answers).toEqual({ q: 2, _addons: { a: 1 }, _contactPerson: { _addons: {} }, _participants: [{ _addons: { a: 1 } }] });
    expect(JSON.stringify(body.answers)).not.toMatch(/Kowalski|Ola|123/);
    expect(screen.getByText(/120/)).toBeTruthy();
  });
});

describe('formPricing (wspólny z serwerem)', () => {
  const fields = [{ id: 'p', type: 'price', priceConfig: { basePrice: 100, pricingType: 'per_person' } }, { id: 'q', type: 'quantity' }];
  const settings = { pricing: { enabled: true, paymentMethods: ['przelewy24'] } };

  it('podsumowanie w przeglądarce = kwota serwera', () => {
    const answers = { q: '3' };
    const web = calculatePriceBreakdown(fields, answers, settings, { today: '2026-10-09' }).grandTotal;
    const server = formPaymentAmount({ fields, settings }, pricingAnswers(fields, answers), { today: '2026-10-09' });
    expect(web).toBe(300);
    expect(server.amount).toBe(30000);
  });

  it('cennik datowy: próg obowiązuje do końca dnia „until”', () => {
    const f = [{ id: 'p', type: 'price', priceConfig: { basePrice: 80, datePricing: { enabled: true, tiers: [{ until: '2026-10-09', price: 50 }, { until: '2026-09-01', price: 30 }] } } }];
    expect(calculatePriceBreakdown(f, {}, {}, { today: '2026-08-31' }).grandTotal).toBe(30);
    expect(calculatePriceBreakdown(f, {}, {}, { today: '2026-10-09' }).grandTotal).toBe(50);
    expect(calculatePriceBreakdown(f, {}, {}, { today: '2026-10-10' }).grandTotal).toBe(80);
  });
});
