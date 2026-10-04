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
            color: '#2A2312',
            fontSize: 15,
            fontFamily: 'Manrope_600SemiBold',
            marginBottom: 6,
          }}
        >
          Wkrótce
        </Text>
        <Text
          style={{
            color: '#7A7466',
            fontSize: 13,
            lineHeight: 18,
            fontFamily: 'Manrope_400Regular',
          }}
        >
          Ten moduł jest w przygotowaniu i pojawi się w jednej z najbliższych aktualizacji aplikacji.
        </Text>
      </Card>
      <View style={{ height: 24 }} />
    </ScreenContainer>
  );
}
