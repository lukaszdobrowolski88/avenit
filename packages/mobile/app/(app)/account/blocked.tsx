import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { UserX } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B } from '../../../src/components/ui/brand';
import { supabase } from '../../../src/lib/supabase';
import { useAuthSession } from '../../../src/lib/auth';
import { showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import { useMyBlocks, useToggleBlock } from '../../../src/features/messenger/plus';

// Zablokowane osoby (Komunikator + ściana modlitwy) z możliwością odblokowania.
export default function BlockedScreen() {
  const { user } = useAuthSession();
  const email = user?.email ?? null;
  const blocks = useMyBlocks(email);
  const toggle = useToggleBlock(email);
  const list: string[] = blocks.data ?? [];

  // Imiona po e-mailu (best-effort — bez dostępu zostaje sam adres).
  const names = useQuery({
    queryKey: ['blockedNames', list.join(',')],
    enabled: list.length > 0,
    queryFn: async () => {
      const { data } = await (supabase.from('app_users') as any).select('email, full_name').in('email', list);
      const map: Record<string, string> = {};
      for (const u of (data ?? []) as { email: string; full_name: string | null }[]) {
        if (u.full_name) map[String(u.email).toLowerCase()] = u.full_name;
      }
      return map;
    },
  });

  const unblock = (target: string, name: string) => {
    Alert.alert(`Odblokować: ${name}?`, 'Znów zobaczysz wiadomości i prośby tej osoby.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Odblokuj',
        onPress: () =>
          toggle.mutate(
            { target, blocked: true },
            {
              onSuccess: () => toast.success(`Odblokowano: ${name}`),
              onError: (e) => showError('Nie udało się odblokować', e),
            },
          ),
      },
    ]);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Zablokowane osoby" subtitle="Prywatność i bezpieczeństwo" showBack />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink3, fontFamily: 'Manrope_500Medium', marginBottom: 14, marginHorizontal: 4 }}>
            Nie widzisz wiadomości ani próśb modlitewnych zablokowanych osób, a one nie mogą pisać do Ciebie prywatnie.
            Zablokowana osoba nie dostaje o tym powiadomienia.
          </Text>
          {blocks.isLoading ? (
            <ActivityIndicator color={B.ink} style={{ marginTop: 24 }} />
          ) : list.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: B.kurkumaSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <UserX size={24} color={B.goldDeep} />
              </View>
              <Text style={{ fontSize: 15, color: B.ink, fontFamily: 'Manrope_700Bold' }}>Nikogo nie blokujesz</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: B.card, borderRadius: 20, overflow: 'hidden' }}>
              {list.map((e, i) => {
                const name = names.data?.[e] || e;
                return (
                  <View
                    key={e}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: B.line,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: 'Manrope_600SemiBold' }}>{name}</Text>
                      {name !== e ? (
                        <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>{e}</Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => unblock(e, name)}
                      disabled={toggle.isPending}
                      className="active:opacity-70"
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: B.paper2 }}
                    >
                      <Text style={{ fontSize: 13, color: B.ink, fontFamily: 'Manrope_700Bold' }}>Odblokuj</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}
