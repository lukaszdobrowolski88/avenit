// Dzwonek: klik w powiadomienie oznacza je jako przeczytane (całą zgrupowaną pozycję) i prowadzi
// do celu; zadania i wzmianki mają własne ikony i etykiety, a wzmianki z zadań nie są łączone
// w „N wiadomości” jak wiadomości z czatu.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ ctx: null }));
vi.mock('../contexts/NotificationContext', () => ({ useNotificationContext: () => h.ctx }));

import NotificationCenter, { notificationKind, internalPath } from './NotificationCenter';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

const now = new Date().toISOString();
beforeEach(() => {
  h.ctx = {
    notifications: [
      { id: 1, type: 'task', title: 'Anna przypisał(a) Cię do zadania', body: 'Kable · Media', link: '/media?item=i-1', read: false, created_at: now },
      { id: 2, type: 'mention', title: 'Jan wspomniał(a) o Tobie', body: 'Zerknij', link: '/projekty?board=b&item=i-2', data: { item_id: 'i-2' }, read: false, created_at: now },
      { id: 3, type: 'mention', title: 'Ola wspomniał(a) o Tobie', body: 'Też tu', link: '/projekty?board=b&item=i-2', data: { item_id: 'i-2' }, read: false, created_at: now },
      { id: 4, type: 'message', title: 'Piotr', body: 'Cześć', link: '/komunikator?conversation=9', data: { conversation_id: 9 }, read: false, created_at: now },
      { id: 5, type: 'message', title: 'Piotr', body: 'Jesteś?', link: '/komunikator?conversation=9', data: { conversation_id: 9 }, read: false, created_at: now },
    ],
    unreadCount: 5,
    markAsRead: vi.fn(async () => {}),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    clearAll: vi.fn(),
  };
});

const renderBell = () => render(
  <MemoryRouter initialEntries={['/']}>
    <Routes><Route path="*" element={<><NotificationCenter /><Where /></>} /></Routes>
  </MemoryRouter>,
);

describe('NotificationCenter', () => {
  it('klik oznacza jako przeczytane i przechodzi do zadania', () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Powiadomienia/ }));
    fireEvent.click(screen.getByText('Anna przypisał(a) Cię do zadania'));
    expect(h.ctx.markAsRead).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('where').textContent).toBe('/media?item=i-1');
  });

  it('zgrupowana rozmowa — klik oznacza wszystkie jej wiadomości', () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Powiadomienia/ }));
    // Jedna pozycja rozmowy z licznikiem (bez I18nProvider t() nie podstawia {n}).
    expect(screen.getAllByText('Piotr')).toHaveLength(1);
    expect(screen.getByText(/wiadomości/)).toBeTruthy();
    fireEvent.click(screen.getByText('Piotr'));
    expect(h.ctx.markAsRead).toHaveBeenCalledWith(4);
    expect(h.ctx.markAsRead).toHaveBeenCalledWith(5);
    expect(screen.getByTestId('where').textContent).toBe('/komunikator?conversation=9');
  });

  it('wzmianki z zadań są osobno, z etykietą; zadanie ma etykietę „Zadanie”', () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Powiadomienia/ }));
    expect(screen.getByText('Jan wspomniał(a) o Tobie')).toBeTruthy();
    expect(screen.getByText('Ola wspomniał(a) o Tobie')).toBeTruthy();
    expect(screen.getAllByText(/Wzmianka w zadaniu/)).toHaveLength(2);
    expect(screen.getByText(/^Zadanie ·/)).toBeTruthy();
  });

  it('rodzaje i linki', () => {
    expect(notificationKind({ type: 'task' }).label).toBe('Zadanie');
    expect(notificationKind({ type: 'mention' }).label).toBe('Wzmianka');
    expect(notificationKind({ type: 'mention', data: { item_id: 1 } }).label).toBe('Wzmianka w zadaniu');
    expect(notificationKind({ type: 'xyz' }).label).toBeNull();
    expect(internalPath('/a?b=1')).toBe('/a?b=1');
    expect(internalPath(`${window.location.origin}/media?item=1`)).toBe('/media?item=1');
    expect(internalPath('https://example.org/x')).toBeNull();
  });
});
