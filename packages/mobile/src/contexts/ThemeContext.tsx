import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { Theme, getAccentColors, buildTheme, defaultTheme } from '../theme/colors';
import { supabase } from '../lib/supabase';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleDarkMode: () => void;
  setPreset: (key: string) => void;
  presetKey: string;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
  isDark: false,
  toggleDarkMode: () => {},
  setPreset: () => {},
  presetKey: 'amber-yellow',
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemScheme === 'dark');
  const [presetKey, setPresetKey] = useState('amber-yellow');
  const [theme, setTheme] = useState(defaultTheme);

  // Załaduj preferencje z storage i z bazy (app_settings)
  useEffect(() => {
    (async () => {
      try {
        // Lokalne preferencje
        const savedTheme = await AsyncStorage.getItem('theme');
        const savedPreset = await AsyncStorage.getItem('color_preset');

        const dark = savedTheme === 'dark';
        const preset = savedPreset || 'amber-yellow';

        setIsDark(dark);
        setPresetKey(preset);

        const accent = getAccentColors(preset);
        setTheme(buildTheme(dark, accent));

        // Pobierz preset z app_settings (nadpisuje lokalny jeśli inny)
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'color_preset')
          .maybeSingle();

        if (data?.value && data.value !== preset) {
          const dbPreset = data.value;
          setPresetKey(dbPreset);
          const dbAccent = getAccentColors(dbPreset);
          setTheme(buildTheme(dark, dbAccent));
          await AsyncStorage.setItem('color_preset', dbPreset);
        }
      } catch (err) {
        console.error('Error loading theme:', err);
      }
    })();
  }, []);

  const toggleDarkMode = useCallback(async () => {
    setIsDark(prev => {
      const next = !prev;
      const accent = getAccentColors(presetKey);
      setTheme(buildTheme(next, accent));
      AsyncStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }, [presetKey]);

  const setPreset = useCallback(async (key: string) => {
    setPresetKey(key);
    const accent = getAccentColors(key);
    setTheme(buildTheme(isDark, accent));
    await AsyncStorage.setItem('color_preset', key);
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleDarkMode, setPreset, presetKey }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
