import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Lock, X } from 'lucide-react-native';
import { useUpdateMember, type MemberRow, type MemberStatus } from '../api';

const STATUSES: MemberStatus[] = ['Członek', 'Sympatyk', 'Gość'];

const inputStyle = {
  height: 46,
  borderRadius: 14,
  paddingHorizontal: 14,
  backgroundColor: '#ECE8DE',
  fontSize: 15,
  color: '#2A2312',
  fontFamily: 'Manrope_500Medium',
} as const;

const Label = ({ children, locked }: { children: string; locked?: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 16, marginBottom: 6 }}>
    <Text style={{ fontSize: 12, color: '#8A6606', fontFamily: 'Manrope_700Bold', letterSpacing: 1.2, textTransform: 'uppercase' }}>
      {children}
    </Text>
    {locked ? <Lock size={11} color="#857F70" /> : null}
  </View>
);

export const EditMemberModal = ({
  visible,
  member,
  onClose,
  fieldWritable,
}: {
  visible: boolean;
  member: MemberRow;
  onClose: () => void;
  fieldWritable: (resource: string, column: string) => boolean;
}) => {
  const update = useUpdateMember(fieldWritable);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    status: null as MemberStatus | null,
    birth_date: '',
    notes: '',
  });

  useEffect(() => {
    if (visible) {
      setForm({
        first_name: member.first_name ?? '',
        last_name: member.last_name ?? '',
        email: member.email ?? '',
        phone: member.phone ?? '',
        address: member.address ?? '',
        status: (member.status as MemberStatus) ?? null,
        birth_date: member.birth_date ? String(member.birth_date).slice(0, 10) : '',
        notes: member.notes ?? '',
      });
    }
  }, [visible, member]);

  const can = (col: string) => fieldWritable('members', col);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      Alert.alert('Uzupełnij dane', 'Imię i nazwisko są wymagane.');
      return;
    }
    if (form.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.birth_date)) {
      Alert.alert('Błędna data urodzenia', 'Wpisz datę jako RRRR-MM-DD.');
      return;
    }
    try {
      await update.mutateAsync({
        before: member,
        after: {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          address: form.address,
          status: form.status,
          birth_date: form.birth_date || null,
          notes: form.notes,
        },
      });
      onClose();
    } catch (e: any) {
      Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.');
    }
  };

  const field = (key: keyof typeof form, label: string, opts: { placeholder?: string; keyboard?: 'email-address' | 'phone-pad'; multiline?: boolean } = {}) => {
    const locked = !can(key);
    return (
      <>
        <Label locked={locked}>{label}</Label>
        <TextInput
          value={String(form[key] ?? '')}
          onChangeText={set(key)}
          editable={!locked}
          placeholder={opts.placeholder}
          placeholderTextColor="#857F70"
          keyboardType={opts.keyboard}
          autoCapitalize={opts.keyboard === 'email-address' ? 'none' : 'sentences'}
          multiline={opts.multiline}
          style={[
            inputStyle,
            opts.multiline ? { height: 96, paddingTop: 12, textAlignVertical: 'top' as const } : null,
            locked ? { color: '#857F70' } : null,
          ]}
        />
      </>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 20, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Edytuj dane</Text>
          <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
            <X size={22} color="#4A463E" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>{field('first_name', 'Imię')}</View>
            <View style={{ flex: 1 }}>{field('last_name', 'Nazwisko')}</View>
          </View>

          <Label locked={!can('status')}>Status</Label>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {STATUSES.map((st) => {
              const on = form.status === st;
              return (
                <Pressable
                  key={st}
                  disabled={!can('status')}
                  onPress={() => setForm((f) => ({ ...f, status: st }))}
                  className="active:opacity-70"
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: on ? '#2A2312' : '#ECE8DE',
                    opacity: can('status') ? 1 : 0.5,
                  }}
                >
                  <Text style={{ fontSize: 13, color: on ? '#ffffff' : '#3A3427', fontFamily: 'Manrope_600SemiBold' }}>{st}</Text>
                </Pressable>
              );
            })}
          </View>

          {field('phone', 'Telefon', { keyboard: 'phone-pad', placeholder: '+48 …' })}
          {field('email', 'E-mail', { keyboard: 'email-address' })}
          {field('address', 'Adres')}
          {field('birth_date', 'Data urodzenia', { placeholder: 'RRRR-MM-DD' })}
          {field('notes', 'Notatki', { multiline: true })}

          <Pressable
            onPress={save}
            disabled={update.isPending}
            className="active:opacity-80"
            style={{
              marginTop: 22,
              height: 52,
              borderRadius: 16,
              backgroundColor: '#2A2312',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: update.isPending ? 0.6 : 1,
            }}
          >
            {update.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>Zapisz zmiany</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};
