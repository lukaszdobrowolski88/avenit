import { Children, isValidElement, type ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { B } from './brand';

interface BaseProps {
  Icon: LucideIcon;
  iconTint?: string;
  iconBg?: string;
  title: string;
  description?: string;
  // Ustawiane przez SettingsGroup — ostatni wiersz bez kreski.
  last?: boolean;
}

interface ToggleProps extends BaseProps {
  variant: 'toggle';
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

interface NavProps extends BaseProps {
  variant: 'nav';
  onPress: () => void;
  rightElement?: ReactNode;
}

interface ActionProps extends BaseProps {
  variant: 'action';
  onPress: () => void;
  destructive?: boolean;
}

type Props = ToggleProps | NavProps | ActionProps;

const Body = ({
  Icon,
  iconTint = B.ink,
  iconBg = B.paper2,
  title,
  description,
  titleColor = B.ink,
}: BaseProps & { titleColor?: string }) => (
  <View className="flex-row items-center gap-3 flex-1">
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: iconBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={18} color={iconTint} strokeWidth={2.1} />
    </View>
    <View className="flex-1">
      <Text style={{ fontSize: 15, color: titleColor, letterSpacing: -0.2, fontFamily: 'Manrope_600SemiBold' }}>{title}</Text>
      {description ? (
        <Text style={{ fontSize: 12, lineHeight: 17, marginTop: 2, color: B.ink3, fontFamily: 'Manrope_500Medium' }}>
          {description}
        </Text>
      ) : null}
    </View>
  </View>
);

const divider = (last?: boolean) => (last ? null : { borderBottomWidth: 1, borderBottomColor: B.line });

export const SettingsRow = (props: Props) => {
  if (props.variant === 'toggle') {
    return (
      <View className="flex-row items-center px-4 py-3" style={divider(props.last)}>
        <Body {...props} />
        <Switch
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={props.disabled}
          accessibilityLabel={props.title}
          trackColor={{ true: B.kurkuma, false: B.fieldBorder }}
          thumbColor="#ffffff"
          ios_backgroundColor={B.fieldBorder}
        />
      </View>
    );
  }
  if (props.variant === 'nav') {
    return (
      <Pressable
        onPress={props.onPress}
        accessibilityRole="button"
        accessibilityLabel={props.description ? `${props.title}. ${props.description}` : props.title}
        className="flex-row items-center px-4 py-3 active:opacity-70"
        style={divider(props.last)}
      >
        <Body {...props} />
        {props.rightElement ?? <ChevronRight size={18} color={B.ink4} />}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      className="flex-row items-center px-4 py-3 active:opacity-70"
      style={divider(props.last)}
    >
      <Body
        {...props}
        iconTint={props.destructive ? B.danger : props.iconTint}
        iconBg={props.destructive ? B.dangerBg : props.iconBg}
        titleColor={props.destructive ? B.danger : B.ink}
      />
    </Pressable>
  );
};

// Grupa ustawień: musztardowa etykieta (zdanie, nie Title Case) + biała karta z wierszami.
export const SettingsGroup = ({
  title,
  hint,
  children,
}: {
  title?: string;
  // Krótkie wyjaśnienie pod kartą.
  hint?: string;
  children: ReactNode;
}) => {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View className="mb-5">
      {title ? (
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 12,
            marginHorizontal: 20,
            marginBottom: 8,
            color: B.gold,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            fontFamily: 'Manrope_700Bold',
          }}
        >
          {title}
        </Text>
      ) : null}
      <View className="mx-4" style={{ borderRadius: 20, backgroundColor: B.card, overflow: 'hidden' }}>
        {items.map((child, i) =>
          i === items.length - 1 && child.type === SettingsRow
            ? { ...child, props: { ...(child.props as object), last: true } }
            : child,
        )}
      </View>
      {hint ? (
        <Text style={{ marginHorizontal: 20, marginTop: 8, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
};
