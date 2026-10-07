import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, UserCheck, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { DateField, toYmd } from '../../../src/components/ui/DateField';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { SESSION_TYPES, useCreateSession, useSessions, type Session, type SessionType } from '../../../src/features/attendance/api';
import { DateBlock, Empty, Loading, dayLabel } from '../../../src/features/teams/tabs/ui';
import { friendlyError } from '../../../src/lib/errors';

const TYPE_LABEL = Object.fromEntries(SESSION_TYPES.map((t) => [t.key, t.label])) as Record<SessionType, string>;

const Label = ({ children }: { children: string }) => (
  <Text
    style={{
      fontSize: 12,
      color: '#8A6606',
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 6,
    }}
  >
    {children}
  </Text>
);

const inputStyle = {
  height: 46,
  borderRadius: 14,
  paddingHorizontal: 14,
  backgroundColor: '#ECE8DE',
  fontSize: 15,
  color: '#2A2312',
  fontFamily: 'Manrope_500Medium',
} as const;

export default function AttendanceScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const perms = usePermissions();
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const sessions = useSessions({ selectedCampusId, withCampusFilter });
  const create = useCreateSession(user?.email ?? null, campusIdForInsert);
  const canCreate = perms.can('res:attendance_sessions:create');

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toYmd(new Date()));
  const [type, setType] = useState<SessionType>('service');
  const [headcount, setHeadcount] = useState('');

  const startNew = () => {
    setTitle('');
    setDate(toYmd(new Date()));
    setType('service');
    setHeadcount('');
    setOpen(true);
  };

  const save = async () => {
    if (create.isPending) return;
    const hc = headcount.trim() ? Number(headcount) : null;
    if (hc != null && (!Number.isFinite(hc) || hc < 0)) {
      Alert.alert('Błędna liczba', 'Liczba osób musi być nieujemną liczbą.');
      return;
    }
    try {
      const id = await create.mutateAsync({ title: title.trim() || null, date, type, headcount: hc, note: null });
      setOpen(false);
      router.push({ pathname: '/(app)/attendance/[id]', params: { id } });
    } catch (e: any) {
      Alert.alert('Nie udało się utworzyć sesji', friendlyError(e, 'Spróbuj ponownie.'));
    }
  };

  const list: Session[] = sessions.data ?? [];

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader title="Frekwencja" subtitle="Obecność na spotkaniach" Icon={UserCheck} showBack />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }}
          refreshControl={<RefreshControl refreshing={sessions.isRefetching} onRefresh={() => sessions.refetch()} tintColor="#2A2312" />}
        >
          {canCreate ? (
            <Pressable
              onPress={startNew}
              className="active:opacity-70"
              style={{ height: 46, borderRadius: 14, backgroundColor: '#2A2312', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}
            >
              <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>+ Sprawdź obecność</Text>
            </Pressable>
          ) : null}

          {sessions.isLoading ? <Loading /> : null}
          {!sessions.isLoading && list.length === 0 ? (
            <Empty Icon={UserCheck} title="Brak sesji obecności" hint="Utwórz sesję na nabożeństwie albo spotkaniu i odhacz obecnych." />
          ) : null}

          {list.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push({ pathname: '/(app)/attendance/[id]', params: { id: s.id } })}
              className="active:opacity-70"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF', marginBottom: 10 }}
            >
              <DateBlock ymd={s.date} tint="#2A2312" bg="#F1EEE6" />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                  {s.title || TYPE_LABEL[s.type] || 'Sesja'}
                </Text>
                <Text style={{ fontSize: 12, color: '#6B6557', marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                  {dayLabel(s.date)} · {TYPE_LABEL[s.type] ?? s.type}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 20, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{s.count}</Text>
                <Text style={{ fontSize: 10, color: '#6E685A', fontFamily: 'Manrope_600SemiBold' }}>
                  {s.estimated ? 'szacunkowo' : 'obecnych'}
                </Text>
              </View>
              <ChevronRight size={16} color="#6E685A" />
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 20, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Nowa sesja</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} className="active:opacity-60">
              <X size={22} color="#4A463E" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Label>Rodzaj</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {SESSION_TYPES.map((t) => {
                const on = t.key === type;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setType(t.key)}
                    className="active:opacity-70"
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? '#2A2312' : '#ECE8DE' }}
                  >
                    <Text style={{ fontSize: 13, color: on ? '#ffffff' : '#3A3427', fontFamily: 'Manrope_600SemiBold' }}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Label>Nazwa (opcjonalnie)</Label>
            <TextInput value={title} onChangeText={setTitle} placeholder="np. Nabożeństwo niedzielne" placeholderTextColor="#6E685A" style={inputStyle} />
            <Label>Data</Label>
            <DateField value={date} onChange={setDate} />
            <Label>Liczba osób (szacunkowo, opcjonalnie)</Label>
            <TextInput
              value={headcount}
              onChangeText={(t) => setHeadcount(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="np. 85"
              placeholderTextColor="#6E685A"
              style={inputStyle}
            />
            <Text style={{ fontSize: 12, lineHeight: 17, color: '#6E685A', marginTop: 10, fontFamily: 'Manrope_400Regular' }}>
              Po utworzeniu odhaczysz obecnych z listy członków i dopiszesz gości.
            </Text>
            <Pressable
              onPress={save}
              disabled={create.isPending}
              className="active:opacity-80"
              style={{
                marginTop: 20,
                height: 52,
                borderRadius: 16,
                backgroundColor: '#2A2312',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: create.isPending ? 0.6 : 1,
              }}
            >
              {create.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>Utwórz i odhaczaj</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
