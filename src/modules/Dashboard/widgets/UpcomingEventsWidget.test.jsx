// Regresja (2026-10-11): wieczorem Pulpit pokazywał poranne nabożeństwo jako „DZIŚ 11:00 · wkrótce”.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rows = [
  { id: 1, title: 'Nabożeństwo poranne', date: '2026-10-11', time: '11:00', location: 'Hotel Bielany' },
  { id: 2, title: 'Wieczór uwielbienia', date: '2026-10-11', time: '19:30', location: 'Sala' },
  { id: 3, title: 'Nabożeństwo w Zielonej Niwie', date: '2026-10-18', time: null },
];
vi.mock('../../../lib/supabase', () => {
  const chain = { select: () => chain, gte: () => chain, order: () => chain, limit: () => Promise.resolve({ data: rows, error: null }) };
  return { supabase: { from: () => chain } };
});

import UpcomingEventsWidget from './UpcomingEventsWidget';

describe('Nadchodzące wydarzenia', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 11, 20, 0)); });
  afterAll(() => { vi.useRealTimers(); });

  it('pomija dzisiejsze zakończone, zostawia trwające i przyszłe', async () => {
    render(<MemoryRouter><UpcomingEventsWidget /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Nabożeństwo w Zielonej Niwie')).toBeTruthy());
    expect(screen.queryByText('Nabożeństwo poranne')).toBeNull();
    expect(screen.getByText('Wieczór uwielbienia')).toBeTruthy();
  });
});
