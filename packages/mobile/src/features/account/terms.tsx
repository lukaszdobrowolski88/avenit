import { Linking, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantWebBase } from '../../lib/supabase';
import { B } from '../../components/ui/brand';

// Zasady społeczności (EULA z zakazem treści obraźliwych — wytyczna App Store 1.2). Akceptacja
// zapisywana serwerowo (fn community-terms, kolumny z migracji 089); wersję trzyma serwer —
// jej zmiana wymusza ponowną akceptację.

export const SUPPORT_EMAIL = 'lukasz@avenit.pl';

export const TERMS_RULES: { title: string; body: string }[] = [
  {
    title: 'Szanuj innych',
    body: 'Nie publikuj treści obraźliwych, nienawistnych, wulgarnych, zastraszających ani o charakterze seksualnym.',
  },
  {
    title: 'Bez nękania i spamu',
    body: 'Zakazane są groźby, nękanie, spam, reklamy i podszywanie się pod inne osoby.',
  },
  {
    title: 'Chroń prywatność',
    body: 'Nie przekazuj poza wspólnotę cudzych danych, wiadomości ani próśb modlitewnych bez zgody autora.',
  },
  {
    title: 'Dbaj o dzieci i młodzież',
    body: 'Kontakt z osobami niepełnoletnimi prowadź wyłącznie zgodnie z zasadami ochrony dzieci w Twoim kościele.',
  },
  {
    title: 'Zgłaszaj i blokuj',
    body: 'Treść łamiącą zasady zgłoś przyciskiem ⋯ albo przytrzymując wiadomość. Możesz też zablokować osobę: nie zobaczysz jej wiadomości ani próśb.',
  },
  {
    title: 'Zero tolerancji dla nadużyć',
    body: 'Zgłoszenia rozpatrują moderatorzy kościoła w ciągu 24 godzin. Treści łamiące zasady są usuwane, a konta osób, które je publikują, blokowane.',
  },
];

export const TermsContent = () => (
  <View>
    <Text style={{ fontSize: 15, lineHeight: 22, color: B.ink2, fontFamily: 'Manrope_500Medium', marginBottom: 16 }}>
      Avenit służy wspólnocie Twojego kościoła. Korzystając z wiadomości, ściany modlitwy i innych miejsc, w których
      dzielisz się treściami, zgadzasz się przestrzegać tych zasad.
    </Text>
    {TERMS_RULES.map((r, i) => (
      <View key={r.title} style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: B.kurkumaSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          }}
        >
          <Text style={{ fontSize: 13, color: B.goldDeep, fontFamily: 'Manrope_700Bold' }}>{i + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: B.ink, fontFamily: 'Manrope_700Bold', marginBottom: 2 }}>{r.title}</Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: B.ink2, fontFamily: 'Manrope_500Medium' }}>{r.body}</Text>
        </View>
      </View>
    ))}
    <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink3, fontFamily: 'Manrope_500Medium', marginTop: 4 }}>
      Pełny regulamin:{' '}
      <Text
        style={{ color: B.gold, fontFamily: 'Manrope_700Bold' }}
        onPress={() => Linking.openURL(`${tenantWebBase() || 'https://avenit.pl'}/regulamin`).catch(() => {})}
      >
        otwórz w przeglądarce
      </Text>
      . Kontakt z twórcami aplikacji:{' '}
      <Text
        style={{ color: B.gold, fontFamily: 'Manrope_700Bold' }}
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
      >
        {SUPPORT_EMAIL}
      </Text>
      .
    </Text>
  </View>
);

interface TermsStatus {
  version: string;
  accepted: boolean;
  accepted_at?: string | null;
}

export const termsKey = ['communityTerms'] as const;

export const useTermsStatus = (enabled: boolean) =>
  useQuery({
    queryKey: termsKey,
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<TermsStatus> => {
      const { data, error } = await supabase.functions.invoke('community-terms', { body: {} });
      if (error) throw error;
      return data as TermsStatus;
    },
  });

export const useAcceptTerms = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('community-terms', { body: { accept: true } });
      if (error) throw error;
      return data as TermsStatus;
    },
    onSuccess: (data) => qc.setQueryData(termsKey, data),
  });
};
