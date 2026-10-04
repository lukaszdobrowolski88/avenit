import type { ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';

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

const Body = ({
  Icon,
  iconTint = '#8A6606',
  iconBg = '#FFF8E1',
  title,
  description,
}: BaseProps) => (
  <View className="flex-row items-center gap-3 flex-1">
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: iconBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={18} color={iconTint} strokeWidth={2.2} />
    </View>
    <View className="flex-1">
      <Text
        className="text-[15px]"
        style={{
          color: '#2A2312',
          letterSpacing: -0.2,
          fontFamily: 'Manrope_500Medium',
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          className="text-[12px] mt-0.5"
          style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
        >
          {description}
        </Text>
      ) : null}
    </View>
  </View>
);

export const SettingsRow = (props: Props) => {
  if (props.variant === 'toggle') {
    return (
      <View
        className="flex-row items-center px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: '#ECE8DE' }}
      >
        <Body {...props} />
        <Switch
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={props.disabled}
          trackColor={{ true: '#FFBE0B', false: '#E3DDD0' }}
          thumbColor="#ffffff"
          ios_backgroundColor="#E3DDD0"
        />
      </View>
    );
  }
  if (props.variant === 'nav') {
    return (
      <Pressable
        onPress={props.onPress}
        className="flex-row items-center px-4 py-3 active:opacity-70"
        style={{ borderBottomWidth: 1, borderBottomColor: '#ECE8DE' }}
      >
        <Body {...props} />
        {props.rightElement ?? <ChevronRight size={18} color="#857F70" />}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={props.onPress}
      className="flex-row items-center px-4 py-3 active:opacity-70"
    >
      <Body
        {...props}
        iconTint={props.destructive ? '#e11d48' : props.iconTint}
        iconBg={props.destructive ? '#ffe4e6' : props.iconBg}
      />
    </Pressable>
  );
};

export const SettingsGroup = ({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) => (
  <View className="mb-4">
    {title ? (
      <Text
        className="text-[11px] uppercase mx-5 mb-2"
        style={{
          color: '#8A6606',
          letterSpacing: 0.6,
          fontFamily: 'Manrope_700Bold',
        }}
      >
        {title}
      </Text>
    ) : null}
    <View
      className="mx-4"
      style={{
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
      }}
    >
      <View
        className="overflow-hidden"
        style={{
          borderRadius: 20,
        }}
      >
        {children}
      </View>
    </View>
  </View>
);
