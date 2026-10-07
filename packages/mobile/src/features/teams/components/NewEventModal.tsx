import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { B } from '../../../components/ui/brand';
import { Chip, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { DateField, TimeField, toYmd } from '../../../components/ui/DateField';
import { validateEventForm, type EventFormErrors, type EventTypeOption } from '../data';

// Nowe wydarzenie zespołu — jak „Nowe wydarzenie” w zakładce Wydarzenia na webie:
// tytuł i data wymagane (komunikat przy polu), koniec musi być po początku. Nabożeństwa
// i wspólne wydarzenia tworzy się w Kalendarzu — tutaj próby, spotkania, wyjazdy zespołu.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold' } as const;

export interface NewEventInput {
  title: string;
  description: string | null;
  eventType: string;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  // Rzuca błąd przy nieudanym zapisie (okno zostaje otwarte z wpisanymi danymi).
  onSubmit: (input: NewEventInput) => Promise<void>;
  isLoading: boolean;
  eventTypes: EventTypeOption[];
  defaultType: string;
}

const FieldError = ({ text }: { text?: string }) =>
  text ? (
    <Text accessibilityRole="alert" style={{ marginTop: 6, marginLeft: 2, fontSize: 13, color: '#B42318', fontFamily: F.semibold }}>
      {text}
    </Text>
  ) : null;

export const NewEventModal = ({ visible, onClose, onSubmit, isLoading, eventTypes, defaultType }: Props) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState(defaultType);
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(toYmd(new Date()));
  const [time, setTime] = useState('18:00');
  const [endTime, setEndTime] = useState('');
  const [errors, setErrors] = useState<EventFormErrors>({});

  // Czysty formularz przy każdym otwarciu.
  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDescription('');
    setType(defaultType);
    setLocation('');
    setDate(toYmd(new Date()));
    setTime('18:00');
    setEndTime('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = async () => {
    const errs = validateEventForm({ title, date, time: time || null, endTime: endTime || null });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      eventType: type || defaultType,
      date,
      time: time || null,
      endTime: endTime || null,
      location: location.trim() || null,
    });
  };

  return (
    <Sheet
      visible={visible}
      title="Nowe wydarzenie"
      subtitle="Próba, spotkanie albo wyjazd zespołu. Nabożeństwa dodajesz w Kalendarzu."
      onClose={onClose}
      footer={<PrimaryButton label="Zapisz wydarzenie" onPress={submit} busy={isLoading} />}
    >
      <FormLabel first>Tytuł</FormLabel>
      <FormInput
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (errors.title && t.trim()) setErrors((e) => ({ ...e, title: undefined }));
        }}
        placeholder="np. Próba przed niedzielą"
        accessibilityLabel="Tytuł wydarzenia"
        style={errors.title ? { borderColor: '#B42318' } : undefined}
      />
      <FieldError text={errors.title} />

      {eventTypes.length ? (
        <>
          <FormLabel>Typ</FormLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {eventTypes.map((t) => (
              <Chip key={t.key} label={t.label} on={type === t.key} onPress={() => setType(t.key)} />
            ))}
          </View>
        </>
      ) : null}

      <FormLabel>Data</FormLabel>
      <DateField value={date} onChange={setDate} />
      <FieldError text={errors.date} />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <FormLabel>Początek</FormLabel>
          <TimeField value={time} onChange={setTime} title="Początek" optional />
        </View>
        <View style={{ flex: 1 }}>
          <FormLabel>Koniec</FormLabel>
          <TimeField
            value={endTime}
            onChange={(v) => {
              setEndTime(v);
              if (errors.endTime) setErrors((e) => ({ ...e, endTime: undefined }));
            }}
            title="Koniec"
            from={time || null}
            placeholder="opcjonalnie"
            optional
          />
        </View>
      </View>
      <FieldError text={errors.endTime} />

      <FormLabel>Miejsce</FormLabel>
      <FormInput value={location} onChangeText={setLocation} placeholder="np. Sala główna (opcjonalnie)" />

      <FormLabel>Opis</FormLabel>
      <FormInput value={description} onChangeText={setDescription} placeholder="Dodatkowe informacje dla zespołu (opcjonalnie)" multiline />

      <Text style={{ marginTop: 12, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: F.medium }}>
        Wydarzenie zobaczy cały zespół — w aplikacji i na webie.
      </Text>
    </Sheet>
  );
};
