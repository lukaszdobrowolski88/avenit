import { RefreshControl, type RefreshControlProps } from 'react-native';
import { usePullRefresh } from '../../lib/usePullRefresh';

type Props = Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & {
  onRefresh: () => Promise<unknown> | unknown;
};

/**
 * RefreshControl, który pokazuje kręciołek tylko przy odświeżeniu gestem (pociągnięcie listy),
 * a nie przy odświeżeniach w tle (isRefetching). Szczegóły: src/lib/usePullRefresh.ts.
 * Reszta propsów (style i dziecko-lista, które ScrollView podaje na Androidzie) — bez zmian.
 */
export function PullToRefresh({ onRefresh, ...rest }: Props) {
  const pull = usePullRefresh(onRefresh);
  return <RefreshControl {...rest} refreshing={pull.refreshing} onRefresh={pull.onRefresh} />;
}
