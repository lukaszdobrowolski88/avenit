import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { ClipboardList, Clock, ExternalLink, Lock } from 'lucide-react-native';
import { formatRelative } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useForms } from '../../../src/features/forms/api';

export default function FormsScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useForms();

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader title="Formularze" subtitle="Ankiety i zapisy" showBack />

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Inter_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (data ?? []).length === 0 ? (
          <ScrollView
            contentContainerStyle={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
            }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#ecfdf5',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <ClipboardList size={28} color="#059669" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
            >
              Brak aktywnych formularzy
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
            >
              Formularze pojawią się tu kiedy administrator je opublikuje.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            {data!.map((form) => {
              const closed = form.status === 'closed';
              const closesSoon =
                !closed && form.closes_at && new Date(form.closes_at) > new Date();
              const url = `https://app.schtomy.pl/form/${form.id}`;
              return (
                <Pressable
                  key={form.id}
                  onPress={() => Linking.openURL(url)}
                  disabled={closed}
                  className={`mb-3 ${closed ? 'opacity-60' : 'active:opacity-80'}`}
                  style={{
                    borderRadius: 20,
                    backgroundColor: '#ffffff',
                    shadowColor: '#0f172a',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.05,
                    shadowRadius: 14,
                    elevation: 2,
                  }}
                >
                  <View
                    className="overflow-hidden p-4"
                    style={{ borderRadius: 20, borderWidth: 1, borderColor: '#eef0f3' }}
                  >
                    <View className="flex-row items-center gap-3 mb-2">
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: closed ? '#f5f5f4' : '#ecfdf5',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {closed ? (
                          <Lock size={16} color="#78716c" strokeWidth={2.2} />
                        ) : (
                          <ClipboardList size={16} color="#059669" strokeWidth={2.2} />
                        )}
                      </View>
                      <Text
                        className="flex-1 text-[15px]"
                        style={{
                          color: '#0c0a09',
                          letterSpacing: -0.3,
                          fontFamily: 'Inter_700Bold',
                        }}
                      >
                        {form.title}
                      </Text>
                      {!closed ? <ExternalLink size={14} color="#a8a29e" /> : null}
                    </View>
                    {form.description ? (
                      <Text
                        className="text-[13px] mb-2"
                        style={{
                          color: '#57534e',
                          fontFamily: 'Inter_400Regular',
                          lineHeight: 19,
                        }}
                        numberOfLines={3}
                      >
                        {form.description}
                      </Text>
                    ) : null}
                    <View
                      className="flex-row items-center gap-3 pt-2"
                      style={{ borderTopWidth: 1, borderTopColor: '#f5f5f4' }}
                    >
                      {closesSoon ? (
                        <View className="flex-row items-center gap-1">
                          <Clock size={11} color="#d97706" />
                          <Text
                            className="text-[11px]"
                            style={{ color: '#b45309', fontFamily: 'Inter_600SemiBold' }}
                          >
                            Zamykany {formatRelative(form.closes_at!)}
                          </Text>
                        </View>
                      ) : null}
                      {closed ? (
                        <Text
                          className="text-[11px]"
                          style={{ color: '#78716c', fontFamily: 'Inter_600SemiBold' }}
                        >
                          Zamknięty
                        </Text>
                      ) : null}
                      <Text
                        className="text-[11px] ml-auto"
                        style={{ color: '#a8a29e', fontFamily: 'Inter_500Medium' }}
                      >
                        {form.response_count} odpowiedzi
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </>
  );
}
