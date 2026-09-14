import { supabase } from '../../lib/supabase';

const MATERIALS_TEAM = 'homegroups';

// Zapewnia folder materiałów grupy domowej (materials_folders, team_type='homegroups') powiązany
// z grupą (home_groups.materials_folder_id) i udostępniony całej grupie (materials_shares
// target_type='home_group'). Zwraca folderId. Idempotentne. `group` = { id, name, materials_folder_id }.
export async function ensureGroupFolder(group) {
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email || null;
  let folderId = group.materials_folder_id || null;

  if (!folderId) {
    const { data: existing } = await supabase.from('materials_folders')
      .select('id').eq('team_type', MATERIALS_TEAM).eq('name', group.name).is('parent_id', null).limit(1);
    if (existing && existing[0]) {
      folderId = existing[0].id;
    } else {
      const { data: created, error: cErr } = await supabase.from('materials_folders')
        .insert({ name: group.name, parent_id: null, team_type: MATERIALS_TEAM, created_by: email })
        .select().single();
      if (cErr) throw cErr;
      folderId = created.id;
    }
    await supabase.from('home_groups').update({ materials_folder_id: folderId }).eq('id', group.id);
  }

  try {
    const { data: sh } = await supabase.from('materials_shares')
      .select('id').eq('folder_id', folderId).eq('target_type', 'home_group').eq('target_id', String(group.id)).limit(1);
    if (!sh || !sh[0]) {
      await supabase.from('materials_shares').insert({
        folder_id: folderId, file_id: null, target_type: 'home_group',
        target_id: String(group.id), target_label: group.name, permission: 'view', created_by: email,
      });
    }
  } catch { /* udostępnienie best-effort */ }

  return folderId;
}
