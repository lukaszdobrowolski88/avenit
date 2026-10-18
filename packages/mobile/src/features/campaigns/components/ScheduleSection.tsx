import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Chip, FormInput, FormLabel } from '../../../components/ui/Sheet';
import { DateField, TimeField, toYmd } from '../../../components/ui/DateField';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import type { CampaignKind, SendMode } from '../api';
import { Card, Hint } from './ui';

// Harmonogram jak ScheduleControl na webie: „Wyślij teraz” albo termin (data + godzina z kółek),
// plus ograniczenia: cisza nocna i limit dzienny. „Smart delivery” ustawia się tylko na webie —
// tu pokazujemy informację i zostawiamy wartość, dopóki ktoś nie wybierze innego trybu.

export interface ScheduleValue {
  send_mode: SendMode;
  scheduled_at: string | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  frequency_cap_per_day: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hmOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const combine = (ymd: string, hm: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0, 0, 0).toISOString();
};
// Propozycja terminu: najbliższa pełna godzina za co najmniej 30 minut.
const suggestedDate = () => {
  const d = new Date(Date.now() + 90 * 60_000);
  d.setMinutes(0, 0, 0);
  return d;
};

export const ScheduleSection = ({
  kind,
  value,
  onChange,
}: {
  kind: CampaignKind;
  value: ScheduleValue;
  onChange: (patch: Partial<ScheduleValue>) => void;
}) => {
  const hasLimits = !!(value.quiet_hours_start || value.quiet_hours_end || value.frequency_cap_per_day);
  const [limitsOpen, setLimitsOpen] = useState(hasLimits);
  const at = value.scheduled_at ? new Date(value.scheduled_at) : null;
  const ymd = at ? toYmd(at) : '';
  const hm = at ? hmOf(at) : '';

  const pickMode = (mode: SendMode) => {
    if (mode === 'scheduled' && !value.scheduled_at) {
      onChange({ send_mode: mode, scheduled_at: suggestedDate().toISOString() });
      return;
    }
    onChange({ send_mode: mode });
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Wyślij teraz" on={value.send_mode === 'now'} onPress={() => pickMode('now')} />
        <Chip label="Zaplanuj" on={value.send_mode === 'scheduled'} onPress={() => pickMode('scheduled')} />
      </View>
      <Hint>
        {value.send_mode === 'now'
          ? kind === 'sms'
            ? 'SMS-y wyjdą od razu po potwierdzeniu.'
            : 'Powiadomienie wyjdzie od razu po potwierdzeniu.'
          : value.send_mode === 'scheduled'
            ? 'Kampania wyjdzie automatycznie o wybranej porze (sprawdzamy co minutę).'
            : 'Na webie ustawiono „Smart delivery”. Wybierz tryb powyżej, aby go zmienić.'}
      </Hint>

      {value.send_mode === 'scheduled' ? (
        <View style={{ marginTop: 6 }}>
          <FormLabel>Data wysyłki</FormLabel>
          <DateField
            value={ymd}
            onChange={(next) => {
              if (!next) return;
              onChange({ scheduled_at: combine(next, hm || hmOf(suggestedDate())) });
            }}
          />
          <FormLabel>Godzina</FormLabel>
          <TimeField
            value={hm}
            title="Godzina wysyłki"
            onChange={(next) => {
              if (!next) return;
              onChange({ scheduled_at: combine(ymd || toYmd(suggestedDate()), next) });
            }}
          />
        </View>
      ) : null}

      <Pressable
        onPress={() => setLimitsOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: limitsOpen }}
        className="active:opacity-70"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 4 }}
      >
        <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>Ograniczenia (opcjonalne)</Text>
        {limitsOpen ? <ChevronUp size={18} color={B.ink3} /> : <ChevronDown size={18} color={B.ink3} />}
      </Pressable>
      {limitsOpen ? (
        <View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <FormLabel>Cisza nocna od</FormLabel>
              <TimeField
                value={value.quiet_hours_start ?? ''}
                title="Cisza nocna od"
                optional
                suggest="22:00"
                onChange={(next) => onChange({ quiet_hours_start: next || null })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormLabel>do</FormLabel>
              <TimeField
                value={value.quiet_hours_end ?? ''}
                title="Cisza nocna do"
                optional
                suggest="08:00"
                onChange={(next) => onChange({ quiet_hours_end: next || null })}
              />
            </View>
          </View>
          <FormLabel>{kind === 'sms' ? 'Max SMS-ów dziennie do jednej osoby' : 'Max powiadomień dziennie do jednej osoby'}</FormLabel>
          <FormInput
            value={value.frequency_cap_per_day ? String(value.frequency_cap_per_day) : ''}
            onChangeText={(t) => {
              const n = parseInt(t.replace(/\D/g, ''), 10);
              onChange({ frequency_cap_per_day: Number.isFinite(n) && n > 0 ? Math.min(n, 20) : null });
            }}
            keyboardType="number-pad"
            placeholder="brak limitu"
          />
          <Hint>W ciszy nocnej wysyłka czeka do jej końca.</Hint>
        </View>
      ) : null}
    </Card>
  );
};
