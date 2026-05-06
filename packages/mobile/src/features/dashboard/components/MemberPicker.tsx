import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, User, UserX, X } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';

export interface PickedMember {
  email: string;
  fullName: string;
}

interface PickerMember {
  id: number | string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
}

const useMembersWithEmail = () =>
  useQuery({
    queryKey: ['members', 'with-email'],
    queryFn: async (): Promise<PickerMember[]> => {
      const { data, error } = await supabase
        .from('members')
        .select('id, email, first_name, last_name, photo_url')
        .not('email', 'is', null)
        .order('last_name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).filter((m) => !!m.email);
    },
    staleTime: 5 * 60 * 1000,
  });

const fullName = (m: PickerMember): string => {
  const parts = [m.first_name, m.last_name].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(' ');
  return m.email ?? '?';
};

const initials = (m: PickerMember): string => {
  const f = m.first_name?.charAt(0).toUpperCase() ?? '';
  const l = m.last_name?.charAt(0).toUpperCase() ?? '';
  if (f || l) return (f + l).slice(0, 2);
  return (m.email ?? '?').charAt(0).toUpperCase();
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (member: PickedMember | null) => void;
  selectedEmail: string | null;
}

export const MemberPicker = ({ visible, onClose, onSelect, selectedEmail }: Props) => {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useMembersWithEmail();

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) => {
      const name = fullName(m).toLowerCase();
      const email = (m.email ?? '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [data, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: '#ffffff',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 16,
            paddingBottom: 24,
            maxHeight: '85%',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                color: '#0c0a09',
                letterSpacing: -0.4,
                fontFamily: 'Inter_700Bold',
              }}
            >
              Przypisz osobę
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#78716c" />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 14,
                height: 42,
                borderRadius: 14,
                backgroundColor: '#fafaf9',
                borderWidth: 1,
                borderColor: '#eef0f3',
              }}
            >
              <Search size={16} color="#a8a29e" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Szukaj po imieniu lub email…"
                placeholderTextColor="#a8a29e"
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: '#0c0a09',
                  fontFamily: 'Inter_500Medium',
                }}
                autoCapitalize="none"
              />
            </View>
          </View>

          <Pressable
            onPress={() => {
              onSelect(null);
              onClose();
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#f5f5f4',
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#f5f5f4',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserX size={16} color="#78716c" />
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: '#1c1917',
                fontFamily: 'Inter_600SemiBold',
              }}
            >
              Bez przypisania
            </Text>
            {!selectedEmail ? <Check size={16} color="#ec4899" /> : null}
          </Pressable>

          {isLoading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator color="#ec4899" />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(m) => String(m.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text
                  style={{
                    textAlign: 'center',
                    paddingVertical: 32,
                    color: '#78716c',
                    fontFamily: 'Inter_500Medium',
                  }}
                >
                  Brak wyników.
                </Text>
              }
              renderItem={({ item }) => {
                const selected = !!selectedEmail && item.email === selectedEmail;
                return (
                  <Pressable
                    onPress={() => {
                      onSelect({ email: item.email!, fullName: fullName(item) });
                      onClose();
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: '#f5f5f4',
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: '#fef3f2',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{ color: '#be185d', fontFamily: 'Inter_700Bold', fontSize: 13 }}
                      >
                        {initials(item)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: '#0c0a09',
                          fontFamily: 'Inter_600SemiBold',
                        }}
                        numberOfLines={1}
                      >
                        {fullName(item)}
                      </Text>
                      {item.email ? (
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 12,
                            color: '#78716c',
                            marginTop: 2,
                            fontFamily: 'Inter_500Medium',
                          }}
                        >
                          {item.email}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? <Check size={18} color="#ec4899" /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

export const MemberAvatar = ({
  email,
  name,
  size = 28,
}: {
  email: string;
  name: string | null;
  size?: number;
}) => {
  const display = name || email.split('@')[0];
  const initialsLetter = (display.match(/\b\w/g) || []).slice(0, 2).join('').toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#fef3f2',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: Math.round(size * 0.4),
          color: '#be185d',
          fontFamily: 'Inter_700Bold',
        }}
      >
        {initialsLetter || <User size={Math.round(size * 0.5)} color="#be185d" />}
      </Text>
    </View>
  );
};
