import { ActivityIndicator, Text, View } from 'react-native';
import { Sheet } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { userLabel } from '@avenit/shared/src/lib/campaignName.js';
import { pct, useRecipientRows, useUserNames, type CampaignKind, type CampaignRow } from '../api';
import { PRICE_PER_PART, formatPLN } from '../smsEncoding';
import { StatTile, fmtDateTime } from './ui';

// Statystyki kampanii jak CampaignStats na webie: liczniki z kampanii (recipient/sent/delivered/
// opened/action — push; …/replied/failed/koszt — SMS), odpowiedzi SMS z sms_inline_responses.
// Tabela per odbiorca i eksport CSV zostają na webie.

const STATUS_LABEL: Record<string, string> = {
  pending: 'Oczekuje',
  queued: 'Kolejka',
  sent: 'Wysłany',
  delivered: 'Dostarczony',
  opened: 'Otwarty',
  action_clicked: 'Akcja',
  replied: 'Odpowiedź',
  failed: 'Błąd',
  suppressed: 'Pominięty',
};

export const StatsSheet = ({ kind, campaign, onClose }: { kind: CampaignKind; campaign: CampaignRow | null; onClose: () => void }) => {
  const rows = useRecipientRows(kind, campaign?.id ?? null);
  const names = useUserNames().data ?? {};
  const recipients: any[] = rows.data?.recipients ?? [];
  const responses: any[] = rows.data?.responses ?? [];
  const c = campaign;
  const total = c?.recipient_count || recipients.length;
  const sent = c?.sent_count || 0;
  const delivered = c?.delivered_count || 0;
  const failed = c?.failed_count || 0;
  const points = Number(c?.total_cost || 0);
  const costPLN = points * PRICE_PER_PART;

  // Rozkład statusów odbiorców (zamiast tabeli z filtrami na webie).
  const byStatus = new Map<string, number>();
  recipients.forEach((r) => byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1));
  const failedRows = recipients.filter((r) => r.status === 'failed' && r.error).slice(0, 5);

  // „Kto i kiedy” — jak nagłówek statystyk na webie.
  const details: [string, string][] = c
    ? ([
        ['Utworzył(a)', userLabel(c.created_by, names) || '—'],
        ['Utworzono', fmtDateTime(c.created_at)],
        c.status === 'scheduled' && c.scheduled_at ? ['Zaplanowano', fmtDateTime(c.scheduled_at)] : null,
        c.started_at ? ['Wysłano', fmtDateTime(c.started_at)] : null,
        c.completed_at ? ['Zakończono', fmtDateTime(c.completed_at)] : null,
        ['Odbiorcy', String(total)],
      ].filter(Boolean) as [string, string][])
    : [];

  return (
    <Sheet
      visible={!!c}
      onClose={onClose}
      title={c?.name || 'Kampania'}
      eyebrow="Statystyki"
      subtitle={kind === 'sms' ? `Od: ${c?.sender ?? '—'}` : c?.title ?? null}
    >
      <View style={{ borderRadius: 18, backgroundColor: B.card, overflow: 'hidden', marginTop: 6, marginBottom: 12 }}>
        {details.map(([label, value], i) => (
          <View key={label} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
            <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>{label}</Text>
            <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: 13, color: B.ink, fontFamily: F.semibold }}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatTile label="Odbiorcy" value={String(total)} dark />
        <StatTile label="Wysłane" value={String(sent)} sub={`${pct(sent, total)}%`} />
        <StatTile label="Dostarczone" value={String(delivered)} sub={`${pct(delivered, total)}%`} />
        {kind === 'push' ? (
          <>
            <StatTile label="Otwarte" value={String(c?.opened_count || 0)} sub={`${pct(c?.opened_count || 0, total)}%`} />
            <StatTile label="Akcje" value={String(c?.action_clicked_count || 0)} sub={`${pct(c?.action_clicked_count || 0, total)}%`} />
          </>
        ) : (
          <>
            <StatTile label="Odpowiedzi" value={String(c?.replied_count || 0)} sub={`${pct(c?.replied_count || 0, total)}%`} />
            <StatTile label="Błędy" value={String(failed)} sub={`${pct(failed, total)}%`} />
            <StatTile label="Koszt" value={formatPLN(costPLN)} sub={`~${formatPLN(total > 0 ? costPLN / total : 0)}/SMS`} />
          </>
        )}
      </View>

      {failed > 0 ? (
        <View style={{ marginTop: 14, borderRadius: 16, backgroundColor: B.dangerBg, padding: 12 }}>
          <Text style={{ fontSize: 13, color: B.danger, fontFamily: F.semibold }}>
            {failed} wysyłek zakończyło się błędem ({pct(failed, total)}%)
          </Text>
          {failedRows.map((r) => (
            <Text key={r.id} numberOfLines={1} style={{ marginTop: 4, fontSize: 12, color: B.danger, fontFamily: F.medium }}>
              {(r.user_email || (r.phone ? `+${r.phone}` : '—')) + ': ' + r.error}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={{ marginTop: 22, marginBottom: 8, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: F.bold }}>
        Odbiorcy według statusu
      </Text>
      {rows.isLoading ? (
        <ActivityIndicator color={B.ink} style={{ marginTop: 10 }} />
      ) : recipients.length === 0 ? (
        <Text style={{ fontSize: 13, color: B.ink4, fontFamily: F.medium }}>Brak rekordów odbiorców.</Text>
      ) : (
        <View style={{ borderRadius: 18, backgroundColor: B.card, overflow: 'hidden' }}>
          {Array.from(byStatus.entries()).map(([status, n], i) => (
            <View key={status} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
              <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>{STATUS_LABEL[status] ?? status}</Text>
              <Text style={{ fontSize: 14, color: B.ink2, fontFamily: F.bold }}>{n}</Text>
            </View>
          ))}
        </View>
      )}

      {kind === 'sms' && responses.length > 0 ? (
        <>
          <Text style={{ marginTop: 22, marginBottom: 8, fontSize: 12, letterSpacing: 1.3, textTransform: 'uppercase', color: B.gold, fontFamily: F.bold }}>
            Odpowiedzi · {responses.length}
          </Text>
          <View style={{ borderRadius: 18, backgroundColor: B.card, overflow: 'hidden' }}>
            {responses.map((r, i) => {
              const yes = r.response_value === 'yes';
              const no = r.response_value === 'no';
              return (
                <View key={r.id} style={{ flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}>
                  <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: yes ? B.okBg : no ? B.dangerBg : B.paper2 }}>
                    <Text style={{ fontSize: 11, color: yes ? B.okFg : no ? B.danger : B.ink3, fontFamily: F.bold }}>
                      {r.response_type === 'rsvp' ? String(r.response_value ?? '').toUpperCase() : 'TEKST'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                      +{r.phone}
                      {r.user_email ? ` · ${r.user_email}` : ''} · {fmtDateTime(r.created_at)}
                    </Text>
                    {r.response_type === 'reply' && r.raw_text ? (
                      <Text style={{ marginTop: 3, fontSize: 14, lineHeight: 19, color: B.ink, fontFamily: F.medium }}>{r.raw_text}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
      <Text style={{ marginTop: 16, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
        Szczegóły per odbiorca i eksport CSV są w module na webie.
      </Text>
    </Sheet>
  );
};
