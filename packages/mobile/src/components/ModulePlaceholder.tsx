import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScreenContainer } from './ui/ScreenContainer';
import { PageHeader } from './ui/PageHeader';
import { Card } from './ui/Card';

interface Props {
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
  showBack?: boolean;
}

// Tymczasowy placeholder dla nowych modułów które nie mają jeszcze ekranu.
// Wszystkie 14 modułów w fazie 5 portu mają realne ekrany — komponent zostaje pod ręką do dalszych iteracji.
export function ModulePlaceholder({ title, subtitle, Icon, showBack }: Props) {
  return (
    <ScreenContainer>
      <PageHeader title={title} subtitle={subtitle} Icon={Icon} showBack={showBack} />
      <Card>
        <Text
          style={{
            color: '#0c0a09',
            fontSize: 15,
            fontFamily: 'Inter_600SemiBold',
            marginBottom: 6,
          }}
        >
          Wkrótce
        </Text>
        <Text
          style={{
            color: '#78716c',
            fontSize: 13,
            lineHeight: 18,
            fontFamily: 'Inter_400Regular',
          }}
        >
          Ten moduł jest w przygotowaniu i pojawi się w jednej z najbliższych aktualizacji aplikacji.
        </Text>
      </Card>
      <View style={{ height: 24 }} />
    </ScreenContainer>
  );
}
