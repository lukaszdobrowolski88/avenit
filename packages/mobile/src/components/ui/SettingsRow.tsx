import type { ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useDS, font, radius, cardShadow, space } from '../../theme/ds';

interface BaseProps {
  Icon: LucideIcon;
  iconTint?: string;
  iconBg?: string;
  title: string;
  description?: string;
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

const Body = ({ Icon, iconTint, iconBg, title, description }: BaseProps) => {
  const { c } = useDS();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: iconBg ?? c.amberTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={19} color={iconTint ?? c.amberInk} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: c.ink, letterSpacing: -0.2, fontFamily: font.semibold }}>{title}</Text>
        {description ? (
          <Text style={{ fontSize: 12, marginTop: 2, color: c.inkSoft, fontFamily: font.regular }}>{description}</Text>
        ) : null}
      </View>
    </View>
  );
};

export const SettingsRow = (props: Props) => {
  const { c } = useDS();
  const rowBorder = { borderBottomWidth: 1, borderBottomColor: c.line };
  if (props.variant === 'toggle') {
    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 }, rowBorder]}>
        <Body {...props} />
        <Switch
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={props.disabled}
          trackColor={{ true: c.amber, false: c.line }}
          thumbColor="#ffffff"
          ios_backgroundColor={c.line}
        />
      </View>
    );
  }
  if (props.variant === 'nav') {
    return (
      <Pressable onPress={props.onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, opacity: pressed ? 0.7 : 1 }, rowBorder]}>
        <Body {...props} />
        {props.rightElement ?? <ChevronRight size={19} color={c.inkSoft} />}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, opacity: pressed ? 0.7 : 1 })}>
      <Body {...props} iconTint={props.destructive ? '#E5487F' : props.iconTint} iconBg={props.destructive ? c.rose : props.iconBg} />
    </Pressable>
  );
};

export const SettingsGroup = ({ title, children }: { title?: string; children: ReactNode }) => {
  const { dark, c } = useDS();
  return (
    <View style={{ marginBottom: 16 }}>
      {title ? (
        <Text style={{ fontSize: 11, textTransform: 'uppercase', marginHorizontal: space.section, marginBottom: 8, color: c.inkSoft, letterSpacing: 0.6, fontFamily: font.bold }}>
          {title}
        </Text>
      ) : null}
      <View style={[{ marginHorizontal: space.screen, borderRadius: radius.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }, cardShadow(dark)]}>
        {children}
      </View>
    </View>
  );
};
