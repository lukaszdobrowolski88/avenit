import { Alert, Platform } from 'react-native';
import * as ExpoCalendar from 'expo-calendar';
import type { AgendaEvent } from './api';

// Zapis wydarzenia w kalendarzu telefonu (iOS: kalendarz domyślny, Android: pierwszy zapisywalny).
export const addToPhoneCalendar = async (
  event: Pick<AgendaEvent, 'title' | 'startsAt' | 'endsAt' | 'allDay' | 'location'>,
  notes?: string | null,
) => {
  try {
    const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Brak dostępu do kalendarza', 'Zezwól na dostęp do kalendarza w ustawieniach, aby zapisać wydarzenie.');
      return;
    }
    let calendarId: string | null = null;
    if (Platform.OS === 'ios') {
      calendarId = (await ExpoCalendar.getDefaultCalendarAsync())?.id ?? null;
    } else {
      const cals = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
      calendarId =
        (cals.find((c) => c.accessLevel === ExpoCalendar.CalendarAccessLevel.OWNER && c.allowsModifications) ??
          cals.find((c) => c.allowsModifications))?.id ?? null;
    }
    if (!calendarId) {
      Alert.alert('Błąd', 'Nie znaleziono kalendarza, do którego można zapisać wydarzenie.');
      return;
    }
    await ExpoCalendar.createEventAsync(calendarId, {
      title: event.title,
      startDate: event.startsAt,
      endDate: event.allDay ? event.startsAt : event.endsAt ?? new Date(event.startsAt.getTime() + 60 * 60_000),
      location: event.location ?? undefined,
      notes: notes ?? undefined,
      allDay: event.allDay,
    });
    Alert.alert('Dodano do kalendarza', 'Wydarzenie zapisano w kalendarzu telefonu.');
  } catch (err) {
    Alert.alert('Błąd', (err as Error)?.message ?? 'Nie udało się zapisać wydarzenia.');
  }
};
