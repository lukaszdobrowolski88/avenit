import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ArrowUpRight, Gauge } from 'lucide-react-native';
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
      borderTopColor: '#f2f0ee',
      backgroundColor: 'transparent',
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
      <Text
        style={{
          flex: 1,
          fontSize: 12,
          color: '#78716c',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          fontFamily: 'Inter_600SemiBold',
        }}
      >
        {label}
      </Text>
      <ArrowUpRight size={14} color="#a8a29e" />
    </View>
    {children}
  </Pressable>
);

const Big = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 26, color: '#0c0a09', fontFamily: 'Inter_700Bold', letterSpacing: -0.8 }}>
    {children}
  </Text>
);

const Sub = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium', marginTop: 2 }}>{children}</Text>
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
    <WidgetCard title="Przegląd" Icon={Gauge} iconTint="#1d4ed8" iconBg="#dbeafe">
      {hasGiving ? (
        <Block label={`Dawanie · ${monthName}`} onPress={() => router.push('/(app)/giving/admin')} first={isFirst()}>
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
                    backgroundColor: i === attendance.length - 1 ? '#1d4ed8' : '#bfdbfe',
                  }}
                />
              ))}
            </View>
          </View>
        </Block>
      ) : null}

      {hasRsvp ? (
        <Block label="Zaproszenia RSVP" onPress={() => openOnWeb('/rsvp')} first={isFirst()}>
          {rsvp.map((c) => (
            <View
              key={c.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}
            >
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontSize: 14, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
              >
                {c.title}
                <Text style={{ color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>
                  {c.eventDate ? ` · ${shortDate(c.eventDate)}` : ''}
                </Text>
              </Text>
              <Text style={{ fontSize: 12, color: '#15803d', fontFamily: 'Inter_700Bold' }}>{c.yes} tak</Text>
              <Text style={{ fontSize: 12, color: '#a16207', fontFamily: 'Inter_600SemiBold' }}>
                {c.pending} czeka
              </Text>
            </View>
          ))}
        </Block>
      ) : null}
    </WidgetCard>
  );
};
