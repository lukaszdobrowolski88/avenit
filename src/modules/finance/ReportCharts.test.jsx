// Wartości wykresów muszą być w DOM na stałe (PDF to zrzut widoku — dymków tam nie ma).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { CategoryDonut, BucketTable, YoYBars } from './ReportCharts';

// jsdom nie ma ResizeObservera (używa go ResponsiveContainer z Recharts).
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

describe('wykresy raportu — liczby bez najeżdżania', () => {
  it('donut: legenda z kwotą i udziałem, ogon zwinięty w „Pozostałe”', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({ name: `Kat ${i + 1}`, amount: 100 - i, pct: 8 }));
    const { container } = render(<CategoryDonut data={data} />);
    const text = container.textContent;
    expect(text).toMatch(/Kat 1/);
    expect(text).toMatch(/100,00\s?zł/);
    expect(text).toMatch(/8%/);
    expect(text).toMatch(/Pozostałe \(4\)/);
    expect(text).not.toMatch(/Kat 12/);
  });
  it('tabela okresów: wpływy, wydatki, bilans, saldo i suma', () => {
    const buckets = [
      { label: 'Sty', income: 1000, expense: 400, balance: 600, cumulative: 600 },
      { label: 'Lut', income: 0, expense: 900, balance: -900, cumulative: -300 },
    ];
    const { container } = render(<BucketTable buckets={buckets} />);
    const text = container.textContent;
    expect(text).toMatch(/Sty/);
    expect(text).toMatch(/1\s?000,00\s?zł/);
    expect(text).toMatch(/-300,00\s?zł/);
    expect(text).toMatch(/Razem/);
  });
  it('rok do roku: tabela ze zmianą procentową', () => {
    const yoy = { income: { prev: 1000, now: 1500 }, expense: { prev: 800, now: 800 }, balance: { prev: 200, now: 700 } };
    const { container } = render(<YoYBars yoy={yoy} prevLabel={2025} nowLabel={2026} />);
    expect(container.textContent).toMatch(/\+500,00\s?zł \(\+50%\)/);
  });
});
