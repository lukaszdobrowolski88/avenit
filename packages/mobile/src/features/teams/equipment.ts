import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantWebBase } from '../../lib/supabase';
import type { PickedAsset } from '../dashboard/task-attachments';
import type { EquipmentItem } from './data';

// Wyposażenie zespołu — zapis jak src/modules/shared/EquipmentTab.jsx:
// equipment {name, description, photo_url, quantity, unit_value, responsible_person,
// condition, purchase_date, notes, team_type}; zdjęcia w buckecie `equipment` pod <team>/.

export const CONDITIONS = [
  { key: 'nowy', label: 'Nowy' },
  { key: 'dobry', label: 'Dobry' },
  { key: 'uszkodzony', label: 'Uszkodzony' },
  { key: 'do_naprawy', label: 'Do naprawy' },
] as const;

export const conditionLabel = (c: string | null) => CONDITIONS.find((x) => x.key === c)?.label ?? c ?? '';

export interface EquipmentInput {
  name: string;
  description: string | null;
  quantity: number;
  unitValue: number | null;
  responsible: string | null;
  condition: string;
  purchaseDate: string | null;
  notes: string | null;
  photo: PickedAsset | null; // nowe zdjęcie do wysłania
  photoUrl: string | null; // obecne (null = usunięte)
}

export const uploadEquipmentPhoto = async (team: string, asset: PickedAsset) => {
  const ext = (asset.fileName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${team}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  // FormData w React Native wysyła plik tylko jako {uri, name, type}.
  const file = { uri: asset.uri, name: asset.fileName, type: asset.mimeType };
  const { error } = await supabase.storage.from('equipment').upload(path, file as never, { upsert: false });
  if (error) throw new Error((error as any)?.message || 'Nie udało się wysłać zdjęcia.');
  const base = tenantWebBase();
  return base ? `${base}/storage/equipment/${path}` : supabase.storage.from('equipment').getPublicUrl(path).data.publicUrl;
};

export const useSaveEquipment = (team: string, myEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, input }: { item: EquipmentItem | null; input: EquipmentInput }) => {
      const photo_url = input.photo ? await uploadEquipmentPhoto(team, input.photo) : input.photoUrl;
      const row = {
        name: input.name,
        description: input.description,
        photo_url,
        quantity: input.quantity,
        unit_value: input.unitValue,
        responsible_person: input.responsible,
        condition: input.condition,
        purchase_date: input.purchaseDate,
        notes: input.notes,
        team_type: team,
      };
      const res = item
        ? await (supabase.from('equipment') as any).update({ ...row, updated_at: new Date().toISOString() }).eq('id', item.id)
        : await (supabase.from('equipment') as any).insert({ ...row, created_by: myEmail });
      if (res.error) throw res.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['team', team, 'equipment'] }),
  });
};

export const useDeleteEquipment = (team: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('equipment').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['team', team, 'equipment'] }),
  });
};
