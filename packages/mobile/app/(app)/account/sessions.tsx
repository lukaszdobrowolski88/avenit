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
import { useSessions } from '../../../src/features/account/api';
import { supabase } from '../../../src/lib/supabase';
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
    if (s.includes('iphone') || s.includes('ios')) return 'Aplikacja mobilna · iPhone';
    if (s.includes('ipad')) return 'Aplikacja mobilna · iPad';
    if (s.includes('android')) return 'Aplikacja mobilna · Android';
    return 'Aplikacja mobilna';
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
    if (others === 0) return;
    Alert.alert(
      'Wylogować inne urządzenia?',
      `Zakończysz ${others} ${others === 1 ? 'inną sesję' : 'innych sesji'}. To urządzenie pozostanie zalogowane.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyloguj inne',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { ok } = await supabase.auth.logoutOthers();
            setBusy(false);
            if (ok) {
              qc.invalidateQueries({ queryKey: ['sessions'] });
              refetch();
            } else {
              Alert.alert('Błąd', 'Nie udało się wylogować innych urządzeń.');
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
        <PageHeader title="Aktywne sesje" subtitle="Urządzenia zalogowane do konta" showBack />

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
            {sessions.map((s) => {
              const mobile = isMobileUa(s.user_agent);
              const Icon = mobile ? Smartphone : Monitor;
              return (
                <View
                  key={String(s.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    marginBottom: 10,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: s.current ? '#F3E3B0' : '#E6E1D5',
                    backgroundColor: s.current ? '#FFF8E1' : '#F6F4EE',
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      backgroundColor: s.current ? '#FFF1C2' : '#ECE8DE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={20} color={s.current ? '#8A6606' : '#7A7466'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                        {deviceLabel(s.user_agent)}
                      </Text>
                      {s.current ? (
                        <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: '#2A2312' }}>
                          <Text style={{ fontSize: 10, color: '#ffffff', fontFamily: 'Manrope_700Bold' }}>
                            To urządzenie
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 12, color: '#857F70', marginTop: 2, fontFamily: 'Manrope_400Regular' }}>
                      Zalogowano {format(new Date(s.created_at), 'd MMM yyyy, HH:mm', { locale: pl })}
                    </Text>
                  </View>
                </View>
              );
            })}

            {others > 0 ? (
              <Pressable
                onPress={logoutOthers}
                disabled={busy}
                style={{
                  marginTop: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: '#fecaca',
                  backgroundColor: '#fef2f2',
                }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <LogOut size={16} color="#dc2626" />
                )}
                <Text style={{ fontSize: 14, color: '#dc2626', fontFamily: 'Manrope_700Bold' }}>
                  Wyloguj inne urządzenia ({others})
                </Text>
              </Pressable>
            ) : (
              <Text
                style={{
                  textAlign: 'center',
                  marginTop: 8,
                  fontSize: 13,
                  color: '#857F70',
                  fontFamily: 'Manrope_400Regular',
                }}
              >
                Jesteś zalogowany/a tylko na tym urządzeniu.
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}
