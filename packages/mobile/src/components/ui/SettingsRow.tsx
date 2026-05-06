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
  iconTint = '#ec4899',
  iconBg = '#fef3f2',
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
          color: '#0c0a09',
          letterSpacing: -0.2,
          fontFamily: 'Inter_500Medium',
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          className="text-[12px] mt-0.5"
          style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
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
        style={{ borderBottomWidth: 1, borderBottomColor: '#f5f5f4' }}
      >
        <Body {...props} />
        <Switch
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={props.disabled}
          trackColor={{ true: '#ec4899', false: '#e7e5e4' }}
          thumbColor="#ffffff"
          ios_backgroundColor="#e7e5e4"
        />
      </View>
    );
  }
  if (props.variant === 'nav') {
    return (
      <Pressable
        onPress={props.onPress}
        className="flex-row items-center px-4 py-3 active:opacity-70"
        style={{ borderBottomWidth: 1, borderBottomColor: '#f5f5f4' }}
      >
        <Body {...props} />
        {props.rightElement ?? <ChevronRight size={18} color="#a8a29e" />}
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
          color: '#78716c',
          letterSpacing: 0.6,
          fontFamily: 'Inter_700Bold',
        }}
      >
        {title}
      </Text>
    ) : null}
    <View
      className="mx-4"
      style={{
        borderRadius: 20,
        backgroundColor: '#ffffff',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 2,
      }}
    >
      <View
        className="overflow-hidden"
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#eef0f3',
        }}
      >
        {children}
      </View>
    </View>
  </View>
);
