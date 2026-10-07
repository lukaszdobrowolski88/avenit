import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { LogOut, Monitor, Smartphone } from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B, IconWell, ListCard, ListRow, SectionLabel } from '../../../src/components/ui/brand';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { useSessions } from '../../../src/features/account/api';
import { supabase } from '../../../src/lib/supabase';
import { plural } from '../../../src/lib/domain';
import { showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import { useQueryClient } from '@tanstack/react-query';

interface SessionRow {
  id: string | number;
  user_agent: string | null;
  created_at: string;
  current: boolean;
}

// Skrót opisu urządzenia z user-agent (bez pełnego ciągu technicznego).
const deviceLabel = (ua: string | null): string => {
  if (!ua) return 'Nieznane urządzenie';
  const s = ua.toLowerCase();
  if (s.includes('okhttp') || s.includes('expo') || s.includes('android')) {
    if (s.includes('iphone') || s.includes('ios')) return 'Aplikacja Avenit · iPhone';
    if (s.includes('ipad')) return 'Aplikacja Avenit · iPad';
    if (s.includes('android')) return 'Aplikacja Avenit · Android';
    return 'Aplikacja Avenit';
  }
  if (s.includes('iphone')) return 'Safari · iPhone';
  if (s.includes('ipad')) return 'Safari · iPad';
  if (s.includes('mac os') || s.includes('macintosh')) return 'Przeglądarka · Mac';
  if (s.includes('windows')) return 'Przeglądarka · Windows';
  if (s.includes('chrome')) return 'Przeglądarka · Chrome';
  if (s.includes('firefox')) return 'Przeglądarka · Firefox';
  return 'Przeglądarka';
};

const isMobileUa = (ua: string | null): boolean => {
  const s = (ua ?? '').toLowerCase();
  return s.includes('okhttp') || s.includes('expo') || s.includes('android') || s.includes('iphone') || s.includes('ipad');
};

export default function SessionsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useSessions();
  const sessions = (data ?? []) as SessionRow[];
  const [busy, setBusy] = useState(false);
  const others = sessions.filter((s) => !s.current).length;

  const logoutOthers = () => {
    if (others === 0 || busy) return;
    const what = `${others} ${plural(others, 'inne urządzenie', 'inne urządzenia', 'innych urządzeń')}`;
    Alert.alert(
      'Wylogować pozostałe urządzenia?',
      `Wylogujesz ${what}. Zostaniesz zalogowany tylko na tym telefonie.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyloguj pozostałe',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const { ok } = await supabase.auth.logoutOthers();
              if (!ok) throw new Error('Nie udało się wylogować pozostałych urządzeń.');
              toast.success('Wylogowano z pozostałych urządzeń');
              qc.invalidateQueries({ queryKey: ['sessions'] });
              refetch();
            } catch (e) {
              showError('Nie udało się wylogować', e, 'Nie udało się wylogować pozostałych urządzeń.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Zalogowane urządzenia" subtitle="Bezpieczeństwo i logowanie" showBack />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
            {/* Bieżące urządzenie — ciemna karta marki; pozostałe w jednej białej liście. */}
            {sessions
              .filter((s) => s.current)
              .map((s) => {
                const Icon = isMobileUa(s.user_agent) ? Smartphone : Monitor;
                return (
                  <View
                    key={String(s.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, backgroundColor: B.ink }}
                  >
                    <IconWell Icon={Icon} tone="kurkuma" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: B.kurkuma, fontFamily: 'Manrope_700Bold' }}>
                        To urządzenie
                      </Text>
                      <Text style={{ fontSize: 17, color: B.onDark, marginTop: 2, letterSpacing: -0.3, fontFamily: 'Manrope_700Bold' }}>
                        {deviceLabel(s.user_agent)}
                      </Text>
                      <Text style={{ fontSize: 13, color: B.onDarkMuted, marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                        Zalogowano {format(new Date(s.created_at), 'd MMM yyyy, HH:mm', { locale: pl })}
                      </Text>
                    </View>
                  </View>
                );
              })}

            {sessions.some((s) => !s.current) ? (
              <>
                <SectionLabel count={sessions.filter((s) => !s.current).length}>Inne urządzenia</SectionLabel>
                <ListCard>
                  {sessions
                    .filter((s) => !s.current)
                    .map((s) => (
                      <ListRow
                        key={String(s.id)}
                        leading={<IconWell Icon={isMobileUa(s.user_agent) ? Smartphone : Monitor} size={42} />}
                        dividerInset={72}
                        title={deviceLabel(s.user_agent)}
                        subtitle={`Zalogowano ${format(new Date(s.created_at), 'd MMM yyyy, HH:mm', { locale: pl })}`}
                      />
                    ))}
                </ListCard>
              </>
            ) : null}

            {sessions.length === 0 ? (
              <EmptyState
                Icon={Smartphone}
                title="Brak aktywnych sesji do wyświetlenia"
                hint="Pociągnij w dół, aby odświeżyć."
                actionLabel="Odśwież"
                onAction={() => refetch()}
              />
            ) : others > 0 ? (
              <Pressable
                onPress={logoutOthers}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ busy }}
                className="active:opacity-70"
                style={{
                  marginTop: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: '#FFFFFF',
                }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={B.danger} />
                ) : (
                  <LogOut size={16} color={B.danger} />
                )}
                <Text style={{ fontSize: 14, color: B.danger, fontFamily: 'Manrope_700Bold' }}>
                  Wyloguj pozostałe urządzenia ({others})
                </Text>
              </Pressable>
            ) : (
              <Text
                style={{
                  textAlign: 'center',
                  marginTop: 14,
                  fontSize: 13,
                  color: B.ink4,
                  fontFamily: 'Manrope_500Medium',
                }}
              >
                Jesteś zalogowany tylko na tym urządzeniu.
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}
