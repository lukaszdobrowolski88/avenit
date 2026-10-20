import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [{ email: 'Lider@Example.com', full_name: 'Jan Lider' }], error: null }),
    }),
  },
}));

import { CampaignMetaLines, CampaignMetaDetails, useUserNames } from './campaignMeta';

function Lines({ campaign }) {
  const names = useUserNames();
  return <CampaignMetaLines campaign={campaign} names={names} />;
}

describe('CampaignMetaLines („kto i kiedy” na karcie kampanii)', () => {
  it('autor z app_users (bez względu na wielkość liter) + wysyłka z liczbą osób', async () => {
    render(<Lines campaign={{
      status: 'sent', created_by: 'lider@example.com', created_at: '2026-10-19T08:00:00Z',
      started_at: '2026-10-19T08:01:00Z', completed_at: '2026-10-19T08:02:00Z', recipient_count: 5,
    }} />);
    await waitFor(() => expect(screen.getByText(/Utworzył\(a\): Jan Lider/)).toBeTruthy());
    expect(screen.getByText(/Wysłano: .*do 5 osób/)).toBeTruthy();
  });

  it('zaplanowana: termin; nieznany autor → część e-maila przed @', () => {
    render(<CampaignMetaLines names={{}} campaign={{
      status: 'scheduled', created_by: 'ktos@example.com', created_at: '2026-10-19T08:00:00Z',
      scheduled_at: '2026-10-25T09:00:00Z',
    }} />);
    expect(screen.getByText(/Utworzył\(a\): ktos ·/)).toBeTruthy();
    expect(screen.getByText(/Zaplanowano:/)).toBeTruthy();
    expect(screen.queryByText(/Wysłano:/)).toBeNull();
  });

  it('statystyki: blok szczegółów z odbiorcami i zakończeniem', () => {
    render(<CampaignMetaDetails names={{}} recipientCount={12} campaign={{
      status: 'sent', created_by: 'a@b.pl', created_at: '2026-10-19T08:00:00Z',
      started_at: '2026-10-19T08:01:00Z', completed_at: '2026-10-19T08:02:00Z',
    }} />);
    expect(screen.getByText('Zakończono')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });
});
