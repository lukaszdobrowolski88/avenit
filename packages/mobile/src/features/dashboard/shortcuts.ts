import { useMemo } from 'react';
import type { useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { openModule, useModules } from '../modules/useModules';
import type { ItemsConfig } from './layout';

// Katalog skrótów „Dla Ciebie”: osobiste skróty (domyślnie widoczne) + wszystkie moduły
// dostępne dla tej osoby (domyślnie ukryte — dodaje się je w Konto → Pulpit).
export interface Shortcut {
  key: string; // osobiste: klucz wpisu; moduły: `mod:<klucz modułu>`
  label: string;
  short: string;
  Icon: LucideIcon;
  kind: 'personal' | 'module';
  open: (router: ReturnType<typeof useRouter>) => void;
}

export const useShortcutCatalog = () => {
  const { personal, items, ready } = useModules();
  const catalog = useMemo((): Shortcut[] => {
    const own: Shortcut[] = personal
      .filter((p) => p.key !== 'notifications') // dzwonek jest w nagłówku pulpitu
      .map((p) => ({
        key: p.key,
        label: p.label,
        short: p.short,
        Icon: p.Icon,
        kind: 'personal' as const,
        open: (router) => router.push(p.route as never),
      }));
    const mods: Shortcut[] = items.map((m) => ({
      key: `mod:${m.key}`,
      label: m.label,
      short: m.label,
      Icon: m.Icon,
      kind: 'module' as const,
      open: (router) => openModule(m, router),
    }));
    return [...own, ...mods];
  }, [personal, items]);
  return { catalog, ready };
};

export const isShortcutVisible = (s: Shortcut, cfg: ItemsConfig) =>
  s.kind === 'personal' ? !cfg.hidden.includes(s.key) : (cfg.added ?? []).includes(s.key);

// Widoczne skróty w kolejności z ustawień (pozostałe — w kolejności katalogu).
export const visibleShortcuts = (catalog: Shortcut[], cfg: ItemsConfig): Shortcut[] => {
  const visible = catalog.filter((s) => isShortcutVisible(s, cfg));
  if (!cfg.order) return visible;
  const rank = new Map(cfg.order.map((k, i) => [k, i]));
  return visible
    .map((s, i) => ({ s, r: rank.has(s.key) ? rank.get(s.key)! : cfg.order!.length + i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s);
};
