import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useAuthSession } from '../../../src/lib/auth';
import {
  CATEGORY_META,
  useCreatePrayer,
  type PrayerCategory,
} from '../../../src/features/prayers/api';
import { GradientButton } from '../../../src/components/ui/GradientButton';

const CATEGORIES: PrayerCategory[] = ['zdrowie', 'rodzina', 'finanse', 'duchowe', 'inne'];

const labelStyle = {
  fontSize: 12,
  color: '#57534e',
  marginBottom: 6,
  letterSpacing: 0.4,
  textTransform: 'uppercase' as const,
  fontFamily: 'Inter_700Bold',
};

const inputStyle = {
  borderWidth: 1,
  borderColor: '#eef0f3',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: '#0c0a09',
  backgroundColor: '#fafaf9',
  marginBottom: 16,
  fontFamily: 'Inter_400Regular',
} as const;

export default function NewPrayerScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const create = useCreatePrayer(user?.email ?? null);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PrayerCategory>('inne');
  const [requesterName, setRequesterName] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('Wpisz intencję', 'Treść intencji nie może być pusta.');
      return;
    }
    try {
      await create.mutateAsync({
        content: content.trim(),
        category,
        requester_name: requesterName.trim() || null,
        is_anonymous: anonymous,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się dodać intencji.');
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: '#ffffff' }}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 48,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#e7e5e4',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color="#1c1917" strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
              Nowa intencja
            </Text>
            <Text
              style={{
                fontSize: 24,
                color: '#0c0a09',
                marginTop: 2,
                letterSpacing: -0.6,
                fontFamily: 'Inter_700Bold',
              }}
            >
              Modlitwa
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={labelStyle}>Treść intencji</Text>
          <TextInput
            style={[inputStyle, { minHeight: 120, textAlignVertical: 'top' as const }]}
            placeholder="O co chciałabyś/chciałbyś prosić w modlitwie?"
            placeholderTextColor="#a8a29e"
            multiline
            value={content}
            onChangeText={setContent}
            editable={!create.isPending}
          />

          <Text style={labelStyle}>Kategoria</Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}
          >
            {CATEGORIES.map((c) => {
              const meta = CATEGORY_META[c];
              const active = category === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? meta.tint : meta.bg,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>{meta.emoji}</Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: active ? '#ffffff' : meta.tint,
                      fontFamily: 'Inter_600SemiBold',
                    }}
                  >
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={labelStyle}>Imię osoby, za którą się modlimy (opcjonalne)</Text>
          <TextInput
            style={inputStyle}
            placeholder="np. Anna, mama Marka..."
            placeholderTextColor="#a8a29e"
            value={requesterName}
            onChangeText={setRequesterName}
            editable={!create.isPending}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#eef0f3',
              marginBottom: 24,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  color: '#0c0a09',
                  letterSpacing: -0.2,
                  fontFamily: 'Inter_600SemiBold',
                }}
              >
                Anonimowo
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: '#78716c',
                  marginTop: 2,
                  fontFamily: 'Inter_400Regular',
                }}
              >
                Twój email nie będzie widoczny dla innych
              </Text>
            </View>
            <Switch
              value={anonymous}
              onValueChange={setAnonymous}
              trackColor={{ true: '#ec4899', false: '#e7e5e4' }}
              thumbColor="#ffffff"
              ios_backgroundColor="#e7e5e4"
            />
          </View>

          <GradientButton onPress={handleSubmit} loading={create.isPending}>
            Podziel się intencją
          </GradientButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
