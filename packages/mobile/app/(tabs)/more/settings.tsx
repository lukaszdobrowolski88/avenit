import { ScrollView, View, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR_PRESETS } from '@schtomy/shared';
import { ThemedText } from '../../../src/components/ThemedText';
import { Card } from '../../../src/components/Card';
import { useTheme } from '../../../src/contexts/ThemeContext';

export default function SettingsScreen() {
  const { theme, isDark, toggleDarkMode, presetKey, setPreset } = useTheme();

  const presetEntries = Object.entries(COLOR_PRESETS) as [string, { label: string; preview: string[] }][];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background.primary }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Dark mode */}
      <Card>
        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={theme.colors.accent.primary} />
            <ThemedText size="base" weight="medium" style={styles.settingText}>
              Tryb ciemny
            </ThemedText>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleDarkMode}
            trackColor={{ true: theme.colors.accent.primary, false: '#d1d5db' }}
            thumbColor="#ffffff"
          />
        </View>
      </Card>

      {/* Kolory */}
      <Card>
        <ThemedText size="base" weight="semibold" style={styles.sectionTitle}>
          Motyw kolorystyczny
        </ThemedText>
        <View style={styles.presetsGrid}>
          {presetEntries.map(([key, preset]) => {
            const isActive = presetKey === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.presetItem,
                  isActive && { borderColor: theme.colors.accent.primary, borderWidth: 2 },
                  { backgroundColor: theme.colors.background.tertiary },
                ]}
                onPress={() => setPreset(key)}
                activeOpacity={0.7}
              >
                <View style={styles.presetColors}>
                  <View style={[styles.presetDot, { backgroundColor: preset.preview[0] }]} />
                  <View style={[styles.presetDot, { backgroundColor: preset.preview[1] }]} />
                </View>
                <ThemedText size="xs" weight={isActive ? 'bold' : 'normal'} style={styles.presetLabel}>
                  {preset.label}
                </ThemedText>
                {isActive && (
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.accent.primary} style={styles.checkmark} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Info */}
      <Card>
        <ThemedText size="base" weight="semibold" style={styles.sectionTitle}>
          O aplikacji
        </ThemedText>
        <View style={styles.infoRow}>
          <ThemedText variant="secondary" size="sm">Wersja</ThemedText>
          <ThemedText size="sm" weight="medium">1.0.0</ThemedText>
        </View>
        <View style={styles.infoRow}>
          <ThemedText variant="secondary" size="sm">Aplikacja</ThemedText>
          <ThemedText size="sm" weight="medium">SCH TOMY</ThemedText>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingText: {},
  sectionTitle: {
    marginBottom: 12,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetItem: {
    borderRadius: 12,
    padding: 12,
    width: '47%',
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
  },
  presetColors: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  presetDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  presetLabel: {
    textAlign: 'left',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
});
