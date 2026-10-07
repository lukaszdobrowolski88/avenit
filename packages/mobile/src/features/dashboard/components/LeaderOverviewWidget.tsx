import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ArrowUpRight } from 'lucide-react-native';
import { D, F } from '../theme';
import { WidgetCard } from './WidgetCard';
import { openOnWeb } from '../../modules/useModules';
import type { AttendancePoint, GivingSummary, RsvpCampaignSummary } from '../extras';

// Przegląd dla osób z dostępem do Dawania / Frekwencji / RSVP (jak widżety weba
// GivingMonth, Attendance, RsvpSummary). Każda część tylko, gdy są dane i uprawnienie.

// Kwota bez Intl (Hermes bywa bez pełnego Intl): 12 340 zł.
const money = (n: number) =>
  `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł`;

const shortDate = (ymd: string | null) => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return format(new Date(y, (m ?? 1) - 1, d ?? 1), 'd MMM', { locale: pl });
};

const Block = ({
  label,
  onPress,
  children,
  first,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  first?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-70"
    style={{
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: first ? 0 : 1,
      borderTopColor: D.hair,
      backgroundColor: 'transparent',
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: D.ink2,
          fontFamily: F.semibold,
        }}
      >
        {label}
      </Text>
      <ArrowUpRight size={16} color={D.ink3} />
    </View>
    {children}
  </Pressable>
);

const Big = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 28, color: D.ink, fontFamily: F.bold, letterSpacing: -1 }}>
    {children}
  </Text>
);

const Sub = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 13, color: D.ink2, fontFamily: F.medium, marginTop: 2 }}>{children}</Text>
);

interface Props {
  giving: GivingSummary | null | undefined;
  attendance: AttendancePoint[];
  rsvp: RsvpCampaignSummary[];
}

export const LeaderOverviewWidget = ({ giving, attendance, rsvp }: Props) => {
  const router = useRouter();
  const hasGiving = !!giving && (giving.year > 0 || giving.month > 0);
  const hasAttendance = attendance.length > 0;
  const hasRsvp = rsvp.length > 0;
  if (!hasGiving && !hasAttendance && !hasRsvp) return null;

  const monthName = format(new Date(), 'LLLL', { locale: pl });
  const last = attendance[attendance.length - 1];
  const max = Math.max(1, ...attendance.map((a) => a.headcount));
  let first = true;
  const isFirst = () => {
    const f = first;
    first = false;
    return f;
  };

  return (
    <WidgetCard title="Przegląd">
      {hasGiving ? (
        <Block label={`Hojność · ${monthName}`} onPress={() => router.push('/(app)/giving/admin')} first={isFirst()}>
          <Big>{money(giving!.month)}</Big>
          <Sub>
            {giving!.monthCount} wpłat w tym miesiącu · od stycznia {money(giving!.year)}
          </Sub>
        </Block>
      ) : null}

      {hasAttendance ? (
        <Block label="Frekwencja" onPress={() => router.push('/(app)/attendance')} first={isFirst()}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
            <View>
              <Big>{last?.headcount ?? 0}</Big>
              <Sub>
                {last?.title ? `${last.title} · ` : ''}
                {shortDate(last?.date ?? null)}
              </Sub>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 44 }}>
              {attendance.map((a, i) => (
                <View
                  key={a.id}
                  style={{
                    flex: 1,
                    height: Math.max(4, Math.round((a.headcount / max) * 44)),
                    borderRadius: 4,
                    backgroundColor: i === attendance.length - 1 ? D.ink : '#E2E2DF',
                  }}
                />
              ))}
            </View>
          </View>
        </Block>
      ) : null}

      {hasRsvp ? (
        <Block label="Zapisy (RSVP)" onPress={() => openOnWeb('/rsvp')} first={isFirst()}>
          {rsvp.map((c) => (
            <View
              key={c.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}
            >
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontSize: 14, color: D.ink, fontFamily: F.semibold }}
              >
                {c.title}
                <Text style={{ color: D.ink3, fontFamily: F.medium }}>
                  {c.eventDate ? ` · ${shortDate(c.eventDate)}` : ''}
                </Text>
              </Text>
              <Text style={{ fontSize: 12, color: '#15803d', fontFamily: F.bold }}>{c.yes} tak</Text>
              <Text style={{ fontSize: 12, color: '#8A6606', fontFamily: F.semibold }}>
                {c.pending} czeka
              </Text>
            </View>
          ))}
        </Block>
      ) : null}
    </WidgetCard>
  );
};
