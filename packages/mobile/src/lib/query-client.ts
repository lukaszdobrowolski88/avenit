import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Wersja zapisanego cache: zmień przy niekompatybilnej zmianie kształtu danych zapytań —
// po aktualizacji apki stary cache z dysku zostanie odrzucony zamiast wysypać nowy kod.
export const QUERY_CACHE_BUSTER = '2026-10-04-kalendarz';

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'avenit.query-cache.v1',
  throttleTime: 1000,
});
