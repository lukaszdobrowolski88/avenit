import type { Router } from 'expo-router';

// Pomocniki nawigacji dla układu: zakładki (app)/(tabs) + jeden wspólny stos nad nimi.

export type TabName = 'dashboard' | 'calendar' | 'messenger' | 'modules' | 'account';

type RouteLike = { name: string; params?: object; state?: StateLike };
type StateLike = { index?: number; routes?: RouteLike[] } | undefined;

// Odczyt ze stanu korzenia: czy nad zakładkami nic nie jest otwarte i która zakładka jest pod spodem.
export const readTabsState = (root: StateLike): { onTabs: boolean; active: TabName } => {
  const app = root?.routes?.find((r) => r.name === '(app)')?.state;
  const routes = app?.routes ?? [];
  const focused = routes[app?.index ?? routes.length - 1];
  const tabsRoute = routes.find((r) => r.name === '(tabs)');
  const tabs = tabsRoute?.state;
  const tab = tabs?.routes?.[tabs.index ?? 0]?.name ?? (tabsRoute?.params as { screen?: string } | undefined)?.screen;
  return { onTabs: !focused || focused.name === '(tabs)', active: (tab ?? 'dashboard') as TabName };
};

// Aktualizowane przez FloatingTabBar (zawsze zamontowany w (app)) przy każdej zmianie nawigacji.
let onTabsNow = true;
export const setOnTabs = (value: boolean) => {
  onTabsNow = value;
};

// Przejście do zakładki: z ekranu na wspólnym stosie cofamy stos do zakładek (POP_TO), na
// zakładkach — zwykła zmiana zakładki. `push`/`navigate` z głębi dołożyłby kolejne zakładki
// na stos (w React Navigation 7 navigate do nie-bieżącego ekranu dokłada nowy).
export const goToTab = (router: Router, tab: TabName) => {
  if (onTabsNow) router.navigate(`/${tab}` as never);
  else router.dismissTo(`/${tab}` as never);
};

// Strzałka „wstecz”: historia; bez niej (np. dziwne wejście z linku) — Start.
export const goBack = (router: Router) => {
  if (router.canGoBack()) router.back();
  else goToTab(router, 'dashboard');
};
