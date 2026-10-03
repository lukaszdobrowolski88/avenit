import { useMemo } from 'react';
import { Alert, Linking } from 'react-native';
import type { useRouter } from 'expo-router';
import { supabase, tenantWebBase } from '../../lib/supabase';
import { usePermissions } from '../../lib/permissions';
import {
  HIDDEN_MODULE_KEYS,
  MODULE_REGISTRY,
  PERSONAL_ENTRIES,
  SECTION_LABELS,
  customModuleEntry,
  type ModuleEntry,
  type ModuleSection,
  type PersonalEntry,
} from './registry';

export interface ModuleItem extends ModuleEntry {
  isWeb: boolean;
  order: number;
}

export interface ModuleGroup {
  section: ModuleSection;
  title: string;
  items: ModuleItem[];
}

const SECTION_ORDER: ModuleSection[] = ['community', 'teams', 'manage'];

// Menu modułów jak sidebar weba: kolejność i nazwy z app_modules (ustawienia kościoła),
// tylko widoczne dla tej osoby. Moduły z kreatora też — otwierane na webie.
export const useModules = () => {
  const perms = usePermissions();

  const items = useMemo((): ModuleItem[] => {
    const out: ModuleItem[] = [];
    const push = (entry: ModuleEntry, label: string, order: number) =>
      out.push({ ...entry, label, isWeb: !entry.route, order });

    if (perms.modules.length > 0) {
      for (const mod of perms.modules) {
        if (HIDDEN_MODULE_KEYS.has(mod.key) || !mod.visible) continue;
        const reg = MODULE_REGISTRY[mod.key];
        const entry = reg ?? customModuleEntry(mod.key, mod.label, mod.path);
        const order = mod.display_order ?? 999;
        push(entry, mod.label || entry.label, order);
        if (mod.key === 'worship') push(MODULE_REGISTRY.songs, MODULE_REGISTRY.songs.label, order + 0.1);
      }
    } else {
      // Bez listy modułów (tryb awaryjny / stary backend) — rejestr + uprawnienia.
      let i = 0;
      for (const entry of Object.values(MODULE_REGISTRY)) {
        const gateKey = entry.key === 'songs' ? 'worship' : entry.key;
        if (perms.moduleVisible(gateKey)) push(entry, entry.label, i);
        i += 1;
      }
    }
    return out.sort((a, b) => a.order - b.order);
  }, [perms.modules, perms.moduleVisible]);

  const groups = useMemo(
    (): ModuleGroup[] =>
      SECTION_ORDER.map((section) => ({
        section,
        title: SECTION_LABELS[section],
        items: items.filter((it) => it.section === section),
      })).filter((g) => g.items.length > 0),
    [items],
  );

  const personal = useMemo(
    (): PersonalEntry[] =>
      PERSONAL_ENTRIES.filter((p) => !p.requiresModule || perms.moduleVisible(p.requiresModule)),
    [perms.moduleVisible],
  );

  return { ready: perms.ready, items, groups, personal, perms };
};

// Otwiera stronę weba tenanta jako zalogowany (jednorazowy bilet SSO z /api/fn/web-ticket).
// Gdy bilet się nie uda (stary backend) — zwykły link; web poprosi o logowanie.
export const openOnWeb = async (path: string) => {
  let url = `${tenantWebBase()}${path}`;
  try {
    const { data, error } = await supabase.functions.invoke('web-ticket', { body: { path } });
    const ticketUrl = (data as { url?: string } | null)?.url;
    if (!error && ticketUrl) url = ticketUrl;
  } catch {
    /* zostaje zwykły link */
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Nie udało się otworzyć', 'Spróbuj ponownie albo otwórz stronę kościoła w przeglądarce.');
  }
};

export const openModule = (
  item: Pick<ModuleItem, 'route' | 'webPath'>,
  router: ReturnType<typeof useRouter>,
) => {
  if (item.route) router.push(item.route as never);
  else void openOnWeb(item.webPath);
};
