import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Moduły z kreatora (web: src/modules/CustomModule/**). Dane:
//  • module_records — ogłoszenia, linki, kontakty, FAQ, ankiety (kolekcje per zakładka);
//    serwer wymaga filtra/pola module_key (inaczej 400), uprawnienie res:custom_<key>_records:<op>,
//  • tablica zadań modułu (boards.source_kind = custom_<key>_tasks), osoby w custom_<key>_members,
//  • boards.module_key — tablice Projektów przypięte do modułu.

const asList = (d: unknown) => ((d ?? []) as any[]);

export interface ModuleRecord<T = Record<string, any>> {
  id: string;
  data: T;
  createdAt: string | null;
}

// Rekordy kolekcji zakładki — jak useModuleRecords.js (tab_id zawsze, gdy znany).
export const useModuleRecords = <T = Record<string, any>>(moduleKey: string, collectionKey: string, tabId?: string | null) =>
  useQuery({
    queryKey: ['custom', moduleKey, 'records', collectionKey, tabId ?? null],
    queryFn: async (): Promise<ModuleRecord<T>[]> => {
      let q: any = supabase
        .from('module_records')
        .select('*')
        .eq('module_key', moduleKey)
        .eq('collection_key', collectionKey);
      if (tabId) q = q.eq('tab_id', tabId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return asList(data).map((r) => ({
        id: String(r.id),
        data: ((typeof r.data === 'string' ? JSON.parse(r.data) : r.data) ?? {}) as T,
        createdAt: r.created_at ?? null,
      }));
    },
  });

export const useSaveRecord = (moduleKey: string, collectionKey: string, tabId: string | null, moduleId: string | null, userId: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Record<string, any> }) => {
      if (id) {
        const { error } = await (supabase.from('module_records') as any)
          .update({ data, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('module_key', moduleKey);
        if (error) throw new Error(error.message || 'Nie udało się zapisać.');
      } else {
        const { error } = await (supabase.from('module_records') as any).insert({
          module_id: moduleId,
          module_key: moduleKey,
          tab_id: tabId,
          collection_key: collectionKey,
          data,
          created_by: userId,
        });
        if (error) throw new Error(error.message || 'Nie udało się dodać.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom', moduleKey, 'records', collectionKey] }),
  });
};

export const useDeleteRecord = (moduleKey: string, collectionKey: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('module_records').delete().eq('id', id).eq('module_key', moduleKey);
      if (error) throw new Error(error.message || 'Nie udało się usunąć.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom', moduleKey, 'records', collectionKey] }),
  });
};

// ─── Zadania modułu ───
// Zadania żyją na tablicy modułu (boards.source_kind = custom_<key>_tasks) — patrz
// CustomTasksWidget (widgets.tsx) i teams/data.ts useTeamBoard. Stara tabela custom_<key>_tasks
// jest na serwerze tylko do odczytu (źródło jednorazowego importu na tablicę).

// ─── Tablice modułu (boards.module_key) ─────────────────────────────────────

export interface ModuleBoard {
  id: string;
  name: string;
  color: string | null;
}

export const useModuleBoards = (moduleKey: string) =>
  useQuery({
    queryKey: ['custom', moduleKey, 'boards'],
    queryFn: async (): Promise<ModuleBoard[]> => {
      const { data, error } = await supabase
        .from('boards')
        .select('id, name, color, display_order')
        .eq('module_key', moduleKey)
        .eq('is_template', false)
        .eq('is_archived', false)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return asList(data).map((b) => ({ id: String(b.id), name: String(b.name ?? 'Tablica'), color: b.color ?? null }));
    },
  });
