import 'react-native-get-random-values';
import { ActivityIndicator, Linking, Platform, Pressable, Share, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, Share2 } from 'lucide-react-native';
import { Sheet } from '../../../components/ui/Sheet';
import { B } from '../../../components/ui/brand';
import { FONT as F } from '../../../lib/fonts';
import { supabase, tenantWebBase } from '../../../lib/supabase';
import { showError } from '../../../lib/errors';

// „Moje służby w kalendarzu” (jak web MyServicesModal): osobisty kanał iCal
// (ical_subscriptions, ten sam co Mój profil → Kalendarz na webie) z preferencją my_services.
// Brak subskrypcji → zakładamy ją tylko ze służbami; istniejąca z wyłączonymi służbami → włączamy.
// Kalendarz telefonu (Apple/Google) odświeża się sam.
const newToken = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

interface Sub {
  id: string;
  token: string;
  export_preferences: Record<string, boolean> | null;
}

async function ensureMyServicesFeed(email: string): Promise<Sub> {
  const { data, error } = await supabase.from('ical_subscriptions').select('*').eq('user_email', email).maybeSingle();
  if (error) throw error;
  let sub = data as Sub | null;
  if (!sub) {
    const { data: created, error: insErr } = await supabase
      .from('ical_subscriptions')
      .insert({ user_email: email, token: newToken(), export_preferences: { my_services: true, programs: false, events: false, tasks: false } })
      .select()
      .single();
    if (insErr) throw insErr;
    sub = created as Sub;
  } else if (sub.export_preferences?.my_services === false) {
    const prefs = { ...(sub.export_preferences || {}), my_services: true };
    const { error: upErr } = await supabase.from('ical_subscriptions').update({ export_preferences: prefs }).eq('id', sub.id);
    if (upErr) throw upErr;
    sub = { ...sub, export_preferences: prefs };
  }
  return sub;
}

const Option = ({ Icon, label, hint, onPress }: { Icon: typeof CalendarDays; label: string; hint: string; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    className="active:opacity-70"
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: B.card, borderRadius: 18, padding: 14 }}
  >
    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={18} color={B.ink} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{label}</Text>
      <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium, marginTop: 1 }}>{hint}</Text>
    </View>
  </Pressable>
);

export function MyServicesCalendarSheet({ visible, email, onClose }: { visible: boolean; email: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['ical', 'my-services', email ?? ''],
    enabled: visible && !!email,
    retry: false,
    staleTime: Infinity,
    queryFn: () => ensureMyServicesFeed(email as string),
  });
  const base = tenantWebBase();
  const sub = q.data as Sub | undefined;
  const httpsUrl = sub && base ? `${base}/api/fn/ical/${sub.token}` : '';
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://');
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  const open = (url: string) => Linking.openURL(url).catch((e) => showError('Nie udało się otworzyć kalendarza', e));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow="Moje służby"
      title="Dodaj do kalendarza telefonu"
      subtitle="Twoje służby (wszystkich zespołów) pojawią się w kalendarzu i same się zaktualizują."
    >
      {q.isLoading ? (
        <ActivityIndicator color={B.ink} style={{ marginTop: 24 }} />
      ) : q.isError || !httpsUrl ? (
        <Text style={{ marginTop: 12, fontSize: 14, color: B.danger, fontFamily: F.semibold }}>
          Nie udało się przygotować kalendarza. Spróbuj ponownie później.
        </Text>
      ) : (
        <View style={{ gap: 10, marginTop: 8 }}>
          {Platform.OS === 'ios' ? (
            <Option Icon={CalendarDays} label="Kalendarz iPhone'a" hint="Subskrypcja w aplikacji Kalendarz" onPress={() => open(webcalUrl)} />
          ) : null}
          <Option Icon={ExternalLink} label="Kalendarz Google" hint="Dodaj w przeglądarce — pojawi się też w telefonie" onPress={() => open(googleUrl)} />
          <Option
            Icon={Share2}
            label="Wyślij link"
            hint="Np. do Outlooka albo na komputer"
            onPress={() => void Share.share({ message: httpsUrl }).catch(() => undefined)}
          />
          <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: B.ink3, fontFamily: F.medium }}>
            Nowe służby pojawią się automatycznie (kalendarz odświeża się co kilka godzin). Link jest prywatny — nie
            udostępniaj go innym.
          </Text>
        </View>
      )}
    </Sheet>
  );
}
