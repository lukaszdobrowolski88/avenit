import { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Minus, Plus } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { DateField } from '../../../components/ui/DateField';
import { Chip, DangerLink, FormInput, FormLabel, PrimaryButton, Sheet } from '../../../components/ui/Sheet';
import { pickImageForTask, takePhotoForTask, type PickedAsset } from '../../dashboard/task-attachments';
import { CONDITIONS, useDeleteEquipment, useSaveEquipment } from '../equipment';
import type { EquipmentItem } from '../data';

// Sprzęt zespołu — formularz jak na webie (EquipmentTab): zdjęcie, nazwa, stan, ilość,
// wartość jednostkowa, osoba odpowiedzialna, data zakupu, opis i notatki.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

export const EquipmentSheet = ({
  visible,
  team,
  item,
  people,
  myEmail,
  canDelete,
  onClose,
}: {
  visible: boolean;
  team: string;
  item: EquipmentItem | null; // null = nowy sprzęt
  people: string[]; // podpowiedzi „Odpowiedzialny”
  myEmail: string | null;
  canDelete: boolean;
  onClose: () => void;
}) => {
  const save = useSaveEquipment(team, myEmail);
  const del = useDeleteEquipment(team);
  const [name, setName] = useState('');
  const [condition, setCondition] = useState('dobry');
  const [quantity, setQuantity] = useState(1);
  const [value, setValue] = useState('');
  const [responsible, setResponsible] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<PickedAsset | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? '');
    setCondition(item?.condition ?? 'dobry');
    setQuantity(item?.quantity ?? 1);
    setValue(item?.unitValue != null ? String(item.unitValue).replace('.', ',') : '');
    setResponsible(item?.responsible ?? '');
    setPurchaseDate(item?.purchaseDate ?? '');
    setDescription(item?.description ?? '');
    setNotes(item?.notes ?? '');
    setPhoto(null);
    setPhotoUrl(item?.photoUrl ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const choosePhoto = () => {
    const run = async (from: 'camera' | 'library') => {
      try {
        const a = from === 'camera' ? await takePhotoForTask() : await pickImageForTask();
        if (a) setPhoto(a);
      } catch (e: any) {
        Alert.alert('Nie udało się dodać zdjęcia', e?.message ?? '');
      }
    };
    const hasPhoto = !!(photo || photoUrl);
    const options = ['Zrób zdjęcie', 'Wybierz z galerii', ...(hasPhoto ? ['Usuń zdjęcie'] : []), 'Anuluj'];
    const handle = (i: number) => {
      if (i === 0) run('camera');
      else if (i === 1) run('library');
      else if (hasPhoto && i === 2) {
        setPhoto(null);
        setPhotoUrl(null);
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: hasPhoto ? 2 : undefined },
        handle,
      );
    } else {
      Alert.alert('Zdjęcie sprzętu', undefined, [
        ...options.slice(0, -1).map((o, i) => ({ text: o, onPress: () => handle(i) })),
        { text: 'Anuluj', style: 'cancel' as const },
      ]);
    }
  };

  const submit = () => {
    const n = name.trim();
    if (!n) return Alert.alert('Podaj nazwę sprzętu');
    const v = value.trim().replace(/\s/g, '').replace(',', '.');
    if (v && !(Number(v) >= 0)) return Alert.alert('Wartość', 'Podaj kwotę, np. 450 albo 99,90.');
    save.mutate(
      {
        item,
        input: {
          name: n,
          description: description.trim() || null,
          quantity,
          unitValue: v ? Math.round(Number(v) * 100) / 100 : null,
          responsible: responsible.trim() || null,
          condition,
          purchaseDate: purchaseDate || null,
          notes: notes.trim() || null,
          photo,
          photoUrl,
        },
      },
      { onSuccess: onClose, onError: (e: any) => Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.') },
    );
  };

  const remove = () =>
    Alert.alert('Usunąć sprzęt?', `„${item?.name}” zniknie z listy wyposażenia.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => del.mutate(item!.id, { onSuccess: onClose, onError: (e: any) => Alert.alert('Nie udało się usunąć', e?.message ?? 'Spróbuj ponownie.') }),
      },
    ]);

  const preview = photo?.uri ?? photoUrl;
  const suggestions = people.filter((p) => p !== responsible).slice(0, 8);

  return (
    <Sheet
      visible={visible}
      eyebrow={item ? 'Wyposażenie' : 'Nowy sprzęt'}
      title={item ? item.name : 'Dodaj sprzęt'}
      onClose={onClose}
      footer={<PrimaryButton label={item ? 'Zapisz' : 'Dodaj sprzęt'} busy={save.isPending} onPress={submit} />}
    >
      <Pressable
        onPress={choosePhoto}
        className="active:opacity-80"
        style={{ height: 168, borderRadius: 22, backgroundColor: B.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 6 }}
      >
        {preview ? (
          <Image source={{ uri: preview }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={21} color={B.ink2} />
            </View>
            <Text style={{ fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>Dodaj zdjęcie</Text>
          </View>
        )}
      </Pressable>

      <FormLabel>Nazwa</FormLabel>
      <FormInput value={name} onChangeText={setName} placeholder="np. Mikrofon Shure SM58" />

      <FormLabel>Stan</FormLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {CONDITIONS.map((c) => (
          <Chip key={c.key} label={c.label} on={condition === c.key} onPress={() => setCondition(c.key)} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <FormLabel>Ilość</FormLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 14, backgroundColor: B.card, paddingHorizontal: 6 }}>
            <Pressable onPress={() => setQuantity((q) => Math.max(1, q - 1))} hitSlop={6} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
              <Minus size={17} color={quantity > 1 ? B.ink : B.ink4} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, color: B.ink, fontFamily: F.bold }}>{quantity}</Text>
            <Pressable onPress={() => setQuantity((q) => q + 1)} hitSlop={6} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={17} color={B.ink} />
            </Pressable>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <FormLabel>Wartość za szt. (zł)</FormLabel>
          <FormInput value={value} onChangeText={setValue} placeholder="np. 450" keyboardType="decimal-pad" />
        </View>
      </View>

      <FormLabel>Odpowiedzialny</FormLabel>
      <FormInput value={responsible} onChangeText={setResponsible} placeholder="Kto dba o ten sprzęt" />
      {suggestions.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {suggestions.map((p) => (
            <Chip key={p} label={p} on={false} onPress={() => setResponsible(p)} />
          ))}
        </View>
      ) : null}

      <FormLabel>Data zakupu</FormLabel>
      <DateField value={purchaseDate} onChange={setPurchaseDate} optional placeholder="Nie podano" />

      <FormLabel>Opis</FormLabel>
      <FormInput value={description} onChangeText={setDescription} placeholder="Model, numer seryjny, do czego służy" multiline />

      <FormLabel>Notatki</FormLabel>
      <FormInput value={notes} onChangeText={setNotes} placeholder="Np. gdzie leży, co wymaga uwagi" multiline />

      {item && canDelete ? <DangerLink label="Usuń sprzęt" onPress={remove} busy={del.isPending} /> : null}
    </Sheet>
  );
};
