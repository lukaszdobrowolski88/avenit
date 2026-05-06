import { useState, useMemo } from 'react';
import { FlatList, View, TextInput, TouchableOpacity, Linking, RefreshControl, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../../../src/components/ThemedText';
import { AvatarCircle } from '../../../src/components/AvatarCircle';
import { EmptyState } from '../../../src/components/EmptyState';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { supabase } from '../../../src/lib/supabase';

export default function MembersScreen() {
  const { theme } = useTheme();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: members, isLoading, refetch } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone, status, campus_id')
        .eq('status', 'active')
        .order('last_name', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return members || [];
    const q = search.toLowerCase();
    return (members || []).filter((m: any) =>
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.phone?.includes(q)
    );
  }, [members, search]);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function renderMember({ item }: { item: any }) {
    const name = `${item.first_name || ''} ${item.last_name || ''}`.trim();

    return (
      <View style={[styles.memberRow, { borderBottomColor: theme.colors.border.light }]}>
        <AvatarCircle name={name} size={44} />
        <View style={styles.memberInfo}>
          <ThemedText size="base" weight="medium">{name}</ThemedText>
          {item.email && (
            <ThemedText variant="muted" size="xs">{item.email}</ThemedText>
          )}
        </View>
        <View style={styles.actions}>
          {item.phone && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${item.phone}`)}
              style={[styles.actionButton, { backgroundColor: theme.colors.accent.primaryLightest }]}
            >
              <Ionicons name="call" size={16} color={theme.colors.accent.primary} />
            </TouchableOpacity>
          )}
          {item.email && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`mailto:${item.email}`)}
              style={[styles.actionButton, { backgroundColor: theme.colors.accent.secondaryLightest }]}
            >
              <Ionicons name="mail" size={16} color={theme.colors.accent.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={theme.colors.text.muted} style={styles.searchIcon} />
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.colors.input.background,
              borderColor: theme.colors.input.border,
              color: theme.colors.text.primary,
            },
          ]}
          placeholder="Szukaj członków..."
          placeholderTextColor={theme.colors.input.placeholder}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        renderItem={renderMember}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent.primary} />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon={<Ionicons name="people-outline" size={48} color={theme.colors.text.muted} />}
              title={search ? 'Brak wyników' : 'Brak członków'}
              description={search ? 'Spróbuj innego wyszukiwania' : ''}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 28,
    top: 22,
    zIndex: 1,
  },
  searchInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 40,
    paddingRight: 16,
    fontSize: 15,
    fontFamily: 'Inter',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
