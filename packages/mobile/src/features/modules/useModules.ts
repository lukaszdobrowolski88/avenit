import { useMemo } from 'react';
import { Alert, Linking } from 'react-native';
import type { useRouter } from 'expo-router';
import { supabase, tenantWebBase } from '../../lib/supabase';
import { usePermissions } from '../../lib/permissions';
import {
  HIDDEN_MODULE_KEYS,
  MODULE_REGISTRY,
  PERSONAL_ENTRIES,
  customModuleEntry,
  type ModuleEntry,
  type PersonalEntry,
} from './registry';
import { HIDDEN_NAV_KEYS, NOT_IN_GROUPS, groupNavItems, groupOf, normalizeModuleLabel, type NavGroupId } from './nav';
import { goToTab, type TabName } from '../../lib/navigation';

export interface ModuleItem extends ModuleEntry {
  isWeb: boolean;
  order: number;
  // Grupa jak w menu weba (Start / Ludzie / Służby / Komunikacja / Finanse / Narzędzia / Moje moduły).
  group: NavGroupId;
}

export interface ModuleGroup {
  id: NavGroupId;
  title: string;
  items: ModuleItem[];
}

// Menu modułów jak menu weba: grupy z navConfig, w grupie kolejność wg app_modules.display_order,
// nazwy z app_modules (po normalizeModuleLabel), tylko widoczne dla tej osoby. Aliasy
// care/sermons (zakładki Członków / Nauczania) ukryte. Moduły z kreatora → „Moje moduły”.
// `items` — płaska lista (bez Pulpitu i Ustawień), `settings` — pozycja „Ustawienia” osobno.
export const useModules = () => {
  const perms = usePermissions();

  const all = useMemo((): ModuleItem[] => {
    const out: ModuleItem[] = [];
    const push = (entry: ModuleEntry, label: string, order: number) =>
      out.push({ ...entry, label, isWeb: !entry.route, order, group: groupOf(entry.key) });

    if (perms.modules.length > 0) {
      for (const mod of perms.modules) {
        if (HIDDEN_MODULE_KEYS.has(mod.key) || HIDDEN_NAV_KEYS.has(mod.key) || !mod.visible) continue;
        const reg = MODULE_REGISTRY[mod.key];
        const entry = reg ?? customModuleEntry(mod.key, normalizeModuleLabel(mod.label), mod.path);
        const order = mod.display_order ?? 999;
        push(entry, normalizeModuleLabel(mod.label) || entry.label, order);
        if (mod.key === 'worship') push(MODULE_REGISTRY.songs, MODULE_REGISTRY.songs.label, order + 0.1);
      }
    } else {
      // Bez listy modułów (tryb awaryjny / stary backend) — rejestr + uprawnienia.
      let i = 0;
      for (const entry of Object.values(MODULE_REGISTRY)) {
        if (HIDDEN_MODULE_KEYS.has(entry.key) || HIDDEN_NAV_KEYS.has(entry.key)) continue;
        const gateKey = entry.key === 'songs' ? 'worship' : entry.key;
        if (perms.moduleVisible(gateKey)) push(entry, entry.label, i);
        i += 1;
      }
    }
    return out.sort((a, b) => a.order - b.order);
  }, [perms.modules, perms.moduleVisible]);

  const items = useMemo(() => all.filter((it) => !NOT_IN_GROUPS.has(it.key)), [all]);
  const settings = useMemo(() => all.find((it) => it.key === 'settings') ?? null, [all]);

  const groups = useMemo(
    (): ModuleGroup[] => groupNavItems(items).map((g) => ({ id: g.id, title: g.label, items: g.items })),
    [items],
  );

  const personal = useMemo(
    (): PersonalEntry[] =>
      PERSONAL_ENTRIES.filter((p) => !p.requiresModule || perms.moduleVisible(p.requiresModule)),
    [perms.moduleVisible],
  );

  return { ready: perms.ready, items, groups, settings, personal, perms };
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
    Alert.alert('Nie udało się otworzyć strony', 'Spróbuj ponownie albo otwórz stronę kościoła w przeglądarce.');
  }
};

export const openModule = (
  item: Pick<ModuleItem, 'route' | 'webPath'>,
  router: ReturnType<typeof useRouter>,
) => {
  // Moduły będące zakładkami (Wydarzenia, Komunikator) — przejście do zakładki, nie push na stos.
  const tab = item.route?.match(/^\/\(app\)\/(calendar|messenger)$/)?.[1] as TabName | undefined;
  if (tab) goToTab(router, tab);
  else if (item.route) router.push(item.route as never);
  else void openOnWeb(item.webPath);
};
