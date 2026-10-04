import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, Navigation } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useHomeGroupsMap, type HomeGroupMapPin } from '../../../src/features/home-groups/mapApi';

// react-native-maps to moduł NATYWNY — obecny dopiero w buildzie EAS z tą zależnością.
// require w try/catch chroni przed crashem, gdyby ten JS trafił (np. OTA) na starszy
// build bez modułu — wtedy pokazujemy listę z nawigacją zamiast mapy.
let Maps: any = null;
try {
  Maps = require('react-native-maps');
} catch {
  Maps = null;
}
const MapView: any = Maps?.default ?? null;
const Marker: any = Maps?.Marker ?? null;
const Callout: any = Maps?.Callout ?? null;
const mapsAvailable = !!MapView;

const openMaps = (query: string) => {
  const q = encodeURIComponent(query);
  const url = Platform.select({
    ios: `http://maps.apple.com/?q=${q}`,
    android: `geo:0,0?q=${q}`,
    default: `https://www.google.com/maps/search/?api=1&query=${q}`,
  })!;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() =>
      Alert.alert('Nie udało się otworzyć map', query),
    ),
  );
};

const hasCoords = (g: HomeGroupMapPin) => g.latitude != null && g.longitude != null;

export default function HomeGroupsMapScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useHomeGroupsMap();
  const groups: HomeGroupMapPin[] = data ?? [];
  const pinned = useMemo(() => groups.filter(hasCoords), [groups]);
  const unpinned = useMemo(
    () => groups.filter((g) => !hasCoords(g) && (g.address || g.location)),
    [groups],
  );

  // Region startowy: środek pinezek (albo środek Polski, gdy brak).
  const region = useMemo(() => {
    if (pinned.length === 0) {
      return { latitude: 52.07, longitude: 19.48, latitudeDelta: 6, longitudeDelta: 6 };
    }
    const lats = pinned.map((g) => g.latitude as number);
    const lngs = pinned.map((g) => g.longitude as number);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latDelta = Math.max(0.05, (maxLat - minLat) * 1.5);
    const lngDelta = Math.max(0.05, (maxLng - minLng) * 1.5);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [pinned]);

  const NavRow = ({ g }: { g: HomeGroupMapPin }) => (
    <Pressable
      onPress={() => openMaps(g.address || g.location || g.name)}
      className="active:opacity-80"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E6E1D5',
        backgroundColor: '#F6F4EE',
      }}
    >
      <View
        style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#ECE8DE', alignItems: 'center', justifyContent: 'center' }}
      >
        <MapPin size={18} color="#2A2312" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>
          {g.name}
        </Text>
        {g.location || g.address ? (
          <Text style={{ fontSize: 12, color: '#6B6557', marginTop: 1, fontFamily: 'Manrope_400Regular' }} numberOfLines={1}>
            {g.location || g.address}
          </Text>
        ) : null}
      </View>
      <Navigation size={16} color="#2A2312" />
    </Pressable>
  );

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Mapa grup" subtitle="Gdzie spotykają się grupy domowe" showBack />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#e11d48', textAlign: 'center', fontFamily: 'Manrope_500Medium' }}>
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : mapsAvailable && pinned.length > 0 ? (
          <View style={{ flex: 1 }}>
            <MapView style={{ flex: 1 }} initialRegion={region}>
              {pinned.map((g) => (
                <Marker
                  key={g.id}
                  coordinate={{ latitude: g.latitude as number, longitude: g.longitude as number }}
                  title={g.name}
                  description={g.location || g.address || undefined}
                  pinColor="#2A2312"
                >
                  {Callout ? (
                    <Callout onPress={() => openMaps(g.address || g.location || g.name)}>
                      <View style={{ maxWidth: 220, padding: 4 }}>
                        <Text style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{g.name}</Text>
                        {g.location || g.address ? (
                          <Text style={{ fontSize: 12, color: '#4A463E', marginTop: 2, fontFamily: 'Manrope_400Regular' }}>
                            {g.location || g.address}
                          </Text>
                        ) : null}
                        <Text style={{ fontSize: 12, color: '#2A2312', marginTop: 4, fontFamily: 'Manrope_700Bold' }}>
                          Dotknij, aby nawigować →
                        </Text>
                      </View>
                    </Callout>
                  ) : null}
                </Marker>
              ))}
            </MapView>
            {unpinned.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E6E1D5' }}>
                <Text style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
                  {unpinned.length} {unpinned.length === 1 ? 'grupa' : 'grup'} bez lokalizacji na mapie — otwórz listę grup, by nawigować po adresie.
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          // Fallback: brak modułu map (OTA/stary build) LUB brak pinezek → lista z nawigacją.
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                padding: 14,
                borderRadius: 14,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E3DDD0',
                marginBottom: 14,
              }}
            >
              <MapPin size={16} color="#2A2312" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: '#1e3a8a', fontFamily: 'Manrope_500Medium', lineHeight: 18 }}>
                {!mapsAvailable
                  ? 'Mapa pojawi się po aktualizacji aplikacji. Na razie nawiguj do grup z listy poniżej.'
                  : 'Lokalizacje grup są jeszcze ustalane. Nawiguj po adresie z listy poniżej.'}
              </Text>
            </View>

            {(unpinned.length > 0 ? unpinned : groups).map((g) => (
              <NavRow key={g.id} g={g} />
            ))}

            {groups.length === 0 ? (
              <Text style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#857F70', fontFamily: 'Manrope_400Regular' }}>
                Brak grup domowych do pokazania.
              </Text>
            ) : null}

            <Pressable
              onPress={() => router.push('/(app)/home-groups')}
              style={{ marginTop: 10, alignItems: 'center', paddingVertical: 12 }}
            >
              <Text style={{ fontSize: 13, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Otwórz listę grup</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </>
  );
}
